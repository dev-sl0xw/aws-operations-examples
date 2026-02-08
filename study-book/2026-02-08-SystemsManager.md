# セクション04: Systems Manager
> Well-Architected Pillar: Operational Excellence
> Day: 1 | 難易度: 中級

## 概要

AWS Systems Manager (SSM) は、AWSおよびオンプレミスのインフラストラクチャを一元管理するための包括的な運用管理サービスである。EC2インスタンスへの安全なアクセス、パッチ適用の自動化、構成管理、パラメータの安全な保存、メンテナンスウィンドウの管理など、日常的な運用タスクの大部分をカバーする。

Systems Managerの核心は「SSMエージェント」にある。このエージェントがEC2インスタンスやオンプレミスサーバーにインストールされることで、SSMのあらゆる機能が利用可能になる。Amazon Linux 2/2023、Ubuntu Server、Windows Serverの最新AMIにはSSMエージェントがプリインストールされている。エージェントはSSMサービスエンドポイントにHTTPSでアウトバウンド接続するため、インバウンドポートを開放する必要がない。

運用の観点から、Systems Managerは「手動作業の排除」と「運用のコード化」を実現する中心的なサービスである。Session Managerによる踏み台ホストの排除、Run Commandによるリモートコマンド実行、Patch Managerによる自動パッチ適用、Parameter Storeによる設定の一元管理など、Operational Excellenceの柱を具現化するサービスと言える。

## キーコンセプト

### SSM Agent アーキテクチャ

**定義:** SSM Agentは、EC2インスタンスやオンプレミスサーバーにインストールされるソフトウェアコンポーネント。SSMサービスのAPIエンドポイントに対してHTTPSアウトバウンド接続(ポート443)を確立し、コマンドの受信と結果の送信を行う。

**前提条件:**

| 要件 | 説明 |
|------|------|
| **SSM Agent** | インスタンスにインストールされていること (最新AMIではプリインストール済み) |
| **IAMロール** | インスタンスに `AmazonSSMManagedInstanceCore` ポリシーを含むIAMロールがアタッチされていること |
| **ネットワーク** | SSMサービスエンドポイントへのHTTPSアウトバウンド接続が可能であること |

**ネットワーク要件の詳細:**

```
EC2インスタンス (SSM Agent)
  ↓ HTTPS (443) アウトバウンド
  ↓
  ├── ssm.{region}.amazonaws.com
  ├── ssmmessages.{region}.amazonaws.com  (Session Manager用)
  └── ec2messages.{region}.amazonaws.com  (Run Command用)
```

プライベートサブネットのインスタンスからSSMを使用する場合の選択肢:
1. **NATゲートウェイ/インスタンス** 経由でインターネットアクセス
2. **VPCエンドポイント (PrivateLink)** を作成してプライベート接続 (推奨)

**マネージドインスタンス登録:**
オンプレミスサーバーをSSMで管理するには、「ハイブリッドアクティベーション」を使用する。アクティベーションコードとIDを使ってSSMにサーバーを登録すると、`mi-` プレフィックスのマネージドインスタンスIDが付与される(EC2の場合は `i-` プレフィックス)。

---

### Session Manager

**定義:** Session ManagerはSSMの機能で、EC2インスタンスやオンプレミスサーバーへのブラウザベースまたはCLIベースのシェルアクセスを提供する。SSHキーの管理、踏み台ホストの運用、インバウンドポートの開放が不要になる。

**従来の踏み台ホスト (Bastion Host) アーキテクチャ:**

```
ユーザー → [SSH:22] → 踏み台ホスト (パブリックサブネット)
                          ↓ [SSH:22]
                       ターゲットインスタンス (プライベートサブネット)
```

**Session Manager アーキテクチャ:**

```
ユーザー → [HTTPS:443] → SSM サービスエンドポイント
                            ↓ (SSM Agent がポーリング)
                         ターゲットインスタンス (プライベートサブネット)
```

**主要な利点:**

| 観点 | 踏み台ホスト | Session Manager |
|------|-------------|-----------------|
| ポート開放 | SSH (22) のインバウンド必須 | インバウンド不要 |
| SSH鍵管理 | 必要 (鍵の配布・ローテーション) | 不要 (IAM認証) |
| 踏み台のコスト | EC2インスタンスの維持費 | 追加コストなし |
| アクセスログ | 踏み台のログ + OS設定が必要 | CloudWatch/S3に自動記録 |
| アクセス制御 | SSH鍵 + セキュリティグループ | IAMポリシー |
| OS対応 | Linux (SSHネイティブ) | Linux + Windows |

