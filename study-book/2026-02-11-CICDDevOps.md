# セクション16: CI/CD & DevOps (CI/CD & DevOps)
> Well-Architected Pillars: Operational Excellence, Reliability
> Day: 4 | 難易度: 中級〜上級

## 概要

CI/CD (Continuous Integration / Continuous Delivery) は、ソフトウェアの変更を自動的かつ安全にプロダクション環境へ届けるための一連のプラクティスとツールチェーンである。AWS はこのパイプライン全体をマネージドサービスとして提供しており、CodeCommit (ソースリポジトリ)、CodeBuild (ビルド・テスト)、CodeDeploy (デプロイ)、CodePipeline (オーケストレーション) を中心に、CodeArtifact (パッケージ管理) を加えた Developer Tools スイートで構成される。

CI/CD の根本的な価値は「フィードバックループの短縮」と「リリースリスクの低減」にある。コードの変更が小さく頻繁であれば、各リリースのリスクは小さくなる。自動テストによって品質が保証され、自動デプロイによってヒューマンエラーが排除される。これは Well-Architected Framework の Operational Excellence (運用上の優秀性) の柱の核心 -- 「運用のコード化」と「小さな変更を頻繁にリリースする」に直結する。

さらに、Reliability (信頼性) の柱においても、Blue/Green デプロイメントや Canary デプロイメントなどの戦略的なデプロイ方式により、障害の影響範囲を最小化し、問題発生時の迅速なロールバックを可能にする。マルチアカウント・マルチリージョンのパイプライン構成は、企業のガバナンス要件を満たしながら、安全かつ迅速なリリースサイクルを実現する。

## キーコンセプト

### CI/CD の基礎

**定義:** CI (Continuous Integration) は、開発者が頻繁にコードをメインブランチにマージし、自動ビルドと自動テストを実行するプラクティス。CD (Continuous Delivery) は、CI に加えて自動的にステージング環境へデプロイし、ワンクリックでプロダクションリリース可能な状態を維持するプラクティス。Continuous Deployment はさらに進んで、テストに合格したすべての変更を自動的にプロダクションにデプロイする。

**CI/CD パイプラインのステージ:**

```
Source → Build → Test → Deploy (Staging) → Approval → Deploy (Production)
  │        │       │         │                │              │
  │        │       │         │                │              └── CodeDeploy
  │        │       │         │                └── Manual/SNS通知
  │        │       │         └── CodeDeploy (Staging環境)
  │        │       └── CodeBuild (ユニットテスト, 統合テスト)
  │        └── CodeBuild (コンパイル, パッケージング)
  └── CodeCommit / GitHub / S3
```

**Continuous Delivery vs Continuous Deployment:**

| 観点 | Continuous Delivery | Continuous Deployment |
|------|--------------------|-----------------------|
| プロダクションデプロイ | 手動承認が必要 | 完全自動 |
| リスク | 低い (人間の判断を介在) | 非常に低い (テスト品質に依存) |
| リリース頻度 | 高い (任意のタイミング) | 非常に高い (コミットごと) |
| 前提条件 | 基本的な自動テスト | 包括的な自動テスト + モニタリング |
| AWS実装 | CodePipeline + Manual Approval | CodePipeline (承認ステージなし) |

**ソクラテス式 深堀り:**
> Q: 「なぜ手動デプロイではなく CI/CD パイプラインが必要なのか?」
> A: 手動デプロイの問題は3つある。(1) ヒューマンエラー -- 手順の見落とし、設定ミス、ファイルの置き忘れ。(2) 一貫性の欠如 -- 人によって手順が微妙に異なる。(3) スケーラビリティの限界 -- 1日10回リリースしたい場合、手動では不可能。CI/CD はこれらすべてをコードとして定義し、毎回同じプロセスを確実に実行する。
> Q: 「Continuous Delivery と Continuous Deployment のどちらを選ぶべきか?」
> A: ほとんどの組織では Continuous Delivery から始めるべきである。プロダクションデプロイ前の手動承認ステップは、ビジネス判断(リリースタイミング、マーケティング連動等)を組み込む余地を残す。Continuous Deployment は、自動テストのカバレッジが十分に高く、モニタリングと自動ロールバックが整備されている成熟した組織に適する。

**現実世界のたとえ (非IT向け):**
> 「自動車工場の組み立てライン。部品(コード)が工場に届くたびに、品質検査(テスト)→組み立て(ビルド)→試運転(ステージング)→出荷承認(手動承認)→ディーラーへ配送(プロダクションデプロイ)。Continuous Delivery は出荷承認に工場長のサインが必要。Continuous Deployment は品質検査を通過したら自動的に配送される。どちらを選ぶかは品質管理体制の成熟度による」

---

### AWS CodeCommit

**定義:** CodeCommit は、AWS が提供するフルマネージドな Git リポジトリサービス。IAM ベースのアクセス制御、保存時の暗号化 (AES-256)、転送時の暗号化 (HTTPS/SSH) を備える。リポジトリサイズに制限はなく (個別ファイルは最大2GB)、高可用性で運用される。

> **注意:** 2024年以降、CodeCommit は新規顧客への提供が停止されている (既存顧客は引き続き利用可能)。ただし SAA 試験範囲には含まれるため、概念の理解は必要。

**主要機能:**

| 機能 | 説明 |
|------|------|
| **IAM認証** | Git認証情報 (HTTPS) またはSSHキー (IAMユーザーにアタッチ) |
| **暗号化** | 保存時: AWS KMS (自動)、転送時: HTTPS/SSH |
| **トリガー** | SNS通知、Lambda関数をブランチイベントで起動 |
| **通知** | CloudWatch Events/EventBridge連携でPR作成、コメント等を通知 |
| **クロスアカウント** | IAMロールの引き受けによるクロスアカウントアクセス |
| **プルリクエスト** | コードレビュー、承認ルール、マージ前チェック |

