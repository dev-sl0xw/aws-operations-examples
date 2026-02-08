# セクション03: Organizations & コンプライアンス
> Well-Architected Pillars: Security, Operational Excellence
> Day: 1 | 難易度: 中級

## 概要

AWS Organizationsは、複数のAWSアカウントを一元管理するサービスである。企業が成長するにつれ、単一のAWSアカウントでの運用は限界を迎える。環境分離(開発/本番)、チーム間の権限分離、請求の一元化、セキュリティガードレールの適用など、組織的なクラウド運用にはマルチアカウント戦略が不可欠となる。Organizationsはこの戦略の基盤を提供する。

AWS Configは、AWSリソースの構成変更を継続的に記録し、事前定義したルールに対する準拠状況を評価するサービスである。「リソースが今どのような設定になっているか」「いつ誰がどのように変更したか」「規定の設定基準を満たしているか」を常時監視する。コンプライアンス違反が検出された場合は、Systems Manager Automationと連携して自動修復(remediation)を実行できる。

Organizations、SCP、AWS Configの3つを組み合わせることで「Compliance as Code」(コンプライアンスのコード化)が実現する。手動の監査作業や属人的なセキュリティチェックを排除し、ガードレール(防護柵)として自動的にセキュリティ基準を維持する仕組みを構築できる。これはOperational Excellenceの「運用をコード化する」原則そのものである。

## キーコンセプト

### AWS Organizations の階層構造

**定義:** AWS Organizationsは、ルートアカウント(管理アカウント)を頂点とし、OU (Organizational Unit) によるツリー構造でメンバーアカウントを階層的に管理する。

**階層構造の例:**

```
Organization Root (管理アカウント)
├── OU: Security
│   ├── Account: Log Archive (全アカウントのログ集約)
│   └── Account: Security Tooling (GuardDuty, Security Hub等)
├── OU: Infrastructure
│   ├── Account: Shared Services (Active Directory, DNS等)
│   └── Account: Network Hub (Transit Gateway, VPN)
├── OU: Workloads
│   ├── OU: Production
│   │   ├── Account: App-A-Prod
│   │   └── Account: App-B-Prod
│   └── OU: Non-Production
│       ├── Account: App-A-Dev
│       └── Account: App-B-Dev
└── OU: Sandbox
    └── Account: Sandbox-01 (実験用)
```

**主要な機能:**

| 機能 | 説明 |
|------|------|
| **一括請求 (Consolidated Billing)** | 全アカウントの請求を管理アカウントに統合。ボリュームディスカウントの恩恵 |
| **SCP (Service Control Policies)** | OU/アカウント単位で権限の上限を設定 |
| **CloudFormation StackSets** | 複数アカウント・リージョンに一括デプロイ |
| **Tag Policies** | タグの命名規則を組織全体で強制 |
| **Backup Policies** | バックアップ戦略を組織全体で統一 |
| **AI Opt-out Policies** | AWSのAIサービスがデータを学習に使用することをオプトアウト |

---

### SCP (Service Control Policies)

**定義:** SCPはOrganizationsの機能であり、OU(組織単位)またはメンバーアカウントに対して、使用可能なAWSサービスとアクションの上限を設定するポリシーである。SCPは権限を付与しない -- あくまで上限(ガードレール)を設定するだけであり、実際のアクセスにはIAMポリシーが必要である。

**SCPの重要な性質:**

1. **管理アカウントには適用されない:** 管理アカウントにSCPをアタッチしても効果がない。これが管理アカウントでワークロードを実行すべきでない理由の一つ。
2. **継承される:** 親OUにアタッチされたSCPは、子OU・子アカウントに自動的に継承される。
3. **交差で評価される:** 複数のSCPが適用される場合、許可される操作はそれらの交差部分のみ。

**Deny-list戦略 vs Allow-list戦略:**