**監査ログの設定:**

Session Managerのセッションログは以下に保存可能:
- **CloudWatch Logs:** リアルタイム監視、アラーム設定に適する
- **S3:** 長期保存、コスト効率に適する
- ログには全てのコマンド入力と出力が記録される

**IAMによるアクセス制御例:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": [
        "arn:aws:ec2:ap-northeast-1:123456789012:instance/*"
      ],
      "Condition": {
        "StringLike": {
          "ssm:resourceTag/Environment": ["dev"]
        }
      }
    }
  ]
}
```

この例では、`Environment=dev` タグが付いたインスタンスにのみセッション開始を許可する。

**ソクラテス式 深堀り:**
> Q: 「踏み台ホストとは何か?なぜSession Managerに置き換えるべきなのか?」
> A: 踏み台ホスト(Bastion Host)は、パブリックサブネットに配置され、プライベートサブネットのサーバーへのアクセスを中継するサーバーである。全ユーザーがこの1台を経由してアクセスするため、セキュリティの「一点集中型防御」となる。しかし踏み台自体がセキュリティリスクとなる -- (1) SSH鍵の管理負荷、(2) 踏み台ホスト自体への攻撃リスク、(3) ポート22のインバウンド開放が必要、(4) 踏み台のパッチ適用・OS更新の運用負荷。Session Managerはこれら全てを解消する。
> Q: 「Session ManagerはどうやってSSHポートを開放せずにアクセスできるのか?」
> A: SSM AgentがSSMサービスに対してHTTPS (443) でアウトバウンド接続を確立する。つまり、接続はインスタンス側から開始されるため、インバウンドポートの開放が不要。これは、インスタンスがSSMサービスに「新しいコマンドはないか?」と定期的にポーリングする仕組みによる。

**現実世界のたとえ (非IT向け):**
> 「公道と軍事基地の間のセキュリティチェックポイントビル(踏み台ホスト)。全員がこの一つの建物を通過して中に入ります。Session Managerはセキュリティカメラ付きのテレポーテーション -- チェックポイントビル自体が不要になり、直接安全にアクセスできます。しかも全てのアクションが記録されます。チェックポイントビルを維持する費用も人員も不要です」

---

### Run Command

**定義:** Run Commandは、管理対象のインスタンス群に対してSSMドキュメント(コマンドの定義)をリモートで実行する機能。SSH接続なしで、IAM認証に基づいてコマンドを安全に実行できる。

**SSM ドキュメントタイプ:**

| タイプ | 用途 | 実行方法 |
|-------|------|---------|
| **Command** | インスタンス上でシェルコマンドを実行 | Run Command |
| **Automation** | AWSリソースの操作(EC2停止、AMI作成等) | Automation |
| **Policy** | 構成管理ポリシーの適用 | State Manager |
| **Session** | Session Managerのセッション設定 | Session Manager |

**主要なAWS提供ドキュメント:**

| ドキュメント名 | 用途 |
|---------------|------|
| `AWS-RunShellScript` | Linuxでシェルコマンド実行 |
| `AWS-RunPowerShellScript` | Windowsでコマンド実行 |
| `AWS-UpdateSSMAgent` | SSM Agentの更新 |
| `AWS-ConfigureAWSPackage` | AWSパッケージのインストール |
| `AWS-RunPatchBaseline` | パッチベースラインに基づくパッチ適用 |

**レートコントロール:**

大量のインスタンスに対してRun Commandを実行する際、全インスタンスに同時実行するとサービスに影響が出る可能性がある。レートコントロールで同時実行数を制御できる。

```
Targets: 100インスタンス
MaxConcurrency: "10%"      # 同時に10台ずつ実行
MaxErrors: "5%"            # 5台以上失敗したら全体停止
```

**出力先:**

| 出力先 | 用途 |
|-------|------|
| **S3** | 大量のコマンド出力の長期保存 |
| **CloudWatch Logs** | リアルタイム監視、アラーム連動 |
| **SSMコンソール** | 直近の出力(最初の48,000文字)の確認 |

---

### Patch Manager

**定義:** Patch Managerは、EC2インスタンスおよびオンプレミスサーバーへのOSパッチとアプリケーションパッチの適用を自動化する機能。パッチベースライン(どのパッチを適用するか)、パッチグループ(どのインスタンスに適用するか)、メンテナンスウィンドウ(いつ適用するか)を組み合わせて運用する。

**パッチベースライン (Patch Baseline):**

| 種類 | 説明 |
|------|------|
| **デフォルトベースライン** | OS毎にAWSが事前定義。セキュリティパッチと重要パッチを自動承認 |
| **カスタムベースライン** | パッチの承認ルール、例外リスト、承認/拒否パッチを独自に定義 |

**カスタムベースラインの設定項目:**

```yaml
PatchBaseline:
  Name: "CustomLinuxBaseline"
  OperatingSystem: "AMAZON_LINUX_2"
  ApprovalRules:
    - PatchFilterGroup:
        PatchFilters:
          - Key: "CLASSIFICATION"
            Values: ["Security", "Bugfix"]
          - Key: "SEVERITY"
            Values: ["Critical", "Important"]
      ApproveAfterDays: 7              # リリース後7日で自動承認
      ComplianceLevel: "CRITICAL"
  ApprovedPatches:
    - "KB1234567"                       # 個別に承認するパッチ
  RejectedPatches:
    - "KB9999999"                       # 適用を除外するパッチ
