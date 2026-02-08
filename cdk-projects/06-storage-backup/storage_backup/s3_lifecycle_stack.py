"""
S3 Lifecycle Management Stack

S3バケットのライフサイクル管理を構築するスタックです。
データの保護、コスト最適化、セキュリティを包括的に実現します。
"""

from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    RemovalPolicy,
    aws_s3 as s3,
    aws_iam as iam,
)
from constructs import Construct


class S3LifecycleStack(Stack):
    """S3バケットのライフサイクル管理スタック

    このスタックでは、以下のベストプラクティスを実装します:
    1. バージョニング: 誤削除・誤上書きからの保護
    2. ライフサイクルルール: ストレージコストの自動最適化
    3. 暗号化の強制: データセキュリティの確保
    4. パブリックアクセスの完全ブロック
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ====================================================================
        # S3バケットの作成（バージョニング + ライフサイクル + 暗号化）
        # ====================================================================

        # --- なぜバージョニングが重要なのか ---
        # バージョニングを有効にすると、オブジェクトの全バージョンが保持されます。
        # これにより以下のシナリオから保護されます:
        #   - 誤ってファイルを削除した場合 → 削除マーカーが付くだけで、前のバージョンを復元可能
        #   - 誤ってファイルを上書きした場合 → 以前のバージョンに戻すことが可能
        #   - ランサムウェアなどによるデータ破壊 → 暗号化前のバージョンを復元可能
        # バージョニングなしでは、削除や上書きは取り消せない「一方通行」の操作になります。

        # --- なぜライフサイクルルールがコスト削減に繋がるのか ---
        # S3には複数のストレージクラスがあり、アクセス頻度に応じて料金が異なります:
        #   - S3 Standard:           最も高価だがアクセス遅延なし（頻繁にアクセスするデータ向け）
        #   - S3 Infrequent Access:  Standardの約45%の料金（月1回程度のアクセス向け）
        #   - S3 Glacier:            Standardの約15%の料金（年に数回のアクセス向け、取り出しに数分〜数時間）
        #   - S3 Glacier Deep Archive: 最安（年1回以下のアクセス向け、取り出しに12時間以上）
        # ライフサイクルルールで自動的に安いストレージクラスに移行することで、
        # 手動管理なしに大幅なコスト削減（50-80%）が可能です。

        # --- なぜ暗号化を強制すべきなのか ---
        # 暗号化は「保険」のようなものです。仮にAWSのストレージが物理的に
        # 侵害された場合でも、暗号化されたデータは読み取り不可能です。
        # また、多くのコンプライアンス基準（HIPAA、PCI-DSS、SOC2等）では
        # 保存時の暗号化（encryption at rest）が必須要件となっています。
        # SSE-S3はAWSが管理するキーで暗号化する最もシンプルな方式で、
        # 追加コストなしで利用できます。

        self.bucket = s3.Bucket(
            self,
            "LifecycleManagedBucket",
            # バージョニング有効化: 全てのオブジェクトバージョンを保持
            versioned=True,
            # SSE-S3暗号化: AWSマネージドキーによるサーバーサイド暗号化
            encryption=s3.BucketEncryption.S3_MANAGED,
            # パブリックアクセスを完全ブロック
            # 設定ミスによるデータ漏洩を防止するため、全てのパブリックアクセスをブロック
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            # スタック削除時の動作（本番環境ではRETAINを推奨）
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            # ライフサイクルルール: ストレージクラスの自動階層化
            lifecycle_rules=[
                # ルール1: 現行バージョンのオブジェクトに対するルール
                s3.LifecycleRule(
                    id="TransitionAndExpireCurrentVersions",
                    enabled=True,
                    # --- ストレージクラスと料金の関係 ---
                    # オブジェクトは作成後、時間経過とともにアクセス頻度が下がる傾向があります。
                    # このルールでは3段階の自動移行を設定:
                    #   0-29日:   S3 Standard      （最新データは素早くアクセスしたい）
                    #   30-89日:  Infrequent Access （たまにアクセスする）
                    #   90-364日: Glacier           （ほぼアクセスしないがアーカイブとして保持）
                    #   365日以降: 自動削除          （保持期間を過ぎたデータは不要）
                    transitions=[
                        s3.Transition(
                            storage_class=s3.StorageClass.INFREQUENT_ACCESS,
                            transition_after=Duration.days(30),
                        ),
                        s3.Transition(
                            storage_class=s3.StorageClass.GLACIER,
                            transition_after=Duration.days(90),
                        ),
                    ],
                    # 365日後にオブジェクトを自動削除
                    expiration=Duration.days(365),
                ),
                # ルール2: 非現行バージョン（旧バージョン）に対するルール
                s3.LifecycleRule(
                    id="ExpireNoncurrentVersions",
                    enabled=True,
                    # 非現行バージョンは30日後に削除
                    # バージョニングにより旧バージョンが蓄積するため、
                    # コスト管理のために古いバージョンは一定期間後に削除します。
                    # 30日あれば、誤操作に気づいて復旧するのに十分な期間です。
                    noncurrent_version_expiration=Duration.days(30),
                ),
            ],
        )

        # ====================================================================
        # バケットポリシー: 暗号化されていないアップロードを拒否
        # ====================================================================

        # HTTPS (TLS) を使用しないリクエストを拒否するポリシーを追加
        # aws:SecureTransport条件を使い、HTTPでのアクセスを完全にブロックします。
        # これにより、転送中のデータ（data in transit）も暗号化されることを保証します。
        self.bucket.add_to_resource_policy(
            iam.PolicyStatement(
                sid="DenyUnencryptedTransport",
                effect=iam.Effect.DENY,
                principals=[iam.AnyPrincipal()],
                actions=["s3:*"],
                resources=[
                    self.bucket.bucket_arn,
                    f"{self.bucket.bucket_arn}/*",
                ],
                conditions={
                    "Bool": {
                        "aws:SecureTransport": "false",
                    }
                },
            )
        )

        # ====================================================================
        # 出力値（CloudFormation Outputs）
        # ====================================================================

        CfnOutput(
            self,
            "BucketName",
            value=self.bucket.bucket_name,
            description="ライフサイクル管理が設定されたS3バケット名",
        )

        CfnOutput(
            self,
            "BucketArn",
            value=self.bucket.bucket_arn,
            description="S3バケットのARN",
        )