| 戦略 | デフォルトSCP | カスタムSCP | 特徴 |
|------|-------------|-------------|------|
| **Deny-list (推奨)** | `FullAWSAccess` を維持 | 禁止したいアクションを明示的にDeny | 柔軟。新サービスも自動的に利用可能 |
| **Allow-list** | `FullAWSAccess` を削除 | 許可するアクションのみを明示的にAllow | 厳格。新サービスは明示的に許可が必要 |

**Deny-list SCPの例:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyLeaveOrganization",
      "Effect": "Deny",
      "Action": "organizations:LeaveOrganization",
      "Resource": "*"
    },
    {
      "Sid": "DenyDisableCloudTrail",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyUnapprovedRegions",
      "Effect": "Deny",
      "NotAction": [
        "iam:*",
        "sts:*",
        "organizations:*",
        "support:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": [
            "ap-northeast-1",
            "us-east-1"
          ]
        }
      }
    }
  ]
}
```

**ソクラテス式 深堀り:**
> Q: 「SCPとは何か?IAMポリシーだけでは不十分なのか?」
> A: IAMポリシーは個々のユーザーやロールに対して権限を設定するが、アカウント全体のガードレールとしては機能しない。例えば、アカウント管理者がIAMポリシーを自由に変更できる環境では、管理者が自分自身にAdministratorAccessを付与して何でもできてしまう。SCPは個々のIAMポリシーの上位に位置し、「このアカウントではどんなIAMポリシーを設定しても、この操作だけは絶対にできない」というハードリミットを設ける。
> Q: 「SCPが管理アカウントに適用されないのはなぜか?」
> A: 管理アカウントにSCPが適用されると、組織全体のロックアウトが発生するリスクがある。管理アカウントはOrganizationsの管理操作を行う特権アカウントであり、万が一の設定ミスからの復旧に必要である。だからこそ、管理アカウントではワークロードを実行せず、管理目的のみに使用すべきである。

**現実世界のたとえ (非IT向け):**
> 「建物の消防法のようなもの。各テナント(アカウント)は部屋を好きに装飾できますが(IAMポリシー)、非常口は塞げません(SCPガードレール)。消防法は建物全体に適用され、個別のテナントの意向に関係なく遵守が必要です。ただし、ビルオーナー(管理アカウント)は消防法の適用外 -- だからこそビルオーナーの部屋には特別な注意が必要です」

---

### OU (Organizational Unit)

**定義:** OUはOrganizations内でアカウントをグループ化する論理的なコンテナ。最大5階層までネスト可能。OUにSCPをアタッチすることで、配下の全アカウントにポリシーを一括適用できる。

**ソクラテス式 深堀り:**
> Q: 「なぜOU構造が重要なのか?全アカウントをフラットに並べてはいけないのか?」
> A: フラット構造では、アカウントごとに個別にSCPを管理する必要があり、アカウント数が増えるとスケールしない。OU構造を使えば「本番環境のOU」にアタッチしたSCPが配下の全本番アカウントに自動適用される。100個の本番アカウントがあっても、SCP管理は1箇所で済む。
> Q: 「OU構造を設計する際の指針は?」
> A: 主に2つのアプローチがある。(1) 環境別 (Development, Staging, Production) -- セキュリティレベルが異なるワークロードを分離。(2) チーム/プロジェクト別 -- 組織構造に合わせた分離。多くの場合、両方を組み合わせた多層構造が採用される。

**現実世界のたとえ (非IT向け):**
> 「会社の組織図のようなもの。経営陣(root)の下に部門(OU)があり、部門の下にチーム(アカウント)がある。部門ルールは自動的にチーム全体に適用されます。人事部のルール(例: 勤怠管理方法)は人事部の全チームに適用され、エンジニアリング部門には影響しません」

---

### AWS Config

**定義:** AWS Configは、AWSリソースの構成変更を継続的に記録し、設定ルールに対するコンプライアンスを評価するサービス。「リソースの現在の構成」「構成変更の履歴」「ルールに対する準拠/非準拠の状態」を提供する。

**AWS Configの3つの柱:**

1. **構成記録 (Configuration Recording)**
   - リソースの構成変更を検出し、構成アイテム (Configuration Item) としてS3に保存
   - 構成アイテムには、リソースタイプ、ID、設定値、関連リソース、変更日時が含まれる

2. **ルール評価 (Rules Evaluation)**
   - マネージドルール: AWSが事前定義した一般的なルール (例: `s3-bucket-public-read-prohibited`)
   - カスタムルール: Lambda関数で独自のコンプライアンスロジックを実装
   - 適合パック (Conformance Packs): 複数のルールをパッケージ化したもの (例: CIS Benchmarks)

3. **修復 (Remediation)**
   - 非準拠リソースに対してSSM Automationドキュメントを自動実行
   - 例: パブリックアクセス可能なS3バケットを検出 → 自動的にパブリックアクセスをブロック

**マネージドルールの例:**

| ルール名 | チェック内容 |
|---------|-------------|
| `s3-bucket-public-read-prohibited` | S3バケットがパブリック読み取り可能でないか |
| `encrypted-volumes` | EBSボリュームが暗号化されているか |
| `root-account-mfa-enabled` | ルートアカウントにMFAが有効か |
| `required-tags` | 指定したタグがリソースに付与されているか |
| `rds-instance-public-access-check` | RDSがパブリックアクセス可能でないか |
| `iam-password-policy` | IAMパスワードポリシーが基準を満たしているか |
| `cloudtrail-enabled` | CloudTrailが有効化されているか |

**カスタムルールの構成:**

```python
# Lambda関数でカスタムルールを実装
import json
import boto3