```

**パッチグループ (Patch Groups):**

インスタンスにタグ `Patch Group` (キー名は正確に一致が必要) を付与してグループ化する。

```
Tag: Patch Group = "WebServers-Prod"    → ベースライン A (保守的)
Tag: Patch Group = "WebServers-Dev"     → ベースライン B (積極的)
```

- 1つのパッチグループに紐づけられるベースラインは1つのみ
- 1つのベースラインに複数のパッチグループを紐づけることは可能

**パッチ適用フロー:**

```
メンテナンスウィンドウ開始
  ↓
Patch Manager がターゲットインスタンスを特定 (パッチグループ)
  ↓
パッチベースラインに基づいて適用すべきパッチを算出
  ↓
AWS-RunPatchBaseline ドキュメントを実行
  ↓
パッチ適用 (Scan のみ or Scan + Install)
  ↓
コンプライアンスレポート生成
  ↓
メンテナンスウィンドウ終了
```

**ソクラテス式 深堀り:**
> Q: 「なぜパッチ管理を自動化する必要があるのか?」
> A: 手動パッチ管理には限界がある。(1) 数百台のインスタンスに手動でSSH接続してパッチ適用するのは非現実的。(2) パッチの適用漏れがセキュリティ脆弱性につながる。(3) パッチ適用のタイミングをサービス影響のない時間帯に正確に実行する必要がある。Patch Managerはこれらを自動化し、コンプライアンスレポートで適用状況を可視化する。
> Q: 「全てのパッチを即座に適用すべきか?」
> A: いいえ。パッチによってはアプリケーションの互換性問題を引き起こす可能性がある。そのため、(1) 開発環境で先にパッチを適用してテスト、(2) 問題がなければステージング環境に適用、(3) 最終的に本番環境に適用、という段階的なロールアウトが推奨される。`ApproveAfterDays` でリリースから承認までの待機期間を設定できる。

**現実世界のたとえ (非IT向け):**
> 「車の定期整備のようなもの。メーカー(OS/ソフトウェアベンダー)がリコール(パッチ)を出したら、ディーラー(Patch Manager)が対象車両(インスタンス)を特定し、整備工場(Maintenance Window)で一斉に修理します。全車両の整備記録(コンプライアンスレポート)も自動的に管理されます」

---

### Parameter Store

**定義:** Parameter Storeは、設定データと秘密情報を階層的に保存・管理するSSMの機能。プレーンテキスト(String, StringList)またはKMSで暗号化されたSecureStringとして保存でき、アプリケーションから安全にパラメータを取得できる。

**パラメータ階層:**

```
/
├── app/
│   ├── prod/
│   │   ├── db/
│   │   │   ├── host        = "prod-db.xxxxx.rds.amazonaws.com"
│   │   │   ├── port        = "5432"
│   │   │   ├── password    = "***" (SecureString)
│   │   │   └── username    = "admin"
│   │   └── api/
│   │       └── key         = "***" (SecureString)
│   └── dev/
│       └── db/
│           ├── host        = "dev-db.xxxxx.rds.amazonaws.com"
│           └── password    = "***" (SecureString)
└── shared/
    └── config/
        └── log-level   = "INFO"