**CodeCommit vs GitHub vs Bitbucket:**

| 観点 | CodeCommit | GitHub | Bitbucket |
|------|-----------|--------|-----------|
| 認証方式 | IAM (AWS統合) | OAuth/PAT | OAuth/PAT |
| 暗号化 | KMS自動暗号化 | 標準暗号化 | 標準暗号化 |
| AWS統合 | ネイティブ統合 | CodeStar接続 | CodeStar接続 |
| CI/CD連携 | CodePipeline直接連携 | CodeStar接続経由 | CodeStar接続経由 |

**ソクラテス式 深堀り:**
> Q: 「CodeCommit が非推奨になった今、なぜ学ぶ必要があるのか?」
> A: (1) SAA試験範囲にまだ含まれている。(2) 既存のAWS環境で広く使われている。(3) IAMベースのアクセス制御とAWSネイティブ統合の概念は、GitHub等のサードパーティリポジトリを CodePipeline で使う場合にも理解が必要。CodeStar Connections の概念を理解する前提知識となる。

---

### AWS CodeBuild

**定義:** CodeBuild は、ソースコードのコンパイル、テスト実行、デプロイ可能なアーティファクトの生成を行うフルマネージドなビルドサービス。ビルド環境のプロビジョニング、スケーリング、パッチ適用を AWS が管理するため、ビルドサーバーの運用が不要。

**buildspec.yml のフェーズ:**

```yaml
version: 0.2

env:
  variables:
    JAVA_HOME: "/usr/lib/jvm/java-11"
  parameter-store:
    DB_PASSWORD: "/app/prod/db/password"    # SSM Parameter Store から取得
  secrets-manager:
    API_KEY: "prod/api-key:api_key"          # Secrets Manager から取得

phases:
  install:
    runtime-versions:
      nodejs: 18
    commands:
      - npm install                          # 依存パッケージのインストール

  pre_build:
    commands:
      - echo "Running unit tests..."
      - npm test                             # テスト実行
      - echo "Logging in to ECR..."
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI

  build:
    commands:
      - echo "Building application..."
      - npm run build                        # アプリケーションビルド
      - docker build -t $ECR_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION .

  post_build:
    commands:
      - echo "Pushing Docker image..."
      - docker push $ECR_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - echo "Writing image definitions file..."
      - printf '[{"name":"app","imageUri":"%s"}]' $ECR_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
    - appspec.yml
    - taskdef.json

cache:
  paths:
    - '/root/.npm/**/*'                      # npm キャッシュ
    - 'node_modules/**/*'                    # node_modules キャッシュ

reports:
  jest-reports:
    files:
      - 'junit.xml'
    file-format: 'JUNITXML'
```

**ビルドフェーズの詳細:**

| フェーズ | 実行タイミング | 用途 |
|---------|-------------|------|
| **install** | ビルド環境セットアップ後 | ランタイムのインストール、依存パッケージ取得 |
| **pre_build** | ビルド前 | テスト実行、Docker レジストリログイン、変数設定 |
| **build** | メインビルド | コンパイル、Docker イメージビルド |
| **post_build** | ビルド後 | アーティファクトのプッシュ、通知、クリーンアップ |

**ビルド環境:**

| コンピュートタイプ | メモリ | vCPU | 用途 |
|------------------|--------|------|------|
| BUILD_GENERAL1_SMALL | 3 GB | 2 | 小規模ビルド |
| BUILD_GENERAL1_MEDIUM | 7 GB | 4 | 中規模ビルド |
| BUILD_GENERAL1_LARGE | 15 GB | 8 | 大規模ビルド、Docker |
| BUILD_GENERAL1_2XLARGE | 145 GB | 72 | 超大規模ビルド |

**キャッシュ戦略:**

| キャッシュタイプ | 説明 | 推奨場面 |
|---------------|------|---------|
| **S3キャッシュ** | S3バケットにキャッシュを保存 | 複数ビルドプロジェクトで共有 |
| **ローカルキャッシュ** | ビルドホスト上に保存 | 同一ビルドプロジェクトの高速化 |

**ソクラテス式 深堀り:**
> Q: 「なぜ Jenkins のようなセルフホストのビルドサーバーではなく CodeBuild を使うのか?」
> A: Jenkins の運用負荷は想像以上に大きい。(1) サーバーの維持管理 (パッチ、スケーリング、障害対応)。(2) プラグインの互換性問題。(3) ビルドキューの管理。CodeBuild は「ビルドが必要な時だけリソースが起動し、使った分だけ課金される」サーバーレスモデル。ビルドが並行100個来ても自動スケールする。
> Q: 「buildspec.yml の env セクションで Parameter Store や Secrets Manager から値を取得できるのはなぜ重要か?」
> A: ビルドプロセスにはしばしば秘密情報が必要 (Docker レジストリのパスワード、API キー、データベース接続情報など)。これらをソースコードに含めるのはセキュリティ上の重大リスクである。buildspec.yml から直接 Parameter Store / Secrets Manager を参照することで、秘密情報をコードから分離し、IAM ポリシーで取得権限を制御できる。

**現実世界のたとえ (非IT向け):**
> 「レンタルキッチン (CodeBuild)。料理 (ビルド) が必要な時だけキッチンを借りて、使った時間分だけ支払う。食材リスト (buildspec.yml) を渡せば、プロのシェフ (ビルド環境) が手順通りに調理し、完成品 (アーティファクト) を返してくれる。自前でキッチンを持つ (Jenkins) よりも遥かに効率的」

---

### AWS CodeDeploy

