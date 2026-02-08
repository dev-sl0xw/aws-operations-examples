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

【왜 인벤토리 수집이 운영 관리의 기반인가】

운영 관리의 첫 번째 단계는 "자신들이 무엇을 보유하고 있는지를 아는 것"입니다.
수백 대의 EC2 인스턴스를 관리하는 환경에서, 각 인스턴스에 어떤 소프트웨어가
설치되어 있는지, 어떤 버전이 실행되고 있는지를 수동으로 파악하는 것은 불가능합니다.

SSM Inventory는 SSM Agent를 통해 각 인스턴스에서 다음 정보를 자동 수집합니다:
- 설치된 소프트웨어와 버전
- 네트워크 설정
- Windows 업데이트 프로그램
- 서비스 상태
- 커스텀 인벤토리 (자사 앱 정보 등)

【SSM Agent의 구조】

SSM Agent는 각 EC2 인스턴스에 사전 설치되어 있는(Amazon Linux 2 이후) 경량
에이전트입니다. 에이전트는 SSM 서비스의 엔드포인트에 대해 아웃바운드 접속으로
폴링을 수행하여 명령이나 문서의 실행 지시를 수신합니다.

중요: SSM Agent는 SSH 포트를 개방할 필요가 없습니다.
인바운드 접속이 불필요하므로 보안 그룹을 최소한으로 유지할 수 있습니다.

【왜 S3에 데이터를 집약하는가】

Resource Data Sync를 사용하여 인벤토리 데이터를 S3에 집약하는 이유:
1. Athena로 크로스 어카운트·크로스 리전의 SQL 분석이 가능해진다
2. QuickSight로 대시보드화할 수 있다
3. 데이터의 장기 보존과 컴플라이언스 감사에 대응할 수 있다
4. Lambda 등을 사용한 자동 알림(미승인 소프트웨어 감지 등)을 구현할 수 있다
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
        # ====================================================================
        # S3 버킷: 인벤토리 데이터의 집약처
        # ====================================================================
        # Resource Data Sync가 인벤토리 데이터를 JSON 형식으로 기록하는 버킷입니다.
        # Athena에서 직접 쿼리할 수 있는 포맷으로 저장되므로,
        # 추가 ETL 처리 없이 분석이 가능합니다.
        #
        # 버킷 정책: SSM 서비스로부터의 쓰기를 허가해야 합니다.
        # SSM은 "ssm.amazonaws.com" 서비스 프린시펄로서 쓰기를 수행합니다.
        inventory_bucket = s3.Bucket(
            self,
            "InventoryDataBucket",
            bucket_name=None,  # CDKが一意の名前を自動生成 / CDK가 고유 이름을 자동 생성
            # WARNING: Use RemovalPolicy.RETAIN in production
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            # インベントリデータは機密情報を含む可能性があるため、暗号化を有効化
            # 인벤토리 데이터는 기밀 정보를 포함할 가능성이 있으므로 암호화를 활성화
            encryption=s3.BucketEncryption.KMS_MANAGED,
            # バージョニングを有効にして変更履歴を保持
            # 버전 관리를 활성화하여 변경 이력을 유지
            versioned=True,
            # パブリックアクセスを完全にブロック
            # 퍼블릭 액세스를 완전히 차단
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
        )

        # SSMサービスがバケットに書き込むためのポリシーを追加
        # Resource Data Syncを機能させるために必須の設定です。
        # SSM 서비스가 버킷에 쓰기를 수행하기 위한 정책을 추가
        # Resource Data Sync를 동작시키기 위해 필수인 설정입니다.
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
        # ====================================================================
        # SSM Association: 인벤토리 수집 설정
        # ====================================================================
        # SSM Association은 "어떤 인스턴스에" "어떤 문서를"
        # "어떤 스케줄로" 실행할지를 정의하는 리소스입니다.
        #
        # AWS-GatherSoftwareInventory 문서는 AWS가 제공하는
        # 매니지드 문서로, 다음 정보를 수집합니다:
        # - Applications (설치된 애플리케이션)
        # - AWS Components (AWS CLI, SSM Agent 등)
        # - Network Config (네트워크 인터페이스 설정)
        # - Windows Updates (Windows만)
        # - Custom Inventory (커스텀 스키마)
        #
        # InstanceIds: ["*"]를 지정하면, 어카운트 내의 전 매니지드 인스턴스가
        # 대상이 됩니다. 운영 환경에서는 태그 기반의 타겟팅을 권장합니다.
        # 예: Key=tag:Environment, Values=production
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
        # ====================================================================
        # Resource Data Sync: 인벤토리 데이터의 S3 집약
        # ====================================================================
        # Resource Data Sync는 복수 리전·복수 어카운트의 인벤토리 데이터를
        # 하나의 S3 버킷에 자동 동기하는 메커니즘입니다.
        #
        # 이에 의해 다음이 실현됩니다:
        # - Amazon Athena에서의 크로스 어카운트 쿼리
        #   예: "전 어카운트에서 Log4j 2.x가 설치된 인스턴스는?"
        # - Amazon QuickSight에서의 가시화 대시보드
        # - AWS Config와의 연동에 의한 컴플라이언스 체크
        #
        # 데이터는 JSON 형식으로 저장되며, 다음의 접두사 구조가 됩니다:
        #   s3://bucket/AWS:Application/accountid/region/resourcetype/
        resource_data_sync = ssm.CfnResourceDataSync(
            self,
            "InventoryResourceDataSync",
            sync_name="InventoryToS3Sync",
            s3_destination=ssm.CfnResourceDataSync.S3DestinationProperty(
                bucket_name=inventory_bucket.bucket_name,
                sync_format="JsonSerDe",
                bucket_region=self.region,
                # プレフィックスを設定して、他のデータと区別する
                bucket_prefix="ssm-inventory",
            ),
        )

        # Resource Data SyncはS3バケットのポリシーに依存するため、
        # 明示的に依存関係を設定
        resource_data_sync.node.add_dependency(inventory_bucket)

        # ====================================================================
        # CfnOutputs: スタック出力
        # ====================================================================
        # CloudFormationの出力として、他のスタックやツールから参照できるようにします
        # ====================================================================
        # CfnOutputs: Stack 출력
        # ====================================================================
        # CloudFormation의 출력으로서, 다른 Stack이나 도구에서 참조할 수 있도록 합니다

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
