"""
SSM Inventory Stack
====================

【なぜインベントリ収集が運用管理の基盤なのか】

運用管理の第一歩は「自分たちが何を持っているかを知ること」です。
数百台のEC2インスタンスを管理する環境では、各インスタンスにどのソフトウェアが
インストールされているか、どのバージョンが動いているかを手動で把握することは
不可能です。

SSM Inventoryは、SSM Agentを通じて各インスタンスから以下の情報を自動収集します：
- インストール済みソフトウェアとバージョン
- ネットワーク設定
- Windowsの更新プログラム
- サービスの状態
- カスタムインベントリ（自社アプリの情報など）

【SSM Agentの仕組み】

SSM Agentは各EC2インスタンスにプリインストールされている（Amazon Linux 2以降）
軽量エージェントです。エージェントはSSMサービスのエンドポイントに対して
アウトバウンド接続でポーリングを行い、コマンドやドキュメントの実行指示を受け取ります。

重要：SSM AgentはSSHポートを開ける必要がありません。
インバウンド接続が不要なため、セキュリティグループを最小限に保てます。

【なぜS3にデータを集約するのか】

Resource Data Syncを使ってインベントリデータをS3に集約する理由：
1. Athenaでクロスアカウント・クロスリージョンのSQL分析が可能になる
2. QuickSightでダッシュボード化できる
3. データの長期保存とコンプライアンス監査に対応できる
4. Lambda等を使った自動アラート（未承認ソフトウェア検知など）が実装できる
"""

from constructs import Construct
import aws_cdk as cdk
from aws_cdk import (
    Stack,
    RemovalPolicy,
    CfnOutput,
    aws_ssm as ssm,
    aws_s3 as s3,
    aws_iam as iam,
)


class SsmInventoryStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ====================================================================
        # S3バケット: インベントリデータの集約先
        # ====================================================================
        # Resource Data SyncがインベントリデータをJSON形式で書き込むバケットです。
        # Athenaから直接クエリできるフォーマットで保存されるため、
        # 追加のETL処理なしで分析が可能です。
        #
        # バケットポリシー：SSMサービスからの書き込みを許可する必要があります。
        # SSMは「ssm.amazonaws.com」サービスプリンシパルとして書き込みを行います。
        inventory_bucket = s3.Bucket(
            self,
            "InventoryDataBucket",
            bucket_name=None,  # CDKが一意の名前を自動生成
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            # インベントリデータは機密情報を含む可能性があるため、暗号化を有効化
            encryption=s3.BucketEncryption.S3_MANAGED,
            # バージョニングを有効にして変更履歴を保持
            versioned=True,
            # パブリックアクセスを完全にブロック
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
        )

        # SSMサービスがバケットに書き込むためのポリシーを追加
        # Resource Data Syncを機能させるために必須の設定です。
        inventory_bucket.add_to_resource_policy(
            iam.PolicyStatement(
                sid="SSMBucketPermissionsCheck",
                effect=iam.Effect.ALLOW,
                principals=[iam.ServicePrincipal("ssm.amazonaws.com")],
                actions=["s3:GetBucketAcl"],
                resources=[inventory_bucket.bucket_arn],
            )
        )

        inventory_bucket.add_to_resource_policy(
            iam.PolicyStatement(
                sid="SSMBucketDelivery",
                effect=iam.Effect.ALLOW,
                principals=[iam.ServicePrincipal("ssm.amazonaws.com")],
                actions=["s3:PutObject"],
                resources=[f"{inventory_bucket.bucket_arn}/*"],
                conditions={
                    "StringEquals": {
                        "s3:x-amz-acl": "bucket-owner-full-control"
                    }
                },
            )
        )

        # ====================================================================
        # SSM Association: インベントリ収集の設定
        # ====================================================================
        # SSM Associationは「どのインスタンスに」「何のドキュメントを」
        # 「どのスケジュールで」実行するかを定義するリソースです。
        #
        # AWS-GatherSoftwareInventory ドキュメントは、AWSが提供する
        # マネージドドキュメントで、以下の情報を収集します：
        # - Applications（インストール済みアプリケーション）
        # - AWS Components（AWS CLI、SSM Agentなど）
        # - Network Config（ネットワークインターフェース設定）
        # - Windows Updates（Windowsのみ）
        # - Custom Inventory（カスタムスキーマ）
        #
        # InstanceIds: ["*"] を指定すると、アカウント内の全マネージドインスタンスが
        # 対象になります。本番環境では、タグベースのターゲティングを推奨します。
        # 例: Key=tag:Environment, Values=production
        inventory_association = ssm.CfnAssociation(
            self,
            "InventoryAssociation",
            name="AWS-GatherSoftwareInventory",
            # 全マネージドインスタンスを対象にする
            # 本番環境ではタグベースのフィルタリングを推奨：
            # targets=[{"key": "tag:Environment", "values": ["production"]}]
            targets=[
                ssm.CfnAssociation.TargetProperty(
                    key="InstanceIds",
                    values=["*"],
                )
            ],
            # 1日1回の収集スケジュール
            # rate式とcron式の両方がサポートされています。
            # rate(1 day) = 24時間ごとに実行
            # cron(0 0 */1 * * ? *) = 毎日0時に実行（より細かい制御が可能）
            schedule_expression="rate(1 day)",
            # Association名を明示的に設定（運用時の識別のため）
            association_name="GatherSoftwareInventory",
            # 収集するインベントリタイプのパラメータ
            # 全カテゴリを有効にすることで、包括的な可視化が可能になります
            parameters={
                "applications": ["Enabled"],
                "awsComponents": ["Enabled"],
                "networkConfig": ["Enabled"],
                "windowsUpdates": ["Enabled"],
                "customInventory": ["Enabled"],
            },
        )

        # ====================================================================
        # Resource Data Sync: インベントリデータのS3集約
        # ====================================================================
        # Resource Data Syncは、複数リージョン・複数アカウントのインベントリデータを
        # 1つのS3バケットに自動同期するメカニズムです。
        #
        # これにより以下が実現できます：
        # - Amazon Athenaでのクロスアカウントクエリ
        #   例: 「全アカウントでLog4j 2.x系がインストールされているインスタンスは？」
        # - Amazon QuickSightでの可視化ダッシュボード
        # - AWS Configとの連携によるコンプライアンスチェック
        #
        # データはJSON形式で保存され、以下のプレフィックス構造になります：
        #   s3://bucket/AWS:Application/accountid/region/resourcetype/
        resource_data_sync = ssm.CfnResourceDataSync(
            self,
            "InventoryResourceDataSync",
            sync_name="InventoryToS3Sync",
            s3_destination=ssm.CfnResourceDataSync.S3DestinationProperty(
                bucket_name=inventory_bucket.bucket_name,
                sync_format="JsonSerDe",
                region=self.region,
                # プレフィックスを設定して、他のデータと区別する
                prefix="ssm-inventory",
            ),
        )

        # Resource Data SyncはS3バケットのポリシーに依存するため、
        # 明示的に依存関係を設定
        resource_data_sync.node.add_dependency(inventory_bucket)

        # ====================================================================
        # CfnOutputs: スタック出力
        # ====================================================================
        # CloudFormationの出力として、他のスタックやツールから参照できるようにします

        CfnOutput(
            self,
            "InventoryBucketName",
            value=inventory_bucket.bucket_name,
            description="S3 bucket name for SSM Inventory data sync",
            export_name="SSMInventoryBucketName",
        )

        CfnOutput(
            self,
            "InventoryBucketArn",
            value=inventory_bucket.bucket_arn,
            description="S3 bucket ARN for SSM Inventory data sync",
            export_name="SSMInventoryBucketArn",
        )

        CfnOutput(
            self,
            "InventoryAssociationId",
            value=inventory_association.attr_association_id,
            description="SSM Association ID for inventory collection",
            export_name="SSMInventoryAssociationId",
        )

        CfnOutput(
            self,
            "ResourceDataSyncName",
            value=resource_data_sync.sync_name,
            description="Resource Data Sync name for inventory centralization",
            export_name="SSMResourceDataSyncName",
        )