**定義:** CodeDeploy は、EC2 インスタンス、オンプレミスサーバー、Lambda 関数、ECS サービスへのアプリケーションデプロイを自動化するサービス。appspec.yml によりデプロイの手順を定義し、複数のデプロイ戦略をサポートする。

**デプロイタイプ比較:**

| デプロイタイプ | EC2/オンプレミス | Lambda | ECS |
|-------------|----------------|--------|-----|
| **In-place** | 対応 | 非対応 | 非対応 |
| **Blue/Green** | 対応 (ASG) | 対応 (エイリアス) | 対応 (タスクセット) |
| **Canary** | 非対応 | 対応 | 対応 |
| **Linear** | 非対応 | 対応 | 対応 |
| **All-at-once** | 対応 | 対応 | 対応 |

**EC2/オンプレミス向けデプロイ:**

In-place デプロイ:
```
既存インスタンス群: [A] [B] [C] [D]
                     ↓ デプロイ (1台ずつ or 一括)
Step 1: [A停止] → アプリ更新 → [A起動]  [B] [C] [D] (稼働中)
Step 2: [A] [B停止] → アプリ更新 → [B起動]  [C] [D] (稼働中)
Step 3: ... (繰り返し)
```

Blue/Green デプロイ (ASG):
```
Blue環境 (現行):  ASG-Blue  → [A] [B] [C] [D] ← ALB のターゲット
                                                     │
Green環境 (新):   ASG-Green → [A'] [B'] [C'] [D']    │
                                  ↑                    │
                                  ├── 新バージョンデプロイ│
                                  └── ヘルスチェック通過後、ALBの向き先を切り替え
                                                     ↓
Blue環境:         ASG-Blue  → [A] [B] [C] [D]  (トラフィックなし → 後で終了)
Green環境:        ASG-Green → [A'] [B'] [C'] [D'] ← ALB のターゲット
```

**Lambda 向けデプロイ (トラフィックシフティング):**

| デプロイプリファレンス | 動作 |
|---------------------|------|
| **Canary10Percent5Minutes** | 最初に10%のトラフィックを新バージョンに転送、5分後に100% |
| **Canary10Percent10Minutes** | 最初に10%、10分後に100% |
| **Canary10Percent15Minutes** | 最初に10%、15分後に100% |
| **Canary10Percent30Minutes** | 最初に10%、30分後に100% |
| **Linear10PercentEvery1Minute** | 1分ごとに10%ずつ新バージョンに移行 |
| **Linear10PercentEvery2Minutes** | 2分ごとに10%ずつ新バージョンに移行 |
| **Linear10PercentEvery3Minutes** | 3分ごとに10%ずつ新バージョンに移行 |
| **Linear10PercentEvery10Minutes** | 10分ごとに10%ずつ新バージョンに移行 |
| **AllAtOnce** | 即座にすべてのトラフィックを新バージョンに切り替え |

**ECS Blue/Green デプロイ:**
```
ECS Service
  ├── Task Set (Blue - 現行)  ← Production Listener (ポート 80)
  └── Task Set (Green - 新規) ← Test Listener (ポート 8080)
                                    │
                                    ├── テスト後、トラフィック切り替え
                                    ↓
  ├── Task Set (Blue - 旧)   ← 待機 (ロールバック用) → 後で削除
  └── Task Set (Green - 新規) ← Production Listener (ポート 80)
```

**appspec.yml (EC2/オンプレミス):**

```yaml
version: 0.0
os: linux
files:
  - source: /                      # ソースからのファイル
    destination: /var/www/html     # デプロイ先

hooks:
  BeforeInstall:
    - location: scripts/before_install.sh
      timeout: 300
      runas: root
  AfterInstall:
    - location: scripts/after_install.sh
      timeout: 300
      runas: root
  ApplicationStart:
    - location: scripts/start_server.sh
      timeout: 300
      runas: root
  ValidateService:
    - location: scripts/validate_service.sh
      timeout: 300
      runas: root
```

**EC2 デプロイのライフサイクルイベント順序:**

```
ApplicationStop          # 現行アプリケーションの停止
  ↓
DownloadBundle           # S3/GitHubからバンドルをダウンロード (自動)
  ↓
BeforeInstall            # インストール前処理 (ログバックアップ、旧ファイル削除等)
  ↓
Install                  # ファイルのコピー (自動)
  ↓
AfterInstall             # インストール後処理 (権限設定、設定ファイル変更等)
  ↓
ApplicationStart         # アプリケーションの起動
  ↓
ValidateService          # ヘルスチェック、動作確認
```

**appspec.yml (Lambda):**

```yaml
version: 0.0
Resources:
  - MyFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: "my-function"
        Alias: "live"
        CurrentVersion: "1"
        TargetVersion: "2"
Hooks:
  - BeforeAllowTraffic: "LambdaFunctionToValidate"
  - AfterAllowTraffic: "LambdaFunctionToValidate"
```

**ソクラテス式 深堀り:**
> Q: 「In-place デプロイと Blue/Green デプロイのどちらを選ぶべきか?」
> A: トレードオフがある。In-place は既存インスタンスを更新するためコスト効率が高いが、デプロイ中のキャパシティ低下とロールバック時間が長い (再デプロイが必要)。Blue/Green は新しい環境を並行で立ち上げるため、ゼロダウンタイムで即座にロールバック可能だが、一時的に2倍のリソースコストがかかる。本番環境では Blue/Green、開発環境では In-place が一般的な選択。
> Q: 「Canary と Linear の違いは何か?」
> A: どちらも段階的なトラフィック移行だが、パターンが異なる。Canary は「少量のトラフィックで検証した後、一気に全量を移行」する2段階方式。Linear は「一定間隔で一定割合ずつ移行」する漸進方式。Canary は素早い検証に適し、Linear は慎重で予測可能な移行に適する。