def lambda_handler(event, context):
    config = boto3.client('config')

    # 評価対象のリソース構成を取得
    configuration_item = json.loads(event['invokingEvent'])['configurationItem']

    # カスタムロジックでコンプライアンスを評価
    if configuration_item['resourceType'] == 'AWS::EC2::Instance':
        instance_type = configuration_item['configuration']['instanceType']

        # 禁止されたインスタンスタイプのチェック
        prohibited_types = ['p3.2xlarge', 'p3.8xlarge', 'p4d.24xlarge']
        if instance_type in prohibited_types:
            compliance_type = 'NON_COMPLIANT'
            annotation = f'Prohibited instance type: {instance_type}'
        else:
            compliance_type = 'COMPLIANT'
            annotation = 'Instance type is allowed'

    # 評価結果をConfig に報告
    config.put_evaluations(
        Evaluations=[{
            'ComplianceResourceType': configuration_item['resourceType'],
            'ComplianceResourceId': configuration_item['resourceId'],
            'ComplianceType': compliance_type,
            'Annotation': annotation,
            'OrderingTimestamp': configuration_item['configurationItemCaptureTime']
        }],
        ResultToken=event['resultToken']
    )
```

**ソクラテス式 深堀り:**
> Q: 「AWS Configとは何か?CloudTrailとの違いは?」
> A: CloudTrailは「誰がいつ何のAPIを呼んだか」というアクティビティログを記録する。AWS Configは「リソースの構成が今どうなっているか、いつどう変わったか、ルールに準拠しているか」を記録する。例えば、セキュリティグループのインバウンドルールに0.0.0.0/0が追加された場合、CloudTrailは「AuthorizeSecurityGroupIngressが呼ばれた」と記録し、Configは「このセキュリティグループのインバウンドルールが変更され、パブリックアクセスルールが非準拠になった」と記録する。
> Q: 「Configの自動修復は万能か?」
> A: 自動修復は強力だが注意が必要。(1) 修復アクションが他のリソースに影響を与える可能性がある。(2) 修復が失敗した場合のエスカレーションパスが必要。(3) 本番環境では自動修復を慎重に適用し、まず通知のみから開始することが推奨される。

**現実世界のたとえ (非IT向け):**
> 「建物の定期点検のようなもの。消防設備(セキュリティ設定)が基準に合っているか常にチェックし、不適合なら自動で修正(remediation)できます。点検員(Configルール)は決められたチェックリストに従い、消火器の有効期限切れ(非準拠リソース)を見つけたら自動で交換手配(SSM Automation)します」

---

### Config Aggregator

**定義:** AWS Config Aggregatorは、複数のAWSアカウントおよびリージョンからConfigの構成データとコンプライアンス結果を集約するリソース。組織全体のコンプライアンス状況を一元的に把握できる。

**2つのアグリゲーターソース:**

| ソースタイプ | 説明 |
|-------------|------|
| **Organizations** | 組織内の全アカウント・全リージョンから自動集約 |
| **個別アカウント** | 指定したアカウントIDとリージョンから集約 (組織外のアカウントも可) |

**構成:**

```
集約アカウント (Aggregator Account)
  ├── Config Aggregator
  │     ├── ソース: Organization (全メンバーアカウント)
  │     └── リージョン: 全リージョン
  │
  ├── 集約ビュー: 全アカウントの非準拠リソース一覧
  └── ダッシュボード: コンプライアンスサマリー
