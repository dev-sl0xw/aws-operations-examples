# セクション09: セキュリティ統制 (Security Controls)
> Well-Architected Pillar: Security
> Day: 3 | 難易度: 中級

## 概要

セキュリティ統制とは、AWSリソースを脅威から保護するための技術的・組織的な仕組みの総称である。AWSではセキュリティ統制を3つのカテゴリに分類する: Preventive (予防的)、Detective (検出的)、Responsive (対応的)。これらの統制を多層的に組み合わせることで、Defense in Depth (多層防御) を実現する。

予防的統制はIAM、SCP、Permission Boundaries、WAFなど「そもそも問題を発生させない」仕組みである。検出的統制はCloudTrail、GuardDuty、Inspector、Config Rules、Access Analyzerなど「問題が発生したことを素早く検知する」仕組みである。対応的統制はLambda Remediation、SSM Automation、EventBridge Rulesなど「検知した問題に対して自動的に修復・対応する」仕組みである。

SAA試験ではこの3分類を理解した上で、具体的なサービスがどのカテゴリに属するかを問う問題が頻出する。特にCloudTrail、GuardDuty、Inspectorの違いと使い分けは必須知識である。本セクションでは各サービスの特徴を第一原理から掘り下げ、試験で問われるポイントを整理する。

## キーコンセプト

### セキュリティ統制の分類 (Security Control Classification)

**定義:** セキュリティ統制を目的・機能ごとに分類するフレームワーク。予防的統制 (Preventive) は問題の発生を未然に防ぎ、検出的統制 (Detective) は発生した問題を検知し、対応的統制 (Responsive) は検知した問題を修復する。

**ソクラテス式 深堀り:**
> Q: 「なぜ予防的統制だけでは不十分なのか?」
> A: 予防的統制は既知のリスクには有効だが、全ての攻撃パターンを事前に予測することは不可能である。例えばIAMポリシーで最小権限を設定しても、正規のクレデンシャルが漏洩した場合、予防的統制は突破される。検出的統制 (GuardDuty等) がなければ、この侵害に気付くことすらできない。
> Q: 「では、検出的統制があれば対応的統制は不要か?」
> A: 検出だけでは問題は解決しない。GuardDutyが「不正なAPI呼び出しを検出」しても、人間が対応するまでの間に被害は拡大する。対応的統制 (EventBridge + Lambda) が自動でアクセスキーを無効化すれば、検出から数秒で被害を封じ込められる。この3層の組み合わせが多層防御の本質である。

**現実世界のたとえ (非IT向け):**
> 「中世の城を想像してください。堀 (WAF - 外部からの悪意あるリクエストをブロック)、跳ね橋 (ALB - 正規のトラフィックのみ通過)、外壁 (NACL - サブネットレベルのフィルタ)、内壁 (Security Group - インスタンスレベルのフィルタ)、見張り塔 (GuardDuty - 脅威の検出)、巡回ログ (CloudTrail - 全ての行動を記録)。一つの壁が破られても、攻撃者は全ての防御層を突破しなければならない」

**統制の具体例マトリックス:**

| カテゴリ | サービス | 機能 |
|----------|----------|------|
| Preventive | IAM Policies | リソースへのアクセスを制限 |
| Preventive | SCP (Organizations) | アカウント全体の権限上限を制御 |
| Preventive | Permission Boundaries | IAMエンティティの権限上限を設定 |
| Preventive | WAF | Webアプリケーションへの悪意あるリクエストをブロック |
| Detective | CloudTrail | 全API呼び出しを記録・監査 |
| Detective | GuardDuty | 脅威インテリジェンス + ML で脅威を検出 |
| Detective | Inspector | 脆弱性スキャン (CVE + ネットワーク到達性) |
| Detective | Config Rules | リソース設定のコンプライアンス評価 |
| Detective | IAM Access Analyzer | 外部共有・未使用アクセスの検出 |
| Responsive | Lambda + EventBridge | 検出イベントをトリガーに自動修復 |
| Responsive | SSM Automation | 定義済みランブックによる自動修復 |
| Responsive | Config Remediation | Config Rules 非準拠リソースの自動修復 |