**現実世界のたとえ (非IT向け):**
> 「レストランのメニューリニューアル。In-place デプロイは営業しながら1品ずつメニューを入れ替えること -- お客さんは限られた品数で我慢する時間がある。Blue/Green は隣に新しいレストランを開いて全メニューを準備し、準備完了後にお客さんを新店舗に案内する -- 古い店舗は問題があった場合にすぐ戻れるよう残しておく。Canary は新メニューをまず常連客10人に試食してもらい、好評なら全員に提供する」

---

### AWS CodePipeline

**定義:** CodePipeline は、ソフトウェアリリースプロセスをモデル化・自動化・可視化するフルマネージドな CI/CD オーケストレーションサービス。複数のステージとアクションを組み合わせて、ソースの取得からプロダクションデプロイまでのパイプライン全体を定義する。

**パイプラインの構造:**

```
Pipeline
  ├── Stage 1: Source
  │     └── Action: CodeCommit / GitHub / S3
  │                  ↓ (Output Artifact → S3 バケットに保存)
  ├── Stage 2: Build
  │     └── Action: CodeBuild
  │                  ↓ (Output Artifact)
  ├── Stage 3: Test
  │     └── Action: CodeBuild (テスト実行)
  │                  ↓
  ├── Stage 4: Staging
  │     └── Action: CodeDeploy (ステージング環境)
  │                  ↓
  ├── Stage 5: Approval
  │     └── Action: Manual Approval (SNS通知 → 承認者にメール)
  │                  ↓
  └── Stage 6: Production
        └── Action: CodeDeploy (本番環境)
```

**アクションタイプ:**

| カテゴリ | アクション | 説明 |
|---------|----------|------|
| **Source** | CodeCommit, GitHub, S3, ECR | ソースコードの取得 |
| **Build** | CodeBuild, Jenkins | ビルド・テスト |
| **Test** | CodeBuild, DeviceFarm | テスト実行 |
| **Deploy** | CodeDeploy, CloudFormation, ECS, S3, Elastic Beanstalk | デプロイ |
| **Approval** | Manual Approval | 手動承認 (SNS通知) |
| **Invoke** | Lambda, Step Functions | カスタムアクション |

**アーティファクトストレージ:**

CodePipeline は各ステージ間のアーティファクト受け渡しに S3 バケットを使用する。パイプライン作成時にアーティファクトストア用の S3 バケットが自動的に作成される (またはカスタムバケットを指定可能)。アーティファクトは AES-256 または KMS で暗号化される。

```
Stage 1 (Source) → Output Artifact → [S3 アーティファクトバケット]
                                              ↓
Stage 2 (Build) ← Input Artifact  ← [S3 アーティファクトバケット]
                → Output Artifact → [S3 アーティファクトバケット]
                                              ↓
Stage 3 (Deploy) ← Input Artifact ← [S3 アーティファクトバケット]
```

**手動承認アクション:**

```
パイプライン実行中
  ↓
Manual Approval ステージに到達
  ↓
SNS通知 → 承認者にメール/Slack通知
  ↓
承認者がAWSコンソール/CLIで承認 or 拒否
  ├── 承認 → 次のステージへ進行
  └── 拒否 → パイプライン停止
```

**クロスリージョンアクション:**

CodePipeline はクロスリージョンのデプロイアクションをサポートする。パイプラインは1つのリージョンに作成し、デプロイアクションを別のリージョンで実行できる。各リージョンにアーティファクトバケットが必要。

**クロスアカウントパイプライン:**

```
ツールアカウント (パイプライン所有)
  └── CodePipeline
        ├── Source: ツールアカウントの CodeCommit
        ├── Build: ツールアカウントの CodeBuild
        ├── Deploy to Dev: 開発アカウントの CodeDeploy
        │     └── IAM ロール引き受け (AssumeRole)
        ├── Approval: 手動承認
        └── Deploy to Prod: 本番アカウントの CodeDeploy
              └── IAM ロール引き受け (AssumeRole)
```

クロスアカウントデプロイには以下が必要:
1. ターゲットアカウントに CodeDeploy 用の IAM ロールを作成
2. ツールアカウントのパイプラインロールに AssumeRole 権限を付与
3. S3 アーティファクトバケットのポリシーでクロスアカウントアクセスを許可
4. KMS キーポリシーでクロスアカウント復号を許可

**ソクラテス式 深堀り:**
> Q: 「CodePipeline のアーティファクトはなぜ S3 に保存されるのか?」
> A: ステージ間でアーティファクトを受け渡すためのイミュータブルなストレージが必要だから。S3 は高可用性・高耐久性 (99.999999999%) でバージョン管理もでき、KMS 暗号化もネイティブにサポートする。各ステージは独立して実行され、失敗しても入力アーティファクトは S3 に保持されるため、再実行時に前のステージを再実行する必要がない。
> Q: 「なぜマルチアカウントパイプラインが推奨されるのか?」
> A: 本番環境を別アカウントに隔離するのは Well-Architected のベストプラクティスである。(1) 開発者が誤って本番環境を変更するリスクを排除。(2) IAM の境界が明確になる。(3) AWS のサービスクォータがアカウント間で独立する。(4) コスト配分が明確になる。パイプラインのみが AssumeRole で本番アカウントにアクセスできるため、統制されたリリースプロセスが保証される。

**現実世界のたとえ (非IT向け):**
> 「工場の組み立てライン (CodePipeline)。原材料の受け入れ (Source) → 部品加工 (Build) → 品質検査 (Test) → 試作品確認 (Staging) → 工場長の出荷承認 (Manual Approval) → 出荷 (Production Deploy)。各工程の中間品は倉庫 (S3) に保管され、どの工程からでも再開できる。クロスアカウントは複数工場間の連携 -- 試作工場で作って、本番工場で量産する」