```

---

### Conformance Packs (適合パック)

**定義:** AWS Config Conformance Packsは、複数のConfigルールと修復アクションをパッケージ化したもの。業界標準のコンプライアンスフレームワーク(CIS Benchmarks, PCI DSS, NIST等)に対応するテンプレートがAWSから提供されている。

**主なAWS提供テンプレート:**

| パック名 | 内容 |
|---------|------|
| CIS AWS Foundations Benchmark | CISが定義するAWSセキュリティベストプラクティス |
| AWS Operational Best Practices for PCI DSS | PCI DSS準拠のためのルールセット |
| AWS Operational Best Practices for NIST 800-53 | NIST 800-53フレームワーク準拠 |

---

### Compliance as Code

**定義:** コンプライアンス要件をコードとして定義・管理し、自動的に評価・修復するアプローチ。手動の監査プロセスをコード化することで、継続的なコンプライアンス維持を実現する。

**実現要素:**

```
Compliance as Code スタック
┌───────────────────────────────────────┐
│  SCP: アカウントレベルのガードレール      │  ← 予防的制御
├───────────────────────────────────────┤
│  Service Catalog: 承認済み構成のみ提供   │  ← 予防的制御
├───────────────────────────────────────┤
│  AWS Config Rules: 構成のコンプライアンス │  ← 検知的制御
├───────────────────────────────────────┤
│  SSM Automation: 非準拠リソースの自動修復 │  ← 是正的制御
├───────────────────────────────────────┤
│  Config Aggregator: 組織全体の可視化     │  ← 可視化
└───────────────────────────────────────┘
```

**予防的制御 (Preventive Controls):** 違反が発生する前にブロック
- SCP: 禁止されたアクションをブロック
- Service Catalog: 承認済み構成のみをプロビジョニング可能にする

**検知的制御 (Detective Controls):** 違反が発生した後に検出
- AWS Config Rules: 非準拠リソースを検出
- GuardDuty: 脅威を検出

**是正的制御 (Corrective Controls):** 検出された違反を修復
- SSM Automation: 自動修復アクションを実行

## アーキテクチャパターン

### パターン1: ランディングゾーン (Landing Zone)

```
Management Account
  ├── AWS Control Tower (自動セットアップ)
  │     ├── Mandatory OU: Security
  │     │     ├── Log Archive Account
  │     │     └── Audit Account
  │     ├── Registered OUs
  │     │     ├── OU: Production
  │     │     └── OU: Development
  │     └── Guardrails (SCPs + Config Rules)
  │
  ├── AWS Organizations
  ├── AWS IAM Identity Center (SSO)
  ├── CloudTrail (全アカウント)
  └── Config (全アカウント)