---

### IAM Access Analyzer

**定義:** IAM Access Analyzerは、AWSリソースに対する外部アクセス、未使用のアクセス権限、およびIAMポリシーの妥当性を分析するサービス。Zone of Trust (信頼ゾーン) を定義し、そのゾーン外からのアクセスを「Finding (検出結果)」として報告する。

**ソクラテス式 深堀り:**
> Q: 「IAM Access Analyzerとは何か? なぜ必要なのか?」
> A: AWSアカウント内のリソース(S3バケット、IAMロール、KMSキー、Lambda関数、SQSキュー等)が、意図せず外部(他のAWSアカウントやインターネット)に公開されていないかを自動的に検出するサービスである。大規模な環境では数百のS3バケットポリシーやIAMロールの信頼ポリシーを人間が全て確認するのは不可能であり、見落としが深刻なデータ漏洩につながる。
> Q: 「では、Access Analyzerがないとどうなるか?」
> A: (1) パブリックなS3バケットの存在に数ヶ月間気付かない可能性がある。(2) クロスアカウントのIAMロール信頼関係が過剰に広く設定されていても発見できない。(3) 使われていないアクセスキーやロールが攻撃の踏み台になる。実際、2019年のCapital One事件ではS3バケットの過剰なアクセス許可が主因の一つだった。

**3つの主要機能:**

1. **外部アクセス分析 (External Access Findings)**
   - S3バケット、IAMロール、KMSキー、Lambda関数、SQSキュー、Secrets Manager等を対象
   - 信頼ゾーン外のプリンシパルからアクセス可能なリソースを検出
   - 自動的かつ継続的にスキャンされる

2. **ポリシー検証とポリシー生成**
   - Policy Validation: IAMポリシーの文法エラー、ベストプラクティス違反を検出
   - Policy Generation: CloudTrailのアクティビティログから最小権限ポリシーを自動生成
   - 生成されたポリシーは過去の実際のAPI呼び出しに基づく

3. **未使用アクセス分析 (Unused Access Findings)**
   - 指定期間内に使用されていないロール、アクセスキー、パスワードを検出
   - 最小権限の原則の維持に不可欠

---

### Permission Boundaries (アクセス許可の境界)

**定義:** IAMエンティティ (ユーザーまたはロール) に付与できる最大権限を定義するIAMポリシー。Effective permissions (有効な権限) は、IAMポリシーとPermission Boundaryの共通部分 (交差集合) のみとなる。

**数式表現:**
```
有効な権限 = IAM ポリシー ∩ Permission Boundary
```

**ソクラテス式 深堀り:**
> Q: 「Permission Boundaryとは何か? なぜIAMポリシーだけでは不十分なのか?」
> A: IAMポリシーは「何ができるか」を定義するが、管理者が開発者にIAMロール作成権限を委任すると、開発者は自分より強い権限のロールを作成できてしまう (権限エスカレーション)。Permission Boundaryは「何があってもこれ以上の権限は持てない」という上限を設定することで、この問題を解決する。
> Q: 「具体的にはどういうシナリオで使うのか?」
> A: 典型的なユースケースは開発者セルフサービスパターンである。開発者がLambda関数用のIAMロールを自分で作成する必要があるが、管理者権限を持つロールを作成されては困る。Permission Boundaryを条件として設定することで、「開発者はIAMロールを作成できるが、必ず指定されたPermission Boundaryを付けなければならない。そしてそのBoundaryがDynamoDBとS3のみ許可する」という制御が実現する。