---

### AWS CodeArtifact

**定義:** CodeArtifact は、ソフトウェアパッケージを安全に保存・公開・共有するためのフルマネージドなアーティファクトリポジトリサービス。npm、pip、Maven、NuGet、Swift、Cargo などの主要パッケージマネージャーに対応する。

**アーキテクチャ:**

```
外部リポジトリ (npmjs.com, PyPI)
  ↑ アップストリーム接続
  │
CodeArtifact ドメイン
  ├── リポジトリ A (本番用)
  │     ├── パッケージ A v1.0
  │     ├── パッケージ B v2.3
  │     └── アップストリーム: 外部リポジトリ
  └── リポジトリ B (開発用)
        ├── パッケージ A v1.1-beta
        └── アップストリーム: リポジトリ A + 外部リポジトリ
```

**主要概念:**

| 概念 | 説明 |
|------|------|
| **ドメイン** | 複数リポジトリの管理単位。ポリシーの適用範囲 |
| **リポジトリ** | パッケージの格納場所 |
| **アップストリーム** | パッケージが見つからない場合にフォールバックする上位リポジトリ |
| **ドメインポリシー** | クロスアカウントアクセスの制御 |

**CodeBuild との統合:**

```yaml
# buildspec.yml
phases:
  pre_build:
    commands:
      - aws codeartifact login --tool npm --domain my-domain --repository my-repo
      - npm install    # CodeArtifact からパッケージをインストール
  post_build:
    commands:
      - npm publish    # ビルド成果物を CodeArtifact にパブリッシュ
```

**ソクラテス式 深堀り:**
> Q: 「なぜ公開リポジトリ (npmjs.com) を直接使わず CodeArtifact を介在させるのか?」
> A: 3つの理由がある。(1) セキュリティ -- 公開リポジトリへの依存は供給チェーン攻撃のリスクがある。CodeArtifact でパッケージを検査・キャッシュすることでリスクを軽減。(2) 可用性 -- 公開リポジトリがダウンしてもキャッシュからビルドを継続できる。(3) ガバナンス -- 承認されたパッケージのみを開発者が利用できるよう制御できる。

---

### デプロイ戦略の詳細比較

**全デプロイ戦略の比較:**

| 戦略 | ダウンタイム | ロールバック | コスト | リスク | 適用場面 |
|------|-----------|-----------|--------|-------|---------|
| **All-at-once** | あり | 再デプロイ (遅い) | 低 | 高 | 開発環境 |
| **Rolling** | 最小限 | 再デプロイ (遅い) | 低 | 中 | 非クリティカルなサービス |
| **Rolling with additional batch** | なし | 再デプロイ (遅い) | 中 | 中 | キャパシティ維持が必要 |
| **Immutable** | なし | 旧環境を復元 | 高 | 低 | 確実性が必要な場合 |
| **Blue/Green** | なし | ルーティング切り替え (即時) | 高 | 最低 | 本番環境推奨 |
| **Canary** | なし | ルーティング切り替え (即時) | 中 | 低 | 慎重な本番リリース |
| **Linear** | なし | ルーティング切り替え (即時) | 中 | 低 | 段階的な本番リリース |

**各戦略の動作イメージ:**

```
All-at-once:
  [v1][v1][v1][v1] → [v2][v2][v2][v2]  (一括更新)

Rolling:
  [v1][v1][v1][v1]
  [v2][v1][v1][v1]  (1台ずつ更新)
  [v2][v2][v1][v1]
  [v2][v2][v2][v1]
  [v2][v2][v2][v2]

Rolling with additional batch:
  [v1][v1][v1][v1]
  [v1][v1][v1][v1][v2]  (追加バッチで新バージョン起動)
  [v2][v1][v1][v1][v2]  (旧を1台ずつ更新)
  ...
  [v2][v2][v2][v2]      (追加バッチを削除)

Immutable:
  [v1][v1][v1][v1]  (既存ASG)
  [v1][v1][v1][v1] + [v2][v2][v2][v2]  (新ASGでv2起動)
  ヘルスチェック通過後、旧ASGを削除
  [v2][v2][v2][v2]

Blue/Green:
  Blue: [v1][v1][v1][v1] ← ALB
  Green: [v2][v2][v2][v2]
  ALBのターゲットグループを切り替え
  Blue: [v1][v1][v1][v1]  (待機/削除)
  Green: [v2][v2][v2][v2] ← ALB

Canary:
  時刻 0:   v1: 100%, v2: 0%
  時刻 T:   v1: 90%,  v2: 10%  (カナリアテスト)
  時刻 T+N: v1: 0%,   v2: 100% (全量切り替え)

Linear:
  時刻 0:   v1: 100%, v2: 0%
  時刻 T:   v1: 90%,  v2: 10%
  時刻 2T:  v1: 80%,  v2: 20%
  ...
  時刻 10T: v1: 0%,   v2: 100%
```

**Blue/Green with ALB の詳細:**

```
ALB
  ├── Listener Rule (ポート 80)
  │     └── Forward to Target Group Blue (Weight: 100)
  │
  ├── Target Group Blue (Blue環境)
  │     ├── Instance A (v1)
  │     ├── Instance B (v1)
  │     └── Instance C (v1)
  │
  └── Target Group Green (Green環境)
        ├── Instance D (v2)
        ├── Instance E (v2)
        └── Instance F (v2)

切り替え後:
ALB
  └── Listener Rule (ポート 80)
        └── Forward to Target Group Green (Weight: 100)
```

---

### Infrastructure as Code と CI/CD

**CDK Pipelines (セルフミューテーティングパイプライン):**