```

AWS Control Towerは、ベストプラクティスに基づいたマルチアカウント環境を自動セットアップする。必須のガードレール(SCP + Config Rules)が自動的に適用される。

### パターン2: セキュリティアカウントパターン

```
Security Tooling Account
  ├── GuardDuty (委任管理者)
  ├── Security Hub (委任管理者)
  ├── Config Aggregator
  ├── IAM Access Analyzer
  └── CloudWatch Cross-Account Dashboard

Log Archive Account
  ├── CloudTrail ログ (全アカウント)
  ├── Config スナップショット (全アカウント)
  ├── VPC Flow Logs (全アカウント)
  └── S3 バケット (WORM: Write Once Read Many)
```

セキュリティツールと監査ログを専用アカウントに分離し、ワークロードアカウントの管理者がログを改ざんできないようにする。

### パターン3: Config修復パイプライン

```
リソース変更 → Config検出 → ルール評価 → 非準拠検出
                                           ↓
                              SSM Automation (自動修復)
                                           ↓
                                   修復成功? → YES → 完了
                                           ↓ NO
                              SNS通知 → 運用チームに手動対応依頼
```

## SAA試験のポイント

- **SCPは管理アカウントには適用されない。** 管理アカウントのIAMユーザーはSCPの制約を受けない。
- **SCPはIAMの実効権限の上限を設定するが、権限を付与しない。** SCPでAllowしただけではアクセスできない。IAMポリシーでのAllowも必要。
- **SCPのデフォルトポリシー `FullAWSAccess`** を削除すると、明示的にAllowされていない操作は全てブロックされる(Allow-list戦略)。
- **AWS ConfigはリージョナルサービスだがAggregatorでクロスリージョン集約可能。** 各リージョンでConfigを有効にする必要がある。
- **Config Rulesのトリガータイプ:** (1) 構成変更時 (Configuration Changes): リソースが変更されるたびに評価。(2) 定期的 (Periodic): 1時間/3時間/6時間/12時間/24時間ごとに評価。
- **Configの修復アクションはSSM Automationドキュメント** で定義する。AWSは一般的な修復のための事前定義ドキュメントを提供。
- **Conformance Packsは組織レベルでデプロイ可能** で、全メンバーアカウントに一括適用できる。
- **Organizations の一括請求** では、全アカウントのリソース使用量が合算されるため、ボリュームディスカウント(S3, EC2 RI等)の恩恵を受けられる。
- **Tag Policies** はタグのキー名と許可される値を定義するが、タグの付与を強制するものではない(SCPと組み合わせて強制する)。

## ハンズオン参照

- CDKプロジェクト: `cdk-projects/01-iam-org-governance/`
- 主要スタック: OrganizationsGovernanceStack
- 実装内容:
  - OU構造の定義
  - SCP (Deny-list戦略) の適用
  - AWS Config Rulesの設定 (マネージドルール + カスタムルール)
  - 修復アクションの設定 (SSM Automation)

## Well-Architected チェックリスト

### Security
- [ ] マルチアカウント戦略が策定され、OU構造が設計されているか
- [ ] 管理アカウントでワークロードを実行していないか
- [ ] SCPでリージョン制限が適用されているか (不要なリージョンでのリソース作成を禁止)
- [ ] SCPでCloudTrail/Configの無効化が禁止されているか
- [ ] AWS Configが全アカウント・全リージョンで有効化されているか
- [ ] Config Aggregatorで組織全体のコンプライアンスが可視化されているか
- [ ] 非準拠リソースに対する修復アクションが定義されているか
- [ ] セキュリティログが専用アカウントに集約され、改ざん防止されているか

### Operational Excellence
- [ ] 新規アカウントの作成が自動化されているか (Account Factory)
- [ ] ガードレール(SCP + Config Rules)がコードとして管理されているか
- [ ] コンプライアンス状況のダッシュボードが構築されているか
- [ ] 非準拠検出時のエスカレーションパスが定義されているか
- [ ] 定期的なコンプライアンスレビューのプロセスが確立されているか