**現実世界のたとえ (非IT向け):**
> 「子供のお小遣い上限のようなもの。親 (管理者) が月5,000円の上限 (Permission Boundary) を設定し、子供 (開発者) はその範囲内で自由に使える (IAMポリシー)。子供が『お菓子に3,000円、漫画に2,000円』と決めても (IAMポリシー)、合計5,000円を超えることは物理的にできない。たとえ子供が自分で新しい予算カテゴリを作っても、上限は変わらない」

**委任パターンの実装例:**

```json
{
  "Effect": "Allow",
  "Action": ["iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary": "arn:aws:iam::123456789012:policy/DeveloperBoundary"
    }
  }
}
```

---

### CloudTrail

**定義:** AWSアカウント内の全てのAPI呼び出しを記録するサービス。マネジメントコンソール、CLI、SDK、他のAWSサービスからの呼び出しを含む。セキュリティ監査、コンプライアンス証明、インシデント調査の基盤となる。

**ソクラテス式 深堀り:**
> Q: 「CloudTrailとは何か? なぜ必要なのか?」
> A: CloudTrailは「AWSアカウント内で誰が、いつ、何をしたか」を全て記録する監査ログサービスである。セキュリティの世界では「ログがなければ、インシデントは存在しないのと同じ」と言われる。CloudTrailがなければ、不正アクセスが発生しても原因究明が不可能になる。
> Q: 「セキュリティインシデント発生時に最初にすべきことは?」
> A: **まずCloudTrailを確認する。** これはAWS運用における鉄則である。CloudTrailのログから、(1) いつ不正アクセスが始まったか、(2) どのAPIが呼ばれたか、(3) どのリソースが影響を受けたか、(4) 発信元IPアドレスは何か、を特定できる。

**現実世界のたとえ (非IT向け):**
> 「ビル内の監視カメラ映像のようなもの。誰が、いつ、どの部屋に、何をしに入ったかが全て記録される。事件 (インシデント) が起きたら最初に確認する証拠映像」

**イベントの種類:**

| イベント種別 | 説明 | 例 | デフォルト |
|-------------|------|-----|-----------|
| Management Events | コントロールプレーン操作 | CreateBucket, RunInstances, CreateUser | 有効 (無料) |
| Data Events | データプレーン操作 | GetObject, PutObject, Invoke (Lambda) | 無効 (有料) |
| Insights Events | 異常なAPI呼び出しパターン | 通常の10倍のDeleteObject | オプション |

**重要な機能:**

- **Organization Trail:** Organizations全アカウントのログを一元管理。管理アカウントから設定し、専用S3バケットに集約する。
- **ログファイル整合性検証 (Log File Integrity Validation):** SHA-256ハッシュチェーンによる改ざん検出。1時間ごとにダイジェストファイルが生成され、ログの改ざんや削除を検出できる。法的証拠としてのログの信頼性を担保する。
- **CloudTrail Lake:** SQLベースのログクエリサービス。従来のS3 + Athenaの代替として、CloudTrailイベントを直接SQLで検索可能。最大7年間のデータ保持。

```sql
-- CloudTrail Lake クエリ例: 過去24時間の失敗したAPI呼び出し
SELECT eventTime, eventName, userIdentity.arn, errorCode, errorMessage
FROM event_data_store_id
WHERE eventTime > '2026-02-09 00:00:00'
  AND errorCode IS NOT NULL
ORDER BY eventTime DESC
```

---

### GuardDuty

**定義:** AWS環境における脅威を、脅威インテリジェンスフィードと機械学習 (ML) ベースの異常検出によって継続的にモニタリングし、検出するマネージドサービス。エージェント不要で有効化するだけで動作する。

