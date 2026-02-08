"""
EBS Snapshots Automation Stack

EBSボリュームのスナップショットを自動化するスタックです。
DLM (Data Lifecycle Manager) を使用して、定期的なバックアップと
クロスリージョンコピーを実現します。

EBS 볼륨의 스냅샷을 자동화하는 스택입니다.
DLM (Data Lifecycle Manager)을 사용하여 정기적인 백업과
크로스 리전 복사를 구현합니다.
"""

from aws_cdk import (
    Stack,
    Size,
    CfnOutput,
    CfnTag,
    aws_ec2 as ec2,
    aws_dlm as dlm,
    aws_iam as iam,
)
from constructs import Construct


class EbsSnapshotsStack(Stack):
    """EBSスナップショット自動化スタック

    --- なぜ自動スナップショットが不可欠なのか ---

    EBSボリュームはEC2インスタンスのブロックストレージですが、
    以下のリスクが常に存在します:

    1. 人的ミス（Human Error）:
       誤ってボリュームを削除したり、重要なデータを上書きしたりする事故は
       最も一般的なデータ損失原因です。自動スナップショットがあれば、
       直近の状態にすぐ復元できます。

    2. データ破損（Data Corruption）:
       アプリケーションのバグやOSの障害により、ディスク上のデータが
       破損する可能性があります。スナップショットは特定時点のデータを
       完全に保持するため、破損前の状態に戻せます。

    3. セキュリティインシデント:
       ランサムウェアやマルウェアによるデータ暗号化・破壊に対しても、
       スナップショットから復元できるため、身代金を支払う必要がありません。

    4. コンプライアンス要件:
       多くの規制（SOC2、HIPAA等）では、定期的なバックアップと
       その保持ポリシーの文書化が求められます。

    手動でのスナップショット取得は忘れがちで一貫性がないため、
    DLM (Data Lifecycle Manager) による完全自動化が推奨されます。

    --- EBSの単一AZ制約について ---

    EBSボリュームは特定のアベイラビリティゾーン (AZ) に紐づきます。
    つまり、ap-northeast-1a に存在するEBSボリュームは、ap-northeast-1c の
    EC2インスタンスにはアタッチできません。
    AZ全体の障害（稀だが発生する）に備えるには、スナップショットを取得し、
    別のAZでボリュームを再作成する必要があります。
    スナップショットはリージョン内のS3に保存されるため、AZ障害の影響を受けません。
    さらにクロスリージョンコピーを行うことで、リージョン全体の障害にも対応できます。

    EBS 스냅샷 자동화 스택

    --- 왜 자동 스냅샷이 필수적인가 ---

    EBS 볼륨은 EC2 인스턴스의 블록 스토리지이지만,
    다음과 같은 리스크가 항상 존재합니다:

    1. 인적 실수 (Human Error):
       실수로 볼륨을 삭제하거나 중요한 데이터를 덮어쓰는 사고는
       가장 일반적인 데이터 손실 원인입니다. 자동 스냅샷이 있으면
       최근 상태로 즉시 복원할 수 있습니다.

    2. 데이터 손상 (Data Corruption):
       애플리케이션 버그나 OS 장애로 인해 디스크의 데이터가
       손상될 수 있습니다. 스냅샷은 특정 시점의 데이터를
       완전히 보존하므로, 손상 전 상태로 되돌릴 수 있습니다.

    3. 보안 인시던트:
       랜섬웨어나 멀웨어에 의한 데이터 암호화/파괴에 대해서도
       스냅샷에서 복원할 수 있어 몸값을 지불할 필요가 없습니다.

    4. 컴플라이언스 요건:
       많은 규제 (SOC2, HIPAA 등)에서는 정기적인 백업과
       그 보존 정책의 문서화가 요구됩니다.

    수동 스냅샷 생성은 잊어버리기 쉽고 일관성이 없기 때문에,
    DLM (Data Lifecycle Manager)에 의한 완전 자동화가 권장됩니다.

    --- EBS의 단일 AZ 제약에 대해 ---

    EBS 볼륨은 특정 가용 영역 (AZ)에 종속됩니다.
    즉, ap-northeast-1a에 존재하는 EBS 볼륨은 ap-northeast-1c의
    EC2 인스턴스에 연결할 수 없습니다.
    AZ 전체 장애 (드물지만 발생함)에 대비하려면 스냅샷을 생성하고
    다른 AZ에서 볼륨을 재생성해야 합니다.
    스냅샷은 리전 내 S3에 저장되므로 AZ 장애의 영향을 받지 않습니다.
    나아가 크로스 리전 복사를 수행하면 리전 전체 장애에도 대응할 수 있습니다.
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
        # デモ用EBSボリューム
        # 데모용 EBS 볼륨
        # ====================================================================

        # --- gp3 と io2 の使い分け ---
        # gp3 (General Purpose SSD):
        #   - 汎用的なワークロードに最適（Webサーバー、開発環境、小〜中規模DB）
        #   - ベースライン: 3,000 IOPS / 125 MB/s（追加料金で最大16,000 IOPS）
        #   - コストパフォーマンスに優れる（gp2より最大20%安い）
        #
        # io2 (Provisioned IOPS SSD):
        #   - 高IOPSが必要なワークロードに最適（大規模DB、OLTP）
        #   - 最大64,000 IOPS / 1,000 MB/sをプロビジョニング可能
        #   - 99.999%の耐久性（gp3は99.8-99.9%）
        #   - io2 Block Expressでは最大256,000 IOPS
        #   - コストは高いが、ミッションクリティカルなDBでは必須
        # --- gp3와 io2의 용도 구분 ---
        # gp3 (General Purpose SSD):
        #   - 범용 워크로드에 최적 (웹 서버, 개발 환경, 소~중규모 DB)
        #   - 베이스라인: 3,000 IOPS / 125 MB/s (추가 요금으로 최대 16,000 IOPS)
        #   - 비용 대비 성능이 우수 (gp2보다 최대 20% 저렴)
        #
        # io2 (Provisioned IOPS SSD):
        #   - 높은 IOPS가 필요한 워크로드에 최적 (대규모 DB, OLTP)
        #   - 최대 64,000 IOPS / 1,000 MB/s 프로비저닝 가능
        #   - 99.999% 내구성 (gp3는 99.8-99.9%)
        #   - io2 Block Express에서는 최대 256,000 IOPS
        #   - 비용은 높지만 미션 크리티컬 DB에서는 필수

        # デモ用にgp3ボリュームを作成（実際にはEC2インスタンスにアタッチして使用）
        # 데모용으로 gp3 볼륨을 생성 (실제로는 EC2 인스턴스에 연결하여 사용)
        self.volume = ec2.Volume(
            self,
            "DemoEbsVolume",
            availability_zone=f"{Stack.of(self).region}a",
            size=Size.gibibytes(100),
            volume_type=ec2.EbsDeviceVolumeType.GP3,
            encrypted=True,
            # Backup=true タグを付与してDLMポリシーの対象にする
            # Backup=true 태그를 부여하여 DLM 정책의 대상으로 지정
        )

        # DLMポリシーのターゲットとなるタグを追加
        # DLM 정책의 대상이 되는 태그를 추가
        from aws_cdk import Tags

        Tags.of(self.volume).add("Backup", "true")

        # ====================================================================
        # DLM用IAMロール
        # DLM용 IAM 역할
        # ====================================================================

        # DLMがスナップショットの作成・管理・クロスリージョンコピーを
        # 行うために必要なIAMロールを作成します。
        # DLM이 스냅샷 생성/관리/크로스 리전 복사를
        # 수행하기 위해 필요한 IAM 역할을 생성합니다.
        dlm_role = iam.Role(
            self,
            "DlmLifecycleRole",
            assumed_by=iam.ServicePrincipal("dlm.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSDataLifecycleManagerServiceRole"
                ),
            ],
        )

        # ====================================================================
        # DLMライフサイクルポリシー
        # DLM 라이프사이클 정책
        # ====================================================================

        # --- インクリメンタルスナップショットの仕組み ---
        # EBSスナップショットはインクリメンタル（増分）方式で動作します:
        #   - 初回スナップショット: ボリュームの全データをコピー（フルバックアップ）
        #   - 2回目以降: 前回のスナップショット以降に変更されたブロックのみをコピー
        #
        # このインクリメンタル方式の利点:
        #   1. ストレージコスト削減: 変更分のみ保存するため、容量が節約される
        #   2. スナップショット作成時間の短縮: 変更ブロックのみコピーするため高速
        #   3. 独立した復元: 各スナップショットは独立して完全復元可能
        #      （途中のスナップショットを削除しても、他のスナップショットに影響しない）
        #
        # 重要: 見た目は「差分」だが、復元時は「完全な」ボリュームが再作成される。
        # AWS内部でブロック間の参照関係を管理しているため、ユーザーが
        # スナップショットチェーンを意識する必要はありません。
        # --- 증분 스냅샷의 구조 ---
        # EBS 스냅샷은 증분 (incremental) 방식으로 동작합니다:
        #   - 첫 번째 스냅샷: 볼륨의 전체 데이터를 복사 (풀 백업)
        #   - 2회차 이후: 이전 스냅샷 이후 변경된 블록만 복사
        #
        # 이 증분 방식의 장점:
        #   1. 스토리지 비용 절감: 변경분만 저장하므로 용량이 절약됨
        #   2. 스냅샷 생성 시간 단축: 변경 블록만 복사하므로 고속
        #   3. 독립적 복원: 각 스냅샷은 독립적으로 완전 복원 가능
        #      (중간 스냅샷을 삭제해도 다른 스냅샷에 영향 없음)
        #
        # 중요: 겉보기에는 '차분'이지만, 복원 시에는 '완전한' 볼륨이 재생성됩니다.
        # AWS 내부에서 블록 간 참조 관계를 관리하므로, 사용자가
        # 스냅샷 체인을 의식할 필요는 없습니다.

        self.lifecycle_policy = dlm.CfnLifecyclePolicy(
            self,
            "DailySnapshotPolicy",
            description="Daily EBS snapshot policy with 7-day retention",
            state="ENABLED",
            execution_role_arn=dlm_role.role_arn,
            policy_details=dlm.CfnLifecyclePolicy.PolicyDetailsProperty(
                resource_types=["VOLUME"],
                # Backup=true タグが付いた全てのEBSボリュームが対象
                # Backup=true 태그가 부여된 모든 EBS 볼륨이 대상
                target_tags=[
                    CfnTag(key="Backup", value="true")
                ],
                schedules=[
                    dlm.CfnLifecyclePolicy.ScheduleProperty(
                        name="DailySnapshot",
                        # 毎日 UTC 03:00 にスナップショットを取得
                        # 業務時間外（日本時間12:00）に実行することで、
                        # I/O負荷の影響を最小限に抑えます
                        # 매일 UTC 03:00에 스냅샷을 생성
                        # 업무 시간 외 (한국 시간 12:00)에 실행하여
                        # I/O 부하의 영향을 최소화합니다
                        create_rule=dlm.CfnLifecyclePolicy.CreateRuleProperty(
                            interval=24,
                            interval_unit="HOURS",
                            times=["03:00"],
                        ),
                        # 7世代分のスナップショットを保持
                        # 1週間分あれば、ほとんどの障害からの復旧に十分です
                        # 7세대분의 스냅샷을 유지
                        # 1주일분이면 대부분의 장애 복구에 충분합니다
                        retain_rule=dlm.CfnLifecyclePolicy.RetainRuleProperty(
                            count=7,
                        ),
                        # スナップショットに自動的にタグを付与
                        # 스냅샷에 자동으로 태그를 부여
                        tags_to_add=[
                            CfnTag(
                                key="CreatedBy", value="DLM"
                            ),
                            CfnTag(
                                key="Type", value="DailySnapshot"
                            ),
                        ],
                        copy_tags=True,
                        # クロスリージョンコピー: DRリージョンにスナップショットを複製
                        # リージョン全体の障害に備えて、別リージョンにもコピーを保持します。
                        # これにより、プライマリリージョンが完全に利用不可になった場合でも、
                        # DRリージョンからデータを復元できます。
                        # 크로스 리전 복사: DR 리전에 스냅샷을 복제
                        # 리전 전체 장애에 대비하여 다른 리전에도 복사본을 유지합니다.
                        # 이를 통해 프라이머리 리전이 완전히 사용 불가가 되더라도
                        # DR 리전에서 데이터를 복원할 수 있습니다.
                        cross_region_copy_rules=[
                            dlm.CfnLifecyclePolicy.CrossRegionCopyRuleProperty(
                                target=dr_region,
                                encrypted=True,
                                # DRリージョンでは3世代分を保持（コスト最適化）
                                # DR 리전에서는 3세대분을 유지 (비용 최적화)
                                retain_rule=dlm.CfnLifecyclePolicy.CrossRegionCopyRetainRuleProperty(
                                    interval=3,
                                    interval_unit="DAYS",
                                ),
                            )
                        ],
                    )
                ],
            ),
        )

        # ====================================================================
        # 出力値
        # 출력값
        # ====================================================================

        CfnOutput(
            self,
            "LifecyclePolicyId",
            value=self.lifecycle_policy.ref,
            description="DLMライフサイクルポリシーID",
        )

        CfnOutput(
            self,
            "DemoVolumeId",
            value=self.volume.volume_id,
            description="デモ用EBSボリュームID",
        )