CDK Pipelines は、CDK アプリケーション自体のデプロイパイプラインを CDK コードで定義する機能。パイプライン自身の変更も自動的にデプロイされる「セルフミューテーティング (自己変異)」の特性を持つ。

```
CDK Pipeline の動作フロー:
  Source (CodeCommit/GitHub)
    ↓
  Synth (cdk synth → CloudFormation テンプレート生成)
    ↓
  Self-Mutate (パイプライン自体を更新)
    ↓
  Assets (Docker イメージ、Lambda コード等をS3/ECRにアップロード)
    ↓
  Deploy-Dev (開発環境にスタックデプロイ)
    ↓
  Deploy-Staging + テスト
    ↓
  Manual Approval
    ↓
  Deploy-Production
```

**CloudFormation StackSets with CI/CD:**

```
CodePipeline
  ├── Source: CDK/CloudFormation テンプレート
  ├── Build: cdk synth / cfn-lint (テンプレート検証)
  └── Deploy: StackSets
        ├── OU: ProductionOU
        │     ├── Account A (us-east-1)
        │     ├── Account B (eu-west-1)
        │     └── Account C (ap-northeast-1)
        └── 設定:
              ├── MaxConcurrentCount: 1  (1アカウントずつ)
              └── FailureToleranceCount: 0  (0件でも失敗で停止)
```

**ソクラテス式 深堀り:**
> Q: 「CDK Pipelines のセルフミューテーティングとは何か?」
> A: 通常のパイプラインは「アプリケーションのデプロイ」を自動化するが、パイプライン自体の変更は手動で行う必要がある。CDK Pipelines では、パイプラインのコード変更をプッシュすると、パイプラインが自分自身を更新してから、新しいパイプライン定義でアプリケーションをデプロイする。これにより「パイプラインのコード = パイプラインの実体」が常に一致する -- Infrastructure as Code の究極形。

---

### ロールバック戦略

**CodeDeploy の自動ロールバック:**

| トリガー条件 | 説明 |
|------------|------|
| **デプロイ失敗** | デプロイの任意のフェーズで失敗した場合 |
| **CloudWatch アラーム** | 指定したアラームが ALARM 状態になった場合 |
| **手動** | コンソール/CLI から手動でロールバック |

```
CodeDeploy ロールバック設定:
  AutoRollback:
    Enabled: true
    Events:
      - DEPLOYMENT_FAILURE         # デプロイ失敗時
      - DEPLOYMENT_STOP_ON_ALARM   # CloudWatch アラーム発火時

  CloudWatch Alarms:
    - ErrorRate5xxAlarm           # 5xx エラー率のアラーム
    - LatencyP99Alarm             # P99 レイテンシーのアラーム
    - UnhealthyHostAlarm          # Unhealthy ホスト数のアラーム
```

**CloudFormation ロールバックトリガー:**

```yaml
# CloudFormation スタック更新時のロールバック設定
aws cloudformation update-stack \
  --stack-name my-stack \
  --template-body file://template.yaml \
  --rollback-configuration \
    RollbackTriggers:
      - Arn: arn:aws:cloudwatch:region:account:alarm:ErrorRateAlarm
        Type: AWS::CloudWatch::Alarm
    MonitoringTimeInMinutes: 10   # デプロイ後10分間監視
```

**データベースマイグレーションのロールバック戦略:**

| 戦略 | メリット | デメリット |
|------|---------|----------|
| **Forward-compatible migrations** | ロールバック不要 | 設計が複雑 |
| **Reversible migrations (up/down)** | 明示的な巻き戻し | データ損失のリスク |
| **Feature flags** | コードレベルで切り替え | 複雑性の増加 |
| **Database snapshots** | 確実な復元 | 復元時間が長い |

**ソクラテス式 深堀り:**
> Q: 「ロールバックはなぜ事前に計画しておく必要があるのか?」
> A: 障害発生時はパニック状態になりやすく、その場で正しいロールバック手順を考え出すのは困難。事前にロールバック計画を定義し、自動化しておくことで、(1) MTTR (平均復旧時間) を最小化、(2) 人為的ミスによる二次障害を防止、(3) デプロイの心理的ハードルを下げてリリース頻度を上げることができる。

**現実世界のたとえ (非IT向け):**
> 「飛行機の非常脱出手順。離陸前に必ず説明し、定期的に訓練する。実際に非常事態が起きてから手順を考えるのでは遅い。ロールバック計画も同様 -- デプロイ前に『問題が起きたらこう戻す』を定義し、自動化しておくことで、冷静かつ迅速に対処できる」

---

### CI/CD におけるモニタリングとオブザーバビリティ

**パイプラインのモニタリング:**

| メトリクス | サービス | 意味 |
|----------|---------|------|
| **Pipeline execution time** | CodePipeline | パイプライン全体の実行時間 |
| **Stage execution time** | CodePipeline | 各ステージの実行時間 |
| **Action execution status** | CodePipeline | アクションの成功/失敗 |
| **Build duration** | CodeBuild | ビルドの所要時間 |
| **Build success rate** | CodeBuild | ビルド成功率 |
| **Failed builds** | CodeBuild | ビルド失敗数 |
| **Deployment success rate** | CodeDeploy | デプロイ成功率 |
| **Deployment duration** | CodeDeploy | デプロイ所要時間 |

**EventBridge によるパイプラインイベント検知:**

```json
{
  "source": ["aws.codepipeline"],
  "detail-type": ["CodePipeline Pipeline Execution State Change"],
  "detail": {
    "state": ["FAILED"]
  }
}
```

このルールで CodePipeline のパイプライン失敗を検知し、SNS → Slack/Email で通知。

**デプロイ後のアプリケーションモニタリング:**