**ソクラテス式 深堀り:**
> Q: 「GuardDutyとは何か? CloudTrailとの違いは何か?」
> A: CloudTrailは「記録」するサービスであり、GuardDutyは「分析・検出」するサービスである。CloudTrailが監視カメラの映像だとすれば、GuardDutyはその映像をAIで分析して不審な行動を自動検出するシステムである。GuardDutyはCloudTrailのログ、VPC Flow Logs、DNS Logs等を分析データソースとして使用する。
> Q: 「GuardDutyがないとどうなるか?」
> A: CloudTrailのログは膨大であり、人間が全てを確認するのは不可能である。1日に数百万件のAPIイベントが記録される環境で、その中から「午前3時に普段使わないリージョンでEC2が100台起動された (クリプトマイニング)」を見つけ出すのは人間には困難だが、GuardDutyのMLモデルは過去の行動パターンからの逸脱として即座に検出する。

**データソース:**

| データソース | 分析対象 | 検出例 |
|-------------|---------|--------|
| VPC Flow Logs | ネットワークトラフィックパターン | C&Cサーバーへの通信、ポートスキャン |
| DNS Logs | DNS クエリ | 既知のマルウェアドメインへの名前解決 |
| CloudTrail Management Events | API呼び出しパターン | 不正なAPI呼び出し、権限エスカレーション |
| CloudTrail S3 Data Events | S3データアクセスパターン | 異常な大量データダウンロード |
| EKS Audit Logs | Kubernetes APIサーバーログ | 不審なコンテナ操作 |

**Finding Types (検出結果の種類):**

- **Backdoor:** リソースがバックドアとして利用されている (DDoS攻撃元など)
- **CryptoCurrency:** クリプトマイニング活動の検出
- **Trojan:** トロイの木馬的な活動の検出
- **UnauthorizedAccess:** 不正アクセスの試行や成功
- **Recon:** 偵察活動 (ポートスキャン、API列挙)
- **Exfiltration:** データの外部持ち出し

**Severity Levels (重要度):**

| レベル | 数値範囲 | 意味 | 対応 |
|--------|---------|------|------|
| Low | 1.0 - 3.9 | 不審だが影響は限定的 | 定期レビュー |
| Medium | 4.0 - 6.9 | 想定外の活動を確認 | 調査が必要 |
| High | 7.0 - 8.9 | リソースが侵害された可能性 | 即座に対応 |

---

### Inspector

**定義:** Amazon Inspector v2は、EC2インスタンス、ECRコンテナイメージ、Lambda関数の脆弱性を自動的にスキャンするマネージドサービス。CVE (Common Vulnerabilities and Exposures) データベースとネットワーク到達性分析を使用する。

**ソクラテス式 深堀り:**
> Q: 「Inspectorとは何か? GuardDutyとの違いは何か?」
> A: GuardDutyは「現在進行中の脅威」を検出するのに対し、Inspectorは「存在する脆弱性」を検出する。GuardDutyが「泥棒が侵入中」を検知するシステムだとすれば、Inspectorは「鍵が壊れている窓がある」を事前に発見する点検サービスである。Inspectorは攻撃が発生する前に弱点を見つけることに焦点を当てる。
> Q: 「CVEとは何か?」
> A: Common Vulnerabilities and Exposures (共通脆弱性識別子) の略で、公開されたセキュリティ脆弱性の標準的な識別システムである。各脆弱性にはCVE-2024-XXXXXのような一意のIDが付与される。

**現実世界のたとえ (非IT向け):**
> 「自動車のリコール通知のようなもの。ブレーキの欠陥 (脆弱性) が発見されると、一意のリコール番号 (CVE-2024-XXXXX) が付与される。全ての車オーナー (システム管理者) がこの番号で自分の車が対象か確認できる。Inspectorはこの確認作業を自動で行う」

**Inspector v2 の主要特徴:**

| 特徴 | 説明 |
|------|------|
| エージェントレス | SSM Agentを利用。専用エージェント不要 |
| 自動スキャン | 有効化するだけで対象リソースを自動検出・スキャン |
| CVEデータベース | NVD等の脆弱性データベースと統合、新CVE公開時に自動再スキャン |
| ネットワーク到達性 | EC2インスタンスへのネットワークパスを分析 |
| ECRスキャン | コンテナイメージのOSパッケージとプログラミング言語パッケージの脆弱性検出 |
| Lambda関数スキャン | デプロイされた関数コードと依存パッケージの脆弱性検出 |
| Risk Score | CVSSスコアに加え、ネットワーク到達性を加味した独自のリスクスコア |