```

階層構造により、IAMポリシーで `/app/prod/*` のようなパスベースのアクセス制御が可能。

**Standard vs Advanced:**

| 特性 | Standard | Advanced |
|------|----------|---------|
| 料金 | 無料 | 有料 (0.05 USD/パラメータ/月) |
| 最大サイズ | 4 KB | 8 KB |
| パラメータポリシー | なし | あり (有効期限通知、自動更新) |
| 最大パラメータ数 | 10,000 | 100,000 |
| スループット | 標準 (40 TPS) | 高スループットオプション (1,000 TPS) |

**SecureString と KMS:**

SecureStringパラメータはAWS KMSで暗号化される。デフォルトではAWSマネージドキー (`aws/ssm`) が使用されるが、カスタマーマネージドキー (CMK) を指定することで、より細かいアクセス制御が可能になる。

```
アプリケーション → Parameter Store API (GetParameter) → KMSで復号 → 平文の値を返却
```

アプリケーションにはSSMの読み取り権限とKMSの復号権限の両方が必要。

**ソクラテス式 深堀り:**
> Q: 「Parameter StoreとSecrets Managerの違いは何か?どちらを使うべきか?」
> A: Parameter Storeは汎用的な設定管理ストア、Secrets Managerは認証情報に特化したストアである。最大の違いは「自動ローテーション」の有無。Secrets ManagerはRDS、Redshift、DocumentDBのパスワードを自動的にローテーションするLambda関数をビルトインで提供する。Parameter Storeには自動ローテーション機能がない(自前で実装が必要)。
> Q: 「ではParameter Storeは不要なのか?」
> A: いいえ。(1) Parameter StoreのStandardティアは無料、Secrets Managerは0.40 USD/シークレット/月。(2) 設定値(DB接続先ホスト名、ログレベル、フィーチャーフラグなど)の保存にはParameter Storeが最適。(3) シンプルなパスワード保存でローテーション不要な場合もParameter StoreのSecureStringで十分。認証情報でローテーションが必要な場合のみSecrets Managerを選択する。

**現実世界のたとえ (非IT向け):**
> 「ファイリングキャビネット(Parameter Store: 無料/低コスト、シンプル、設定値向き) vs 回転ロック付き金庫(Secrets Manager: 有料、自動ローテーション機能、データベースパスワード等の認証情報向け)。どちらを使うかは中身の機密度と管理要件によります。一般的な書類はキャビネットに、現金や宝石は金庫に入れます」

---

### AppConfig

**定義:** AppConfigはSSMの機能で、アプリケーションの設定変更をデプロイメントパイプラインのように安全にロールアウトする。フィーチャーフラグ、運用パラメータ、機能トグルの管理に適する。

**Parameter StoreとAppConfigの違い:**

| 観点 | Parameter Store | AppConfig |
|------|----------------|-----------|
| 主な用途 | 静的な設定値の保存 | 動的な設定のデプロイ |
| デプロイ戦略 | 即座に反映 | 段階的ロールアウト |
| バリデーション | なし | JSON Schema / Lambda による検証 |
| ロールバック | 手動 | 自動ロールバック (CloudWatch連動) |
| フィーチャーフラグ | 可能だが原始的 | ネイティブサポート |

**AppConfigのデプロイ戦略:**

```
設定変更
  ↓
バリデーション (JSON Schema or Lambda)
  ↓
デプロイ戦略適用:
  ├── AllAtOnce: 全ターゲットに即座にデプロイ
  ├── Linear: 一定間隔で段階的にデプロイ (例: 10分ごとに20%ずつ)
  └── Exponential: 指数関数的にデプロイ (例: 1%, 2%, 4%, 8%, ...)
  ↓
CloudWatchアラーム監視
  ↓
異常検知 → 自動ロールバック
```

---

### Maintenance Windows

**定義:** メンテナンスウィンドウは、パッチ適用やRun Command実行などの運用タスクを、スケジュールされた時間帯に実行する機能。サービスへの影響を最小化するために、低トラフィック時間帯にメンテナンス作業を集中させる。

**構成要素:**

| 要素 | 説明 |
|------|------|
| **スケジュール** | cron式またはrate式で定義 (例: `cron(0 2 ? * SUN *)` = 毎週日曜2:00) |
| **期間 (Duration)** | ウィンドウの長さ (1〜24時間) |
| **カットオフ (Cutoff)** | 新しいタスクの開始を停止する残り時間 (例: 1時間前) |
| **ターゲット** | タグ、リソースグループ、個別インスタンスで指定 |
| **タスク** | Run Command, Automation, Lambda, Step Functions |

**cron式の例:**

```
cron(0 2 ? * SUN *)          # 毎週日曜 02:00 UTC
cron(0 4 ? * SAT#1 *)        # 毎月第1土曜 04:00 UTC
rate(7 days)                  # 7日ごと
```

**SSM Documentの詳細:**

**ソクラテス式 深堀り:**
> Q: 「SSMドキュメントとは何か?」
> A: SSMドキュメントは、Systems Managerが実行するアクションを定義したJSON/YAML形式のファイルである。シェルスクリプトをSSMドキュメントでラップすることで、(1) パラメータ化による再利用性、(2) IAMによるアクセス制御、(3) 実行ログの自動記録、(4) レートコントロールによる安全な大規模実行が実現する。
> Q: 「シェルスクリプトを直接実行するのとどう違うのか?」
> A: シェルスクリプトを直接実行するにはSSH接続が必要であり、誰がいつ何を実行したかの記録が残らない。SSMドキュメントを通じてRun Commandで実行すれば、CloudTrailにAPIコールが記録され、出力はS3/CloudWatch Logsに保存され、IAMポリシーで「誰がどのドキュメントをどのインスタンスに実行できるか」を精密に制御できる。

**現実世界のたとえ (非IT向け):**
> 「作業手順書のようなもの。誰がいつ実行しても同じ手順で作業が行われます。人間が手順書を読んで作業する代わりに、SSMが自動的に実行します。さらに、手順書には『一度に10台まで』『5台失敗したら中止』といった安全装置が組み込まれています」

---

### パッチ管理のベストプラクティス

**ソクラテス式 深堀り:**
> Q: 「パッチ管理はなぜ難しいのか?」
> A: パッチ管理の難しさは3つの要素のバランスにある。(1) セキュリティ: パッチを早く適用して脆弱性を塞ぎたい。(2) 安定性: パッチがアプリケーションを壊すリスクを最小化したい。(3) 可用性: パッチ適用のためのダウンタイムを最小化したい。この3つは互いにトレードオフの関係にあり、完璧な解はない。段階的ロールアウトとコンプライアンスレポートが現実的な解となる。

**現実世界のたとえ (非IT向け):**
> 「車の定期整備のようなもの。メーカー(OS/ソフトウェアベンダー)がリコール(パッチ)を出したら、ディーラー(Patch Manager)が対象車両(インスタンス)を特定し、整備工場(Maintenance Window)で一斉に修理します。まず試作車(開発環境)でテストし、問題なければ営業車(本番環境)に展開します」

**推奨パッチ適用フロー:**

```
1. Dev環境: ApproveAfterDays = 0 (即座にパッチ適用)
   ↓ テスト期間: 3-7日
2. Staging環境: ApproveAfterDays = 7
   ↓ テスト期間: 3-7日
3. Production環境: ApproveAfterDays = 14
   ↓
4. コンプライアンスレポート確認
```

## アーキテクチャパターン

### パターン1: 踏み台レスアーキテクチャ

```
開発者 → IAM認証 → Session Manager → プライベートサブネットのEC2
                                        ↑
                            VPCエンドポイント (PrivateLink)
                            ├── com.amazonaws.{region}.ssm
                            ├── com.amazonaws.{region}.ssmmessages
                            └── com.amazonaws.{region}.ec2messages
```

プライベートサブネットのインスタンスにVPCエンドポイント経由でアクセス。NAT Gatewayも不要なため、コストとセキュリティの両面で最適。

### パターン2: 集中パッチ管理

```
管理アカウント
  └── Patch Manager
        ├── カスタムパッチベースライン
        ├── メンテナンスウィンドウ
        └── ターゲット: タグベース

ワークロードアカウント A                   ワークロードアカウント B
├── EC2 (Patch Group: "WebServers")     ├── EC2 (Patch Group: "DBServers")
└── EC2 (Patch Group: "AppServers")     └── EC2 (Patch Group: "WebServers")
```

Organizations連携で複数アカウントのパッチを一元管理。

### パターン3: 階層化されたパラメータ管理

```
Parameter Store
  /shared/                  ← 全環境共通
    logging/level = "INFO"
  /app-a/
    prod/                   ← 本番環境固有
      db/host = "prod-rds.xxx"
      db/password = "***" (SecureString, CMK: prod-key)
    dev/                    ← 開発環境固有
      db/host = "dev-rds.xxx"
      db/password = "***" (SecureString, CMK: dev-key)

IAM Policy:
  開発者: /app-a/dev/* のみ読み取り可
  運用者: /app-a/prod/* も読み取り可
  アプリ(prod): /app-a/prod/* + /shared/* を読み取り可
```

## SAA試験のポイント

- **Session Managerはインバウンドポートを開放せず、SSHキーも不要。** IAMポリシーでアクセス制御し、全セッションのログをCloudWatch Logs/S3に記録。
- **SSM Agentの前提条件は3つ:** (1) エージェントのインストール、(2) IAMロール(`AmazonSSMManagedInstanceCore`)、(3) SSMエンドポイントへのHTTPSアウトバウンド接続。
- **プライベートサブネットからSSMを使う場合** は、NATゲートウェイまたはVPCエンドポイント(PrivateLink)が必要。VPCエンドポイントは `ssm`, `ssmmessages`, `ec2messages` の3つ。
- **Run CommandのMaxConcurrency と MaxErrors** でレートコントロール。パーセンテージまたは絶対数で指定可能。
- **Patch Managerのパッチグループ** はタグ `Patch Group` (キー名は固定) で定義。1パッチグループ = 1ベースライン。
- **Parameter Store StandardはAPIコール無料、Advanced は有料。** SecureStringはKMSの復号コストが別途発生。
- **Parameter Store vs Secrets Manager:** 自動ローテーションが必要ならSecrets Manager、そうでなければParameter Store。
- **AppConfig** はフィーチャーフラグ、段階的ロールアウト、自動ロールバック(CloudWatch連動)に使用。
- **Maintenance Windowsのカットオフ** は、ウィンドウ終了前に新しいタスクの開始を停止する時間。例えばDuration=3時間、Cutoff=1時間なら、最初の2時間以内に開始されたタスクのみ実行。
- **SSM Automation** はEC2の停止・起動、AMI作成、EBSスナップショットなどのAWSリソース操作に使用。EventBridgeと連携してイベント駆動で実行可能。
- **State Manager** はSSMドキュメントを定期的にインスタンスに適用し、望ましい構成状態を維持する機能(Ansible的な構成管理)。

## ハンズオン参照

- CDKプロジェクト: `cdk-projects/02-ssm-operations/`
- 主要スタック: SsmOperationsStack
- 実装内容:
  - Session Manager用VPCエンドポイントの設定
  - カスタムSSMドキュメントの作成
  - Patch Managerのパッチベースラインとメンテナンスウィンドウの設定
  - Parameter Storeの階層化されたパラメータ設定
  - IAMロールとポリシーの設定

## Well-Architected チェックリスト

### Operational Excellence
- [ ] Session Managerを使用し、踏み台ホストを排除しているか
- [ ] Session Managerのセッションログが CloudWatch Logs/S3 に保存されているか
- [ ] パッチ適用が自動化され、コンプライアンスレポートが生成されているか
- [ ] パッチの段階的ロールアウト(Dev → Stg → Prod)が実装されているか
- [ ] メンテナンスウィンドウが適切な時間帯に設定されているか
- [ ] Parameter Storeで設定値が一元管理されているか
- [ ] SecureStringパラメータにCMK (カスタマーマネージドキー) が使用されているか
- [ ] SSMドキュメントがバージョン管理され、コードとして管理されているか
- [ ] Run Commandの出力がS3/CloudWatch Logsに保存されているか
- [ ] AppConfigを使用してフィーチャーフラグの安全なロールアウトが行われているか
