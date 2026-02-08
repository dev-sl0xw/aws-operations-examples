"""
EBS Snapshots Automation Stack

EBSボリュームのスナップショットを自動化するスタックです。
DLM (Data Lifecycle Manager) を使用して、定期的なバックアップと
クロスリージョンコピーを実現します。
"""

from aws_cdk import (
    Stack,
    Size,
    CfnOutput,
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

        # デモ用にgp3ボリュームを作成（実際にはEC2インスタンスにアタッチして使用）
        self.volume = ec2.Volume(
            self,
            "DemoEbsVolume",
            availability_zone=f"{Stack.of(self).region}a",
            size=Size.gibibytes(100),
            volume_type=ec2.EbsDeviceVolumeType.GP3,
            encrypted=True,
            # Backup=true タグを付与してDLMポリシーの対象にする
        )

        # DLMポリシーのターゲットとなるタグを追加
        from aws_cdk import Tags

        Tags.of(self.volume).add("Backup", "true")

        # ====================================================================
        # DLM用IAMロール
        # ====================================================================

        # DLMがスナップショットの作成・管理・クロスリージョンコピーを
        # 行うために必要なIAMロールを作成します。
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

        self.lifecycle_policy = dlm.CfnLifecyclePolicy(
            self,
            "DailySnapshotPolicy",
            description="Daily EBS snapshot policy with 7-day retention",
            state="ENABLED",
            execution_role_arn=dlm_role.role_arn,
            policy_details=dlm.CfnLifecyclePolicy.PolicyDetailsProperty(
                resource_types=["VOLUME"],
                # Backup=true タグが付いた全てのEBSボリュームが対象
                target_tags=[
                    dlm.CfnLifecyclePolicy.CfnTag(key="Backup", value="true")
                ],
                schedules=[
                    dlm.CfnLifecyclePolicy.ScheduleProperty(
                        name="DailySnapshot",
                        # 毎日 UTC 03:00 にスナップショットを取得
                        # 業務時間外（日本時間12:00）に実行することで、
                        # I/O負荷の影響を最小限に抑えます
                        create_rule=dlm.CfnLifecyclePolicy.CreateRuleProperty(
                            interval=24,
                            interval_unit="HOURS",
                            times=["03:00"],
                        ),
                        # 7世代分のスナップショットを保持
                        # 1週間分あれば、ほとんどの障害からの復旧に十分です
                        retain_rule=dlm.CfnLifecyclePolicy.RetainRuleProperty(
                            count=7,
                        ),
                        # スナップショットに自動的にタグを付与
                        tags_to_add=[
                            dlm.CfnLifecyclePolicy.CfnTag(
                                key="CreatedBy", value="DLM"
                            ),
                            dlm.CfnLifecyclePolicy.CfnTag(
                                key="Type", value="DailySnapshot"
                            ),
                        ],
                        copy_tags=True,
                        # クロスリージョンコピー: DRリージョンにスナップショットを複製
                        # リージョン全体の障害に備えて、別リージョンにもコピーを保持します。
                        # これにより、プライマリリージョンが完全に利用不可になった場合でも、
                        # DRリージョンからデータを復元できます。
                        cross_region_copy_rules=[
                            dlm.CfnLifecyclePolicy.CrossRegionCopyRuleProperty(
                                target=dr_region,
                                encrypted=True,
                                # DRリージョンでは3世代分を保持（コスト最適化）
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