---

### 自動修復パターン (Responsive Controls)

**定義:** 検出的統制が発見した問題を自動的に修復する仕組み。EventBridge + Lambdaの組み合わせが最も一般的なパターンである。

**典型的な自動修復フロー:**

```
GuardDuty Finding (High Severity)
  → EventBridge Rule (フィルタ: severity >= 7)
    → Lambda Function (自動修復)
      → IAM: アクセスキーの無効化
      → EC2: セキュリティグループの隔離
      → SNS: セキュリティチームへ通知
```

```
Config Rule (S3バケットがパブリック)
  → Config Remediation (SSM Automation)
    → S3: パブリックアクセスブロック設定を有効化
    → SNS: 管理者へ通知
```

**EventBridge Rule のイベントパターン例:**

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{ "numeric": [">=", 7] }]
  }
}
```

## アーキテクチャパターン

### パターン1: 多層防御アーキテクチャ

```
Internet
  │
  ├── WAF (Layer 7 フィルタリング: SQLi, XSS, Bot Control)
  │
  ├── CloudFront (DDoS 緩和: Shield Standard 自動適用)
  │
  ├── ALB (TLS 終端, パス/ホストベースルーティング)
  │     │
  │     └── Security Group (ALB用: 443のみ許可)
  │
  ├── EC2 / ECS (アプリケーション層)
  │     │
  │     └── Security Group (アプリ用: ALBからの通信のみ)
  │
  ├── RDS (データ層)
  │     │
  │     └── Security Group (DB用: アプリ層からの3306のみ)
  │
  └── Monitoring Layer
        ├── CloudTrail (全API呼び出しの記録)
        ├── GuardDuty (脅威検出)
        ├── Inspector (脆弱性スキャン)
        └── Config Rules (設定コンプライアンス)
```

### パターン2: インシデント対応自動化

```
Step 1: 検出
  GuardDuty → "UnauthorizedAccess:IAMUser/MaliciousIPCaller.Custom"

Step 2: 通知 + 自動修復
  EventBridge Rule → Lambda Function
    ├── IAM: 侵害されたアクセスキーを無効化
    ├── EC2: 影響を受けたインスタンスのSGを隔離用SGに変更
    ├── SNS: セキュリティチームにPagerDutyアラート
    └── CloudWatch: カスタムメトリクス記録

Step 3: 調査
  CloudTrail Lake → SQL クエリで影響範囲を特定
  VPC Flow Logs → 不審な通信先の特定

Step 4: 復旧
  SSM Automation → 標準化された復旧ランブック実行
```

### パターン3: Organization レベルのセキュリティ統制

```
Management Account
  ├── CloudTrail Organization Trail → Central S3 Bucket
  ├── GuardDuty 委任管理者 → Security Account
  ├── Inspector 委任管理者 → Security Account
  └── Config Aggregator → Security Account

Security Account (委任管理者)
  ├── GuardDuty: 全メンバーアカウントの脅威を一元管理
  ├── Inspector: 全メンバーアカウントの脆弱性を一元管理
  ├── SecurityHub: Findingsの統合ダッシュボード
  └── EventBridge: クロスアカウントの自動修復
