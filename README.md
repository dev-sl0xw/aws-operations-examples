# AWS Operations Examples

AWS SAA レベルの知識を基盤に、**Well-Architected Framework 6つの柱**をベースとしたバックオフィス支援・Operations業務のための学習プロジェクト。

## 学習リソース

- [Classmethod: Cloud Operations on AWS Day1 - IaC](https://dev.classmethod.jp/articles/aws-cloud-operations-on-aws-day1-iac/)
- [Classmethod: Cloud Operations on AWS Day2](https://dev.classmethod.jp/articles/aws-cloud-operations-on-aws-day2/)
- [Classmethod: Cloud Operations on AWS Day3](https://dev.classmethod.jp/articles/aws-cloud-operations-on-aws-day3/)

## プロジェクト構造

```
├── study-book/          # 学習ノート (ソクラテス式 + 現実比喩)
├── cdk-projects/        # AWS CDK ハンズオン (TypeScript & Python)
├── diagrams/            # Mermaid アーキテクチャ図
└── scripts/             # セットアップヘルパー
```

## Prerequisites

- Node.js >= 18
- Python >= 3.9
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS CLI configured with credentials

## 学習パス

### Day 1: IaC & アクセス制御
1. [IaC基礎](study-book/2026-02-08-IaCFoundations.md)
2. [IAM深堀り](study-book/2026-02-08-IAMDeepDive.md) (JWT, OIDC)
3. [Organizations & コンプライアンス](study-book/2026-02-08-OrganizationsCompliance.md)
4. [Systems Manager](study-book/2026-02-08-SystemsManager.md)

### Day 2: 運用 & モニタリング
5. [監視運用](study-book/2026-02-09-OperationsMonitoring.md)
6. [ネットワーク & LB](study-book/2026-02-09-NetworkingLoadBalancing.md) (OSI, DNS, SSL)
7. [Auto Scaling](study-book/2026-02-09-AutoScalingResilience.md)
8. [イベント駆動 & 可観測性](study-book/2026-02-09-EventDrivenObservability.md)

### Day 3: セキュリティ, ネットワーク & ストレージ
9. [セキュリティ統制](study-book/2026-02-10-SecurityControls.md)
10. [VPC設計](study-book/2026-02-10-VPCNetworkDesign.md) (VPC Endpoint, CIDR)
11. [エッジ & CDN](study-book/2026-02-10-EdgeSecurityCDN.md)
12. [ストレージ & バックアップ](study-book/2026-02-10-StorageBackup.md)

## CDK ハンズオン

| # | プロジェクト | 言語 | セットアップ |
|---|------------|------|------------|
| 01 | IAM Org Governance | TypeScript | `./scripts/setup-ts-project.sh cdk-projects/01-iam-org-governance` |
| 02 | SSM Operations | Python | `./scripts/setup-py-project.sh cdk-projects/02-ssm-operations` |
| 03 | Monitoring & Observability | TypeScript | `./scripts/setup-ts-project.sh cdk-projects/03-monitoring-observability` |
| 04 | Networking & LB | TypeScript | `./scripts/setup-ts-project.sh cdk-projects/04-networking-loadbalancing` |
| 05 | Security & Edge | Python | `./scripts/setup-py-project.sh cdk-projects/05-security-edge` |
| 06 | Storage & Backup | Python | `./scripts/setup-py-project.sh cdk-projects/06-storage-backup` |

### CDK プロジェクト詳細

<details>
<summary><strong>01 - IAM Org Governance</strong> (TypeScript)</summary>

- **学習内容**: IAMロール設計、Permission Boundaries、OIDC Federation、AWS Config Rules
- **主要スタック**:
  - `IamRolesStack` - 最小権限の原則に基づくロール設計
  - `PermissionBoundaryStack` - 権限の上限を設定する境界ポリシー
  - `OidcFederationStack` - GitHub Actions等との信頼関係構築
  - `ConfigRemediationStack` - 非準拠リソースの自動修復ルール
- **対応学習ノート**: Section 02 (IAM深堀り), Section 03 (Organizations)
</details>

<details>
<summary><strong>02 - SSM Operations</strong> (Python)</summary>

- **学習内容**: SSMインベントリ管理、パッチ管理、Parameter Store階層設計
- **主要スタック**:
  - `SsmInventoryStack` - EC2インスタンスの自動インベントリ収集
  - `PatchManagementStack` - パッチベースラインとメンテナンスウィンドウ
  - `ParameterStoreStack` - 環境別パラメータの階層管理 (`/app/prod/db/host`)
- **対応学習ノート**: Section 04 (Systems Manager)
</details>

<details>
<summary><strong>03 - Monitoring & Observability</strong> (TypeScript)</summary>

- **学習内容**: CloudWatch ダッシュボード、EventBridge 自動化、X-Ray 分散トレーシング
- **主要スタック**:
  - `DashboardStack` - カスタムメトリクスダッシュボード構築
  - `AlarmStack` - 複合アラームとSNS通知
  - `EventBridgeStack` - イベントルールによる自動対応
  - `XRayTracingStack` - Lambda/API Gatewayの分散トレーシング
- **対応学習ノート**: Section 05 (監視運用), Section 08 (イベント駆動)
</details>

<details>
<summary><strong>04 - Networking & LB</strong> (TypeScript)</summary>

- **学習内容**: Multi-AZ VPC設計、ALB/NLBルーティング、Auto Scalingポリシー
- **主要スタック**:
  - `VpcStack` - パブリック/プライベート/分離サブネットの3層VPC
  - `AlbStack` - パスベース・ホストベースルーティング
  - `NlbStack` - TCP/UDPレベルのロードバランシング
  - `AutoScalingStack` - ターゲット追跡・ステップスケーリング
- **対応学習ノート**: Section 06 (ネットワーク), Section 07 (Auto Scaling), Section 10 (VPC設計)
</details>

<details>
<summary><strong>05 - Security & Edge</strong> (Python)</summary>

- **学習内容**: CloudTrail監査ログ、GuardDuty脅威検出、CloudFront + WAF + ACM
- **主要スタック**:
  - `CloudTrailStack` - 全リージョンAPI監査ログの一元管理
  - `GuardDutyStack` - 機械学習ベースの脅威検出と通知
  - `CloudFrontWafStack` - CDN配信 + WAFルール (SQLi, XSS, レート制限)
  - `AcmStack` - SSL/TLS証明書の自動管理
- **対応学習ノート**: Section 09 (セキュリティ統制), Section 11 (エッジ & CDN)
</details>

<details>
<summary><strong>06 - Storage & Backup</strong> (Python)</summary>

- **学習内容**: S3ライフサイクル管理、EBSスナップショット (DLM)、AWS Backup
- **主要スタック**:
  - `S3LifecycleStack` - ストレージクラス自動遷移 (Standard -> IA -> Glacier)
  - `IntelligentTieringStack` - アクセスパターン自動最適化
  - `EbsDlmStack` - Data Lifecycle Managerによるスナップショット自動化
  - `BackupPlanStack` - AWS Backupによる統合バックアップ管理
- **対応学習ノート**: Section 12 (ストレージ & バックアップ)
</details>

## アーキテクチャ図

`diagrams/` フォルダに Mermaid 形式のアーキテクチャ図を格納しています。

> **Note**: Mermaid `.mmd` ファイルは GitHub 上で自動レンダリングされます。ローカルで閲覧する場合は VS Code の [Mermaid Preview](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid) 拡張機能をご利用ください。

| 図 | ファイル | 説明 |
|----|---------|------|
| Well-Architected 概観 | [`well-architected-overview.mmd`](diagrams/well-architected-overview.mmd) | 6つの柱と各CDKプロジェクトのマッピング (マインドマップ) |
| VPC ネットワーク構成 | [`vpc-network-topology.mmd`](diagrams/vpc-network-topology.mmd) | Multi-AZ VPCのサブネット構成とトラフィックフロー |
| 監視データフロー | [`monitoring-flow.mmd`](diagrams/monitoring-flow.mmd) | イベントソースからモニタリング、アクションまでのデータフロー |
| セキュリティ多層防御 | [`security-layers.mmd`](diagrams/security-layers.mmd) | エッジ→ネットワーク→コンピュート→データの防御層 |

## 学習時間の目安

| カテゴリ | 所要時間 | 備考 |
|---------|---------|------|
| 学習ノート (1セクション) | 30 - 45 分 | ソクラテス式Q&A形式で理解を深める |
| CDK ハンズオン (1プロジェクト) | 1 - 2 時間 | コード理解 + デプロイ + 動作確認 |
| Day 1 全体 | 3 - 4 時間 | ノート4本 + CDK 01, 02 |
| Day 2 全体 | 3 - 4 時間 | ノート4本 + CDK 03, 04 |
| Day 3 全体 | 3 - 4 時間 | ノート4本 + CDK 05, 06 |
| **全体合計** | **約 10 - 12 時間** | 3日間の集中学習を想定 |

## キーコンセプト索引

学習ノートで登場する主要コンセプトと、理解を助ける現実比喩の一覧です。

| コンセプト | セクション | 比喩 (アナロジー) |
|-----------|-----------|------------------|
| IaC (Infrastructure as Code) | Section 01 | レシピ通りに料理を再現する |
| JWT (JSON Web Token) | Section 02 | 封印された改ざん防止封筒 |
| OIDC (OpenID Connect) | Section 02 | ホテルでの政府発行ID提示 |
| Permission Boundary | Section 02 | 部屋の鍵は渡すが建物の外には出られない |
| SCP (Service Control Policy) | Section 03 | 会社全体のルールブック |
| SSM Parameter Store | Section 04 | 金庫付きの整理棚 |
| CloudWatch メトリクス | Section 05 | 工場の計器パネル |
| OSI 7層モデル | Section 06 | 郵便システムの階層 (封筒, 住所, 配達) |
| DNS | Section 06 | 電話帳 (名前 -> 番号の変換) |
| SSL/TLS | Section 06 | 封蝋付きの手紙 (暗号化 + 認証) |
| Auto Scaling | Section 07 | 繁忙期のレジ増設 |
| EventBridge | Section 08 | 社内メールの自動振り分けルール |
| X-Ray | Section 08 | 荷物追跡番号 (分散トレーシング) |
| GuardDuty | Section 09 | AIセキュリティカメラ |
| VPC Endpoint | Section 10 | 社内メール vs 公共郵便 |
| CIDR | Section 10 | 住所のブロック割り当て |
| CloudFront | Section 11 | コンビニの地域倉庫 (エッジキャッシュ) |
| WAF | Section 11 | ビルの入口セキュリティゲート |
| S3 ライフサイクル | Section 12 | 書類の倉庫移動 (デスク -> 倉庫 -> 長期保管) |
| AWS Backup | Section 12 | 統合バックアップ金庫 |
