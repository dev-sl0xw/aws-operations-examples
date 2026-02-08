"""
AWS Backup Automation Stack

AWS Backupを使用した一元的なバックアップ管理を構築するスタックです。
KMS暗号化されたVault、日次・月次のバックアップルール、
クロスリージョンコピーを実装します。
"""

from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    RemovalPolicy,
    aws_backup as backup,
    aws_kms as kms,
    aws_events as events,
    aws_iam as iam,
)
from constructs import Construct


class BackupAutomationStack(Stack):
    """AWS Backup自動化スタック

    --- なぜ一元的なバックアップ管理が重要なのか ---

    AWSには複数のバックアップ手段があります:
    - EBSスナップショット（EC2ボリューム用）
    - RDS自動バックアップ（データベース用）
    - DynamoDBバックアップ（NoSQL用）
    - EFSバックアップ（ファイルシステム用）

    これらを個別に管理すると以下の問題が発生します:
    1. 設定の不一致: サービスごとに異なるバックアップポリシーが適用される
    2. 管理の複雑さ: 複数のコンソール/APIを使い分ける必要がある
    3. 監査の困難さ: バックアップ状況の全体像を把握しにくい
    4. コンプライアンス違反: 一部リソースのバックアップ漏れが発生しやすい

    AWS Backupはこれらの問題を解決する一元管理サービスです:
    - 1つのポリシーで複数サービスのバックアップを管理
    - タグベースの自動選択でバックアップ漏れを防止
    - 一元的な監査ダッシュボード
    - クロスリージョン・クロスアカウントコピーの統一管理

    --- ホットストレージとコールドストレージの違い ---

    AWS Backupには2種類のストレージ階層があります:

    ホットストレージ（ウォームストレージ）:
    - すぐにリストア可能（数分以内）
    - 直近のバックアップに適している
    - コストは高め

    コールドストレージ:
    - リストアに時間がかかる（数時間）
    - 長期保持のバックアップに適している
    - コストは約75%安い
    - 対応サービス: EBS、EFS、DynamoDB等

    日次バックアップは最初の10日間はホットストレージに保持し、
    その後コールドストレージに移行することで、
    「すぐ復元したい直近のデータ」と「長期保持だが安価に保管したいデータ」
    のバランスを取ります。

    --- Vault Lock（WORM）の概念 ---

    Vault Lockを有効にすると、Vault内のバックアップは指定された保持期間中
    誰も（root含む）削除できなくなります（Write Once Read Many: WORM）。
    これは以下のシナリオで重要です:
    - 内部不正によるバックアップ削除の防止
    - ランサムウェアによるバックアップ破壊の防止
    - コンプライアンス要件（SEC Rule 17a-4等）への対応
    - 監査証拠の保全

    注意: Vault Lockは一度有効にすると取り消せないため、慎重に設定してください。
    このスタックではデモのためVault Lockは含めていませんが、
    本番環境では backup.BackupVault の lock_configuration プロパティで設定できます。
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        dr_region: str = "us-west-2",
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ====================================================================
        # KMS暗号化キー（バックアップVault用）
        # ====================================================================

        # バックアップデータを暗号化するためのカスタマーマネージドKMSキーを作成
        # デフォルトのAWSマネージドキーでも暗号化されますが、
        # カスタマーマネージドキーを使用することで:
        #   1. キーローテーションポリシーの完全制御が可能
        #   2. キーポリシーでアクセス制御を細かく設定可能
        #   3. CloudTrailでキー使用履歴を監査可能
        #   4. クロスアカウントアクセスの制御が容易
        self.backup_key = kms.Key(
            self,
            "BackupVaultKey",
            alias="alias/backup-vault-key",
            description="KMS key for AWS Backup vault encryption",
            enable_key_rotation=True,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # ====================================================================
        # AWS Backup Vault（バックアップ保管庫）
        # ====================================================================

        # バックアップVaultは、復旧ポイント（バックアップデータ）を
        # 格納するための論理的なコンテナです。
        # Vaultごとに異なる暗号化キーやアクセスポリシーを設定できるため、
        # セキュリティ要件の異なるバックアップを分離管理できます。
        self.vault = backup.BackupVault(
            self,
            "BackupVault",
            backup_vault_name="storage-backup-vault",
            encryption_key=self.backup_key,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # --- クロスリージョンバックアップ用のDR Vault ---
        # DRリージョンにもVaultを作成し、クロスリージョンコピーの
        # 宛先として使用します。
        # 注意: 実際のデプロイではDRリージョンにも別途スタックが必要ですが、
        # ここではコピールールの設定例として同一スタックに含めています。

        # クロスリージョンコピー先Vaultへの参照
        # 実際のデプロイでは、DRリージョンにデプロイされたVaultのARNを使用
        dr_vault_arn = (
            f"arn:aws:backup:{dr_region}:{Stack.of(self).account}:backup-vault:dr-vault"
        )

        # ====================================================================
        # AWS Backup Plan（バックアップ計画）
        # ====================================================================

        self.plan = backup.BackupPlan(
            self,
            "BackupPlan",
            backup_plan_name="storage-backup-plan",
        )

        # --- ルール1: 日次バックアップ ---
        # 毎日 UTC 05:00（日本時間 14:00）にバックアップを実行
        # 保持期間: 35日間（5週間分）
        # コールドストレージ移行: 10日後
        #
        # 35日間の保持期間は、月次の振り返りや監査に十分な期間であり、
        # かつコスト的にも現実的なバランスです。
        # 10日後のコールドストレージ移行により、直近のバックアップは
        # すぐにリストアでき、古いものはコスト最適化されます。
        self.plan.add_rule(
            backup.BackupPlanRule(
                rule_name="DailyBackupRule",
                schedule_expression=events.Schedule.cron(
                    hour="5",
                    minute="0",
                ),
                # バックアップの開始から完了までの最大ウィンドウ
                start_window=Duration.hours(1),
                completion_window=Duration.hours(2),
                # 35日間保持
                delete_after=Duration.days(35),
                # 10日後にコールドストレージへ移行（コスト最適化）
                move_to_cold_storage_after=Duration.days(10),
                # クロスリージョンコピー: DRリージョンへバックアップを複製
                # --- クロスリージョンバックアップによるディザスタリカバリ ---
                # リージョン全体の障害は稀ですが、発生した場合の影響は甚大です。
                # クロスリージョンコピーにより:
                #   1. プライマリリージョンが完全に利用不可でも復旧可能
                #   2. RPO (Recovery Point Objective) の保証
                #   3. 地理的に離れた場所へのデータ分散
                #   4. コンプライアンス要件（地理的冗長性）への対応
                copy_actions=[
                    backup.BackupPlanCopyActionProps(
                        destination_backup_vault=backup.BackupVault.from_backup_vault_arn(
                            self,
                            "DRVaultRefDaily",
                            dr_vault_arn,
                        ),
                        move_to_cold_storage_after=Duration.days(10),
                        delete_after=Duration.days(35),
                    )
                ],
            )
        )

        # --- ルール2: 月次バックアップ ---
        # 毎月1日 UTC 05:00 にバックアップを実行
        # 保持期間: 365日間（1年分）
        #
        # 月次バックアップは長期的なデータ保持のために重要です:
        #   - 年次監査や法的要件への対応
        #   - 長期的なデータ変更の追跡
        #   - 災害復旧の最終防衛線
        self.plan.add_rule(
            backup.BackupPlanRule(
                rule_name="MonthlyBackupRule",
                schedule_expression=events.Schedule.cron(
                    day="1",
                    hour="5",
                    minute="0",
                ),
                start_window=Duration.hours(1),
                completion_window=Duration.hours(3),
                # 365日間保持（1年間）
                delete_after=Duration.days(365),
            )
        )

        # ====================================================================
        # Backup Selection（バックアップ対象の選択）
        # ====================================================================

        # タグベースのリソース選択:
        # BackupPlan=daily タグが付いた全てのリソースが自動的にバックアップ対象になります。
        # タグベースの選択の利点:
        #   1. 新しいリソースにタグを付けるだけで自動的にバックアップ対象に追加
        #   2. リソースの追加・削除時にバックアッププランの変更が不要
        #   3. チーム間で一貫したバックアップポリシーの適用が容易
        #   4. タグの付け忘れを検出するAWS Configルールと組み合わせ可能
        self.plan.add_selection(
            "TagBasedSelection",
            resources=[
                backup.BackupResource.from_tag("BackupPlan", "daily"),
            ],
        )

        # ====================================================================
        # 出力値
        # ====================================================================

        CfnOutput(
            self,
            "VaultName",
            value=self.vault.backup_vault_name,
            description="AWS Backup Vault名",
        )

        CfnOutput(
            self,
            "VaultArn",
            value=self.vault.backup_vault_arn,
            description="AWS Backup VaultのARN",
        )

        CfnOutput(
            self,
            "BackupPlanId",
            value=self.plan.backup_plan_id,
            description="AWS Backup Plan ID",
        )