```
デプロイ完了
  ↓
CloudWatch メトリクス監視 (Bake Time: 5-30分)
  ├── Error Rate (5xx エラー率)
  ├── Latency (P50, P99)
  ├── Request Count
  └── Custom Business Metrics
  ↓
アラーム発火?
  ├── Yes → 自動ロールバック (CodeDeploy)
  └── No → デプロイ成功確定
```

**ソクラテス式 深堀り:**
> Q: 「なぜデプロイ後に監視期間 (Bake Time) が必要なのか?」
> A: すべてのバグが即座に顕在化するわけではない。(1) メモリリークは徐々にメモリを消費し、数時間後にクラッシュする。(2) 特定の時間帯や特定のリクエストパターンでのみ発生するバグがある。(3) キャッシュが切り替わるまで旧バージョンの振る舞いが残る。Bake Time を設けてメトリクスを監視することで、これらの遅延型障害を検知できる。

---

## アーキテクチャパターン

### パターン1: フル CodePipeline (EC2)

```
CodeCommit (ソースリポジトリ)
  ↓ プッシュイベント (EventBridge)
CodePipeline
  ├── Source: CodeCommit
  ├── Build: CodeBuild
  │     ├── npm install
  │     ├── npm test
  │     ├── npm run build
  │     └── Output: アーティファクト (S3)
  ├── Deploy-Staging: CodeDeploy (In-place)
  │     └── EC2 Auto Scaling Group (Staging)
  ├── Approval: Manual Approval (SNS → メール)
  └── Deploy-Production: CodeDeploy (Blue/Green)
        ├── EC2 Auto Scaling Group (Blue)
        ├── EC2 Auto Scaling Group (Green)
        └── Application Load Balancer
```

### パターン2: コンテナ CI/CD (ECS Blue/Green)

```
GitHub (ソースリポジトリ)
  ↓ CodeStar Connection
CodePipeline
  ├── Source: GitHub (via CodeStar Connection)
  ├── Build: CodeBuild
  │     ├── Docker ビルド
  │     ├── ECR にプッシュ
  │     └── Output: imagedefinitions.json, appspec.yaml, taskdef.json
  └── Deploy: CodeDeploy (ECS Blue/Green)
        ├── ECS Service
        │     ├── Task Set (Blue) ← Production Listener (80)
        │     └── Task Set (Green) ← Test Listener (8080)
        └── Application Load Balancer
              ├── Production Listener (ポート 80)
              └── Test Listener (ポート 8080)
```

### パターン3: サーバーレス CI/CD

```
CodeCommit (ソースリポジトリ)
  ↓
CodePipeline
  ├── Source: CodeCommit
  ├── Build: CodeBuild
  │     ├── sam build / cdk synth
  │     ├── テスト実行
  │     └── Output: CloudFormation テンプレート
  ├── Deploy-Staging: CloudFormation (変更セット)
  │     ├── Lambda 関数群
  │     ├── API Gateway
  │     └── DynamoDB テーブル
  ├── Test: CodeBuild (統合テスト実行)
  ├── Approval: Manual Approval
  └── Deploy-Production: CloudFormation (変更セット)
        └── Lambda デプロイプリファレンス: Canary10Percent5Minutes
```

### パターン4: マルチアカウントパイプライン

```
ツールアカウント (Shared Services)
  └── CodePipeline
        ├── Source: CodeCommit
        ├── Build: CodeBuild
        │     └── cdk synth
        ├── Deploy-Dev (開発アカウント)
        │     ├── AssumeRole → DevAccountDeployRole
        │     └── CloudFormation スタック
        ├── Integration Test (開発アカウント)
        ├── Approval-Staging
        ├── Deploy-Staging (ステージングアカウント)
        │     ├── AssumeRole → StagingAccountDeployRole
        │     └── CloudFormation スタック
        ├── Load Test (ステージングアカウント)
        ├── Approval-Production
        └── Deploy-Production (本番アカウント)
              ├── AssumeRole → ProdAccountDeployRole
              └── CloudFormation スタック

IAM 信頼関係:
  DevAccount:     DevAccountDeployRole → Trust: ToolsAccount Pipeline Role
  StagingAccount: StagingAccountDeployRole → Trust: ToolsAccount Pipeline Role
  ProdAccount:    ProdAccountDeployRole → Trust: ToolsAccount Pipeline Role

S3 アーティファクトバケット:
  ツールアカウント: s3://pipeline-artifacts-tools
    BucketPolicy: 各アカウントのデプロイロールからの読み取りを許可
  KMS キー:
    KeyPolicy: 各アカウントのデプロイロールからの復号を許可
```

### パターン5: CDK Pipelines (セルフミューテーティング)

```
GitHub (ソースリポジトリ)
  ↓
CDK Pipeline (CodePipeline ベース)
  ├── Source: GitHub (via CodeStar Connection)
  ├── Synth: CodeBuild
  │     └── cdk synth → Cloud Assembly
  ├── UpdatePipeline (自己変異)
  │     └── パイプライン定義に変更があれば自身を更新
  ├── Assets
  │     └── Docker イメージ / Lambda コード → S3 / ECR
  ├── Stage: Dev
  │     ├── DeployStack: AppStack (開発環境)
  │     └── Post: 統合テスト (CodeBuild)
  ├── Stage: Staging
  │     ├── DeployStack: AppStack (ステージング環境)
  │     └── Post: E2Eテスト (CodeBuild)
  ├── ManualApproval
  └── Stage: Production
        └── DeployStack: AppStack (本番環境)

特徴:
  - パイプラインコードの変更をプッシュ → パイプラインが自分自身を更新
  - 新しいステージやスタックの追加もコード変更のみで自動反映
  - cdk synth の結果 (Cloud Assembly) を元にデプロイ
```

