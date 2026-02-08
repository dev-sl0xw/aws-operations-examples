"""
AWS Backup Automation Stack

AWS Backupを使用した一元的なバックアップ管理を構築するスタックです。
KMS暗号化されたVault、日次・月次のバックアップルール、
クロスリージョンコピーを実装します。

AWS Backup을 사용한 중앙 집중식 백업 관리를 구축하는 스택입니다.
KMS 암호화된 Vault, 일일/월간 백업 규칙,
크로스 리전 복사를 구현합니다.
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

    AWS Backup 자동화 스택

    --- 왜 중앙 집중식 백업 관리가 중요한가 ---

    AWS에는 여러 백업 수단이 있습니다:
    - EBS 스냅샷 (EC2 볼륨용)
    - RDS 자동 백업 (데이터베이스용)
    - DynamoDB 백업 (NoSQL용)
    - EFS 백업 (파일 시스템용)

    이들을 개별적으로 관리하면 다음 문제가 발생합니다:
    1. 설정 불일치: 서비스마다 다른 백업 정책이 적용됨
    2. 관리 복잡성: 여러 콘솔/API를 사용해야 함
    3. 감사 어려움: 백업 상황의 전체 현황을 파악하기 어려움
    4. 컴플라이언스 위반: 일부 리소스의 백업 누락이 발생하기 쉬움

    AWS Backup은 이러한 문제를 해결하는 중앙 관리 서비스입니다:
    - 하나의 정책으로 여러 서비스의 백업을 관리
    - 태그 기반 자동 선택으로 백업 누락을 방지
    - 중앙 집중식 감사 대시보드
    - 크로스 리전/크로스 계정 복사의 통합 관리

    --- 핫 스토리지와 콜드 스토리지의 차이 ---

    AWS Backup에는 2종류의 스토리지 계층이 있습니다:

    핫 스토리지 (웜 스토리지):
    - 즉시 복원 가능 (수 분 이내)
    - 최근 백업에 적합
    - 비용이 높음

    콜드 스토리지:
    - 복원에 시간이 걸림 (수 시간)
    - 장기 보존 백업에 적합
    - 비용이 약 75% 저렴
    - 지원 서비스: EBS, EFS, DynamoDB 등

    일일 백업은 처음 10일간 핫 스토리지에 보관하고,
    이후 콜드 스토리지로 전환함으로써
    '즉시 복원하고 싶은 최근 데이터'와 '장기 보존이지만 저렴하게 보관하고 싶은 데이터'
    사이의 균형을 맞춥니다.

    --- Vault Lock (WORM)의 개념 ---

    Vault Lock을 활성화하면, Vault 내 백업은 지정된 보존 기간 동안
    누구도 (root 포함) 삭제할 수 없게 됩니다 (Write Once Read Many: WORM).
    이는 다음 시나리오에서 중요합니다:
    - 내부 부정에 의한 백업 삭제 방지
    - 랜섬웨어에 의한 백업 파괴 방지
    - 컴플라이언스 요건 (SEC Rule 17a-4 등) 대응
    - 감사 증거 보전

    주의: Vault Lock은 한 번 활성화하면 취소할 수 없으므로 신중하게 설정하세요.
    이 스택에서는 데모용이므로 Vault Lock을 포함하지 않았지만,
    프로덕션 환경에서는 backup.BackupVault의 lock_configuration 프로퍼티로 설정할 수 있습니다.
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
        # KMS 암호화 키 (백업 Vault용)
        # ====================================================================

        # バックアップデータを暗号化するためのカスタマーマネージドKMSキーを作成
        # デフォルトのAWSマネージドキーでも暗号化されますが、
        # カスタマーマネージドキーを使用することで:
        #   1. キーローテーションポリシーの完全制御が可能
        #   2. キーポリシーでアクセス制御を細かく設定可能
        #   3. CloudTrailでキー使用履歴を監査可能
        #   4. クロスアカウントアクセスの制御が容易
        # 백업 데이터를 암호화하기 위한 고객 관리형 KMS 키를 생성
        # 기본 AWS 관리형 키로도 암호화되지만,
        # 고객 관리형 키를 사용하면:
        #   1. 키 로테이션 정책의 완전한 제어가 가능
        #   2. 키 정책으로 액세스 제어를 세밀하게 설정 가능
        #   3. CloudTrail에서 키 사용 이력을 감사 가능
        #   4. 크로스 계정 액세스 제어가 용이
        self.backup_key = kms.Key(
            self,
            "BackupVaultKey",
            alias="alias/backup-vault-key",
            description="KMS key for AWS Backup vault encryption",
            enable_key_rotation=True,
            # WARNING: Use RemovalPolicy.RETAIN in production
            removal_policy=RemovalPolicy.DESTROY,
        )

        # ====================================================================
        # AWS Backup Vault（バックアップ保管庫）
        # AWS Backup Vault (백업 보관소)
        # ====================================================================

        # バックアップVaultは、復旧ポイント（バックアップデータ）を
        # 格納するための論理的なコンテナです。
        # Vaultごとに異なる暗号化キーやアクセスポリシーを設定できるため、
        # セキュリティ要件の異なるバックアップを分離管理できます。
        # 백업 Vault는 복구 포인트 (백업 데이터)를
        # 저장하기 위한 논리적 컨테이너입니다.
        # Vault별로 다른 암호화 키나 액세스 정책을 설정할 수 있으므로,
        # 보안 요건이 다른 백업을 분리 관리할 수 있습니다.
        self.vault = backup.BackupVault(
            self,
            "BackupVault",
            backup_vault_name="storage-backup-vault",
            encryption_key=self.backup_key,
            # WARNING: Use RemovalPolicy.RETAIN in production
            removal_policy=RemovalPolicy.DESTROY,
        )

        # --- クロスリージョンバックアップ用のDR Vault ---
        # DRリージョンにもVaultを作成し、クロスリージョンコピーの
        # 宛先として使用します。
        # 注意: 実際のデプロイではDRリージョンにも別途スタックが必要ですが、
        # ここではコピールールの設定例として同一スタックに含めています。
        # --- 크로스 리전 백업용 DR Vault ---
        # DR 리전에도 Vault를 생성하여 크로스 리전 복사의
        # 대상으로 사용합니다.
        # 주의: 실제 배포에서는 DR 리전에 별도의 스택이 필요하지만,
        # 여기서는 복사 규칙의 설정 예시로 동일 스택에 포함하고 있습니다.

        # クロスリージョンコピー先Vaultへの参照
        # 実際のデプロイでは、DRリージョンにデプロイされたVaultのARNを使用
        # 크로스 리전 복사 대상 Vault에 대한 참조
        # 실제 배포에서는 DR 리전에 배포된 Vault의 ARN을 사용
        dr_vault_arn = (
            f"arn:aws:backup:{dr_region}:{Stack.of(self).account}:backup-vault:dr-vault"
        )

        # ====================================================================
        # AWS Backup Plan（バックアップ計画）
        # AWS Backup Plan (백업 계획)
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
        # 100日間の保持期間は、月次の振り返りや監査に十分な期間であり、
        # かつコスト的にも現実的なバランスです。
        # 10日後のコールドストレージ移行により、直近のバックアップは
        # すぐにリストアでき、古いものはコスト最適化されます。
        # 注意: deleteAfterはmoveToColdStorageAfterより最低90日後でなければならない
        # --- 규칙 1: 일일 백업 ---
        # 매일 UTC 05:00 (한국 시간 14:00)에 백업을 실행
        # 보존 기간: 35일간 (5주분)
        # 콜드 스토리지 전환: 10일 후
        #
        # 100일간의 보존 기간은 월간 리뷰나 감사에 충분한 기간이며,
        # 비용적으로도 현실적인 균형입니다.
        # 10일 후 콜드 스토리지 전환으로 최근 백업은
        # 즉시 복원할 수 있고, 오래된 것은 비용이 최적화됩니다.
        # 주의: deleteAfter는 moveToColdStorageAfter보다 최소 90일 후여야 합니다
        self.plan.add_rule(
            backup.BackupPlanRule(
                rule_name="DailyBackupRule",
                schedule_expression=events.Schedule.cron(
                    hour="5",
                    minute="0",
                ),
                # バックアップの開始から完了までの最大ウィンドウ
                # 백업 시작부터 완료까지의 최대 윈도우
                start_window=Duration.hours(1),
                completion_window=Duration.hours(2),
                # 100日間保持（コールドストレージ移行後90日以上必要）
                # 100일간 보존 (콜드 스토리지 전환 후 90일 이상 필요)
                delete_after=Duration.days(100),
                # 10日後にコールドストレージへ移行（コスト最適化）
                # 10일 후 콜드 스토리지로 전환 (비용 최적화)
                move_to_cold_storage_after=Duration.days(10),
                # クロスリージョンコピー: DRリージョンへバックアップを複製
                # --- クロスリージョンバックアップによるディザスタリカバリ ---
                # リージョン全体の障害は稀ですが、発生した場合の影響は甚大です。
                # クロスリージョンコピーにより:
                #   1. プライマリリージョンが完全に利用不可でも復旧可能
                #   2. RPO (Recovery Point Objective) の保証
                #   3. 地理的に離れた場所へのデータ分散
                #   4. コンプライアンス要件（地理的冗長性）への対応
                # 크로스 리전 복사: DR 리전으로 백업을 복제
                # --- 크로스 리전 백업에 의한 재해 복구 ---
                # 리전 전체 장애는 드물지만, 발생 시 영향은 막대합니다.
                # 크로스 리전 복사를 통해:
                #   1. 프라이머리 리전이 완전히 사용 불가여도 복구 가능
                #   2. RPO (Recovery Point Objective) 보장
                #   3. 지리적으로 떨어진 장소로의 데이터 분산
                #   4. 컴플라이언스 요건 (지리적 중복성) 대응
                copy_actions=[
                    backup.BackupPlanCopyActionProps(
                        destination_backup_vault=backup.BackupVault.from_backup_vault_arn(
                            self,
                            "DRVaultRefDaily",
                            dr_vault_arn,
                        ),
                        move_to_cold_storage_after=Duration.days(10),
                        delete_after=Duration.days(100),
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
        # --- 규칙 2: 월간 백업 ---
        # 매월 1일 UTC 05:00에 백업을 실행
        # 보존 기간: 365일간 (1년분)
        #
        # 월간 백업은 장기적인 데이터 보존을 위해 중요합니다:
        #   - 연간 감사나 법적 요건 대응
        #   - 장기적인 데이터 변경 추적
        #   - 재해 복구의 최종 방어선
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
                # 365일간 보존 (1년간)
                delete_after=Duration.days(365),
            )
        )

        # ====================================================================
        # Backup Selection（バックアップ対象の選択）
        # Backup Selection (백업 대상 선택)
        # ====================================================================

        # タグベースのリソース選択:
        # BackupPlan=daily タグが付いた全てのリソースが自動的にバックアップ対象になります。
        # タグベースの選択の利点:
        #   1. 新しいリソースにタグを付けるだけで自動的にバックアップ対象に追加
        #   2. リソースの追加・削除時にバックアッププランの変更が不要
        #   3. チーム間で一貫したバックアップポリシーの適用が容易
        #   4. タグの付け忘れを検出するAWS Configルールと組み合わせ可能
        # 태그 기반 리소스 선택:
        # BackupPlan=daily 태그가 부여된 모든 리소스가 자동으로 백업 대상이 됩니다.
        # 태그 기반 선택의 장점:
        #   1. 새 리소스에 태그를 부여하는 것만으로 자동으로 백업 대상에 추가
        #   2. 리소스 추가/삭제 시 백업 플랜 변경이 불필요
        #   3. 팀 간 일관된 백업 정책 적용이 용이
        #   4. 태그 누락을 탐지하는 AWS Config 규칙과 조합 가능
        self.plan.add_selection(
            "TagBasedSelection",
            resources=[
                backup.BackupResource.from_tag("BackupPlan", "daily"),
            ],
        )

        # ====================================================================
        # 出力値
        # 출력값
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