```

## SAA試験のポイント

- **セキュリティインシデント発生時の最初のアクションは CloudTrail の確認** である。「What is the FIRST step?」系の問題ではCloudTrailが正解になることが多い。
- **GuardDuty はエージェントレス** で有効化するだけで動作する。Inspector v2 もSSM Agent経由でエージェントレスに動作する。
- **GuardDuty のデータソース** にCloudWatch Logsは含まれない。VPC Flow Logs、DNS Logs、CloudTrail Events、S3 Data Events、EKS Audit Logsが対象。
- **Inspector v2 は v1 とは全く異なるサービス** と考えてよい。v2はエージェントレス、自動スキャン、ECR/Lambda対応。v1は手動実行、エージェント必要だった。
- **Permission Boundary は IAM ポリシーの AND 条件** として機能する。Boundary で許可されていても IAM ポリシーで許可されていなければアクセスは拒否される。逆も同様。
- **IAM Access Analyzer の「External Access」** は信頼ゾーン外からのアクセスを検出する。信頼ゾーンはAWSアカウントまたはOrganization。
- **CloudTrail のログファイル整合性検証** は SHA-256 ハッシュチェーンを使用する。法的証拠としてのログの信頼性が問われた場合はこの機能が答え。
- **CloudTrail の Management Events はデフォルトで有効** (無料)。Data Events はオプション (有料) で明示的に有効化が必要。S3の GetObject/PutObject ログが必要な場合は Data Events を有効化する。
- **GuardDuty の Findings は EventBridge 経由** で他のサービスに連携可能。Lambda で自動修復するパターンは頻出。
- **Config Rules と Inspector の違い:** Config Rules はリソースの設定 (Security Group が特定のポートを開いているか等) を評価する。Inspector はソフトウェアの脆弱性 (CVE) とネットワーク到達性を評価する。
- **CloudTrail Lake vs Athena:** CloudTrail Lake はCloudTrail専用のSQLクエリサービス。Athena はS3上の任意のデータに対するSQLクエリ。CloudTrail Lake は設定が簡単だが、Athena の方がコスト効率が良い場合がある。

## ハンズオン参照

- CDKプロジェクト: `cdk-projects/05-security-edge/`
- 構築する主要リソース:
  - CloudTrail Trail (Organization Trail)
  - GuardDuty Detector
  - Inspector の有効化
  - IAM Access Analyzer
  - EventBridge Rule + Lambda 自動修復
  - Permission Boundary ポリシー
- 確認ポイント:
  - CloudTrail でコンソール操作のログが記録されることを確認
  - GuardDuty のサンプル Finding を生成して EventBridge 連携を確認
  - Inspector で EC2 インスタンスの脆弱性スキャン結果を確認
  - Permission Boundary を付与したロールで権限エスカレーションが防がれることを確認

## Well-Architected チェックリスト

### Security - Identity and Access Management
- [ ] 全てのIAMユーザーにMFAが有効化されているか
- [ ] ルートアカウントの使用を最小限に抑え、MFAを設定しているか
- [ ] IAMポリシーが最小権限の原則に従っているか
- [ ] IAM Access Analyzerで外部アクセスのFindingsを定期的にレビューしているか
- [ ] 未使用のIAMユーザー、ロール、アクセスキーを定期的にクリーンアップしているか
- [ ] Permission Boundaryを使用して開発者のセルフサービスを安全に委任しているか

### Security - Detective Controls
- [ ] CloudTrailが全リージョンで有効化されているか
- [ ] CloudTrailのログファイル整合性検証が有効化されているか
- [ ] GuardDutyが全アカウント・全リージョンで有効化されているか
- [ ] Inspectorが自動スキャンモードで有効化されているか
- [ ] Config Rulesでセキュリティベースラインの準拠状況を監視しているか
- [ ] VPC Flow Logsが全VPCで有効化されているか

### Security - Incident Response
- [ ] セキュリティインシデント対応手順が文書化されているか
- [ ] GuardDutyのHigh Severity FindingsにEventBridgeルールが設定されているか
- [ ] 自動修復Lambda関数がテストされているか
- [ ] CloudTrail Lakeまたは Athena でインシデント調査クエリが準備されているか
- [ ] インシデント対応の定期的な訓練 (Game Day) を実施しているか