## SAA試験のポイント

| トピック | 出題ポイント | キーワード |
|---------|------------|-----------|
| **CodeDeploy デプロイタイプ** | In-place は EC2 のみ対応。Blue/Green は EC2 (ASG), Lambda, ECS で対応。Lambda/ECS では In-place 非対応 | In-place, Blue/Green, appspec.yml |
| **CodePipeline アーティファクト** | ステージ間のアーティファクトは S3 バケットに保存。KMS 暗号化。クロスアカウントではバケットポリシーとキーポリシーが必要 | S3, KMS, アーティファクトバケット |
| **buildspec.yml フェーズ** | install → pre_build → build → post_build の4フェーズ。env セクションで Parameter Store / Secrets Manager から秘密情報を取得可能 | buildspec.yml, phases, env |
| **Blue/Green と ALB** | ALB のターゲットグループを切り替えてトラフィックを移行。CodeDeploy が自動でターゲットグループの重みを変更。ロールバック時はターゲットグループを元に戻す | ALB, Target Group, 重み付け |
| **Lambda デプロイプリファレンス** | Canary (10%→100%), Linear (10%ずつ段階的), AllAtOnce。エイリアスとバージョンを使用。BeforeAllowTraffic / AfterAllowTraffic フックで検証 | Canary, Linear, AllAtOnce, エイリアス |
| **appspec.yml Hooks 順序** | EC2: ApplicationStop → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService。Lambda: BeforeAllowTraffic → AfterAllowTraffic | ライフサイクルイベント, hooks |
| **CodePipeline クロスリージョン** | デプロイアクションを別リージョンで実行可能。各リージョンにアーティファクトバケットが必要。マルチリージョンデプロイメントで使用 | クロスリージョン, アーティファクトバケット |
| **CodeBuild コンピュートタイプ** | SMALL (3GB/2vCPU) ～ 2XLARGE (145GB/72vCPU)。Docker ビルドには LARGE 以上推奨。課金はビルド時間単位 (分単位) | コンピュートタイプ, ビルド時間課金 |
| **ロールバックトリガー** | CodeDeploy: デプロイ失敗時 + CloudWatch アラーム連動で自動ロールバック。CloudFormation: ロールバックトリガーでスタック更新後のモニタリング | 自動ロールバック, CloudWatch アラーム |
| **Manual Approval** | CodePipeline の承認アクションで SNS 通知。IAM ポリシーで承認権限を制御。タイムアウト (デフォルト7日) を設定可能 | Manual Approval, SNS, IAM |
| **CDK Pipelines** | セルフミューテーティングパイプライン。cdk synth → Cloud Assembly → CloudFormation デプロイ。パイプラインコードの変更も自動反映 | Self-mutating, Cloud Assembly |
| **CodeArtifact** | npm/pip/Maven のプライベートリポジトリ。アップストリームリポジトリで外部パッケージをキャッシュ。ドメインポリシーでクロスアカウント共有 | アップストリーム, ドメイン, パッケージ |
| **ECS Blue/Green** | CodeDeploy が ECS のタスクセットを管理。Production Listener と Test Listener で検証後切り替え。appspec.yml で TaskDefinition とコンテナ名を指定 | タスクセット, Listener, taskdef.json |
| **CodeBuild キャッシュ** | S3 キャッシュ (共有可能) とローカルキャッシュ (同一ホスト)。node_modules や .m2 のキャッシュでビルド高速化 | S3キャッシュ, ローカルキャッシュ |

## Well-Architected チェックリスト

### Operational Excellence (運用上の優秀性)
- [ ] すべてのデプロイが CI/CD パイプラインを通じて自動化されているか
- [ ] パイプラインの各ステージで適切なテスト (ユニット、統合、E2E) が実行されているか
- [ ] 本番デプロイ前に手動承認ステップが設けられているか
- [ ] パイプラインの失敗が SNS/EventBridge 経由で適切に通知されているか
- [ ] デプロイメトリクス (成功率、所要時間、頻度) が CloudWatch で監視されているか
- [ ] Infrastructure as Code (CDK/CloudFormation) がパイプラインに統合されているか

### Reliability (信頼性)
- [ ] Blue/Green または Canary デプロイ戦略が本番環境で採用されているか
- [ ] 自動ロールバックが CloudWatch アラーム連動で設定されているか
- [ ] デプロイ後の Bake Time (監視期間) が設定されているか
- [ ] データベースマイグレーションのロールバック戦略が定義されているか
- [ ] マルチリージョンデプロイが必要な場合、クロスリージョンパイプラインが構成されているか

### Security (セキュリティ)
- [ ] 秘密情報 (API キー、パスワード) がソースコードに含まれず、Parameter Store / Secrets Manager から取得されているか
- [ ] パイプラインの IAM ロールが最小権限の原則に従っているか
- [ ] クロスアカウントデプロイで適切な IAM ロールと信頼関係が設定されているか
- [ ] アーティファクトバケットが KMS で暗号化されているか
- [ ] CodeArtifact でサプライチェーンセキュリティが確保されているか

### Cost Optimization (コスト最適化)
- [ ] CodeBuild のコンピュートタイプがビルド要件に適切にサイジングされているか
- [ ] CodeBuild のキャッシュ (S3/ローカル) が設定されてビルド時間が最適化されているか
- [ ] Blue/Green デプロイの旧環境が適切なタイミングで削除されているか
- [ ] パイプラインの実行頻度が適切か (不要なトリガーがないか)

### Performance Efficiency (パフォーマンス効率)
- [ ] ビルドの並列実行が適切に設定されているか
- [ ] CodeBuild のキャッシュ戦略が最適化されているか
- [ ] デプロイの並行度 (MaxConcurrency) が適切に設定されているか
