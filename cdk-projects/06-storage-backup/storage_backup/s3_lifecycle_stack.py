"""
S3 Lifecycle Management Stack

S3バケットのライフサイクル管理を構築するスタックです。
データの保護、コスト最適化、セキュリティを包括的に実現します。

S3 버킷의 라이프사이클 관리를 구축하는 스택입니다.
데이터 보호, 비용 최적화, 보안을 포괄적으로 구현합니다.
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

    S3 버킷의 라이프사이클 관리 스택

    이 스택에서는 다음의 모범 사례를 구현합니다:
    1. 버전 관리: 실수로 인한 삭제/덮어쓰기로부터 보호
    2. 라이프사이클 규칙: 스토리지 비용 자동 최적화
    3. 암호화 강제: 데이터 보안 확보
    4. 퍼블릭 액세스 완전 차단
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ====================================================================
        # S3バケットの作成（バージョニング + ライフサイクル + 暗号化）
        # S3 버킷 생성 (버전 관리 + 라이프사이클 + 암호화)
        # ====================================================================

        # --- なぜバージョニングが重要なのか ---
        # バージョニングを有効にすると、オブジェクトの全バージョンが保持されます。
        # これにより以下のシナリオから保護されます:
        #   - 誤ってファイルを削除した場合 → 削除マーカーが付くだけで、前のバージョンを復元可能
        #   - 誤ってファイルを上書きした場合 → 以前のバージョンに戻すことが可能
        #   - ランサムウェアなどによるデータ破壊 → 暗号化前のバージョンを復元可能
        # バージョニングなしでは、削除や上書きは取り消せない「一方通行」の操作になります。
        # --- 왜 버전 관리가 중요한가 ---
        # 버전 관리를 활성화하면 오브젝트의 모든 버전이 유지됩니다.
        # 이를 통해 다음 시나리오에서 보호됩니다:
        #   - 실수로 파일을 삭제한 경우 → 삭제 마커만 추가되며, 이전 버전을 복원 가능
        #   - 실수로 파일을 덮어쓴 경우 → 이전 버전으로 되돌리기 가능
        #   - 랜섬웨어 등에 의한 데이터 파괴 → 암호화 전 버전을 복원 가능
        # 버전 관리 없이는 삭제나 덮어쓰기는 되돌릴 수 없는 '일방통행' 작업이 됩니다.

        # --- なぜライフサイクルルールがコスト削減に繋がるのか ---
        # S3には複数のストレージクラスがあり、アクセス頻度に応じて料金が異なります:
        #   - S3 Standard:           最も高価だがアクセス遅延なし（頻繁にアクセスするデータ向け）
        #   - S3 Infrequent Access:  Standardの約45%の料金（月1回程度のアクセス向け）
        #   - S3 Glacier:            Standardの約15%の料金（年に数回のアクセス向け、取り出しに数分〜数時間）
        #   - S3 Glacier Deep Archive: 最安（年1回以下のアクセス向け、取り出しに12時間以上）
        # ライフサイクルルールで自動的に安いストレージクラスに移行することで、
        # 手動管理なしに大幅なコスト削減（50-80%）が可能です。
        # --- 왜 라이프사이클 규칙이 비용 절감으로 이어지는가 ---
        # S3에는 여러 스토리지 클래스가 있으며, 액세스 빈도에 따라 요금이 다릅니다:
        #   - S3 Standard:           가장 비싸지만 액세스 지연 없음 (자주 액세스하는 데이터용)
        #   - S3 Infrequent Access:  Standard의 약 45% 요금 (월 1회 정도 액세스용)
        #   - S3 Glacier:            Standard의 약 15% 요금 (연 수회 액세스용, 검색에 수분~수시간)
        #   - S3 Glacier Deep Archive: 최저가 (연 1회 이하 액세스용, 검색에 12시간 이상)
        # 라이프사이클 규칙으로 자동으로 저렴한 스토리지 클래스로 전환함으로써,
        # 수동 관리 없이 대폭적인 비용 절감 (50-80%)이 가능합니다.

        # --- なぜ暗号化を強制すべきなのか ---
        # 暗号化は「保険」のようなものです。仮にAWSのストレージが物理的に
        # 侵害された場合でも、暗号化されたデータは読み取り不可能です。
        # また、多くのコンプライアンス基準（HIPAA、PCI-DSS、SOC2等）では
        # 保存時の暗号化（encryption at rest）が必須要件となっています。
        # SSE-S3はAWSが管理するキーで暗号化する最もシンプルな方式で、
        # 追加コストなしで利用できます。
        # --- 왜 암호화를 강제해야 하는가 ---
        # 암호화는 '보험'과 같은 것입니다. 만약 AWS의 스토리지가 물리적으로
        # 침해되었더라도 암호화된 데이터는 읽을 수 없습니다.
        # 또한, 많은 컴플라이언스 기준 (HIPAA, PCI-DSS, SOC2 등)에서는
        # 저장 시 암호화 (encryption at rest)가 필수 요건입니다.
        # SSE-S3는 AWS가 관리하는 키로 암호화하는 가장 간단한 방식으로,
        # 추가 비용 없이 이용할 수 있습니다.

        self.bucket = s3.Bucket(
            self,
            "LifecycleManagedBucket",
            # バージョニング有効化: 全てのオブジェクトバージョンを保持
            # 버전 관리 활성화: 모든 오브젝트 버전을 유지
            versioned=True,
            # SSE-S3暗号化: AWSマネージドキーによるサーバーサイド暗号化
            # SSE-S3 암호화: AWS 관리형 키에 의한 서버사이드 암호화
            encryption=s3.BucketEncryption.S3_MANAGED,
            # パブリックアクセスを完全ブロック
            # 設定ミスによるデータ漏洩を防止するため、全てのパブリックアクセスをブロック
            # 퍼블릭 액세스 완전 차단
            # 설정 실수로 인한 데이터 유출을 방지하기 위해 모든 퍼블릭 액세스를 차단
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            # スタック削除時の動作（本番環境ではRETAINを推奨）
            # 스택 삭제 시 동작 (프로덕션 환경에서는 RETAIN을 권장)
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            # ライフサイクルルール: ストレージクラスの自動階層化
            # 라이프사이클 규칙: 스토리지 클래스 자동 계층화
            lifecycle_rules=[
                # ルール1: 現行バージョンのオブジェクトに対するルール
                # 규칙 1: 현재 버전의 오브젝트에 대한 규칙
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
                    # --- 스토리지 클래스와 요금의 관계 ---
                    # 오브젝트는 생성 후 시간이 지남에 따라 액세스 빈도가 줄어드는 경향이 있습니다.
                    # 이 규칙에서는 3단계 자동 전환을 설정:
                    #   0-29일:   S3 Standard      (최신 데이터는 빠르게 액세스하고 싶음)
                    #   30-89일:  Infrequent Access (가끔 액세스함)
                    #   90-364일: Glacier           (거의 액세스하지 않지만 아카이브로 유지)
                    #   365일 이후: 자동 삭제        (보존 기간이 지난 데이터는 불필요)
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
                    # 365일 후에 오브젝트를 자동 삭제
                    expiration=Duration.days(365),
                ),
                # ルール2: 非現行バージョン（旧バージョン）に対するルール
                # 규칙 2: 비현재 버전 (이전 버전)에 대한 규칙
                s3.LifecycleRule(
                    id="ExpireNoncurrentVersions",
                    enabled=True,
                    # 非現行バージョンは30日後に削除
                    # バージョニングにより旧バージョンが蓄積するため、
                    # コスト管理のために古いバージョンは一定期間後に削除します。
                    # 30日あれば、誤操作に気づいて復旧するのに十分な期間です。
                    # 비현재 버전은 30일 후에 삭제
                    # 버전 관리로 인해 이전 버전이 축적되므로,
                    # 비용 관리를 위해 오래된 버전은 일정 기간 후 삭제합니다.
                    # 30일이면 잘못된 조작을 인지하고 복구하기에 충분한 기간입니다.
                    noncurrent_version_expiration=Duration.days(30),
                ),
            ],
        )

        # ====================================================================
        # バケットポリシー: 暗号化されていないアップロードを拒否
        # 버킷 정책: 암호화되지 않은 업로드를 거부
        # ====================================================================

        # HTTPS (TLS) を使用しないリクエストを拒否するポリシーを追加
        # aws:SecureTransport条件を使い、HTTPでのアクセスを完全にブロックします。
        # これにより、転送中のデータ（data in transit）も暗号化されることを保証します。
        # HTTPS (TLS)를 사용하지 않는 요청을 거부하는 정책을 추가
        # aws:SecureTransport 조건을 사용하여 HTTP 액세스를 완전히 차단합니다.
        # 이를 통해 전송 중인 데이터 (data in transit)도 암호화되는 것을 보장합니다.
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
        # 출력값 (CloudFormation Outputs)
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
