"""
Detective Controls Stack (発見的統制スタック)
Detective Controls Stack (탐지 통제 스택)
=============================================

このスタックは、AWSアカウントのセキュリティ監視基盤を構築します。
이 스택은 AWS 계정의 보안 모니터링 기반을 구축합니다.

【なぜ発見的統制が最優先なのか】
【왜 탐지 통제가 최우선인가】
セキュリティインシデントが発生した場合、最初に確認するのはCloudTrailのログです。
보안 인시던트가 발생했을 때 가장 먼저 확인하는 것은 CloudTrail 로그입니다.
ログがなければ「何が起きたか」「誰がやったか」「いつ発生したか」を特定できません。
로그가 없으면 "무엇이 일어났는지", "누가 했는지", "언제 발생했는지"를 특정할 수 없습니다.
つまり、CloudTrailは全てのセキュリティ対策の土台となるサービスです。
즉, CloudTrail은 모든 보안 대책의 기반이 되는 서비스입니다.

Architecture:
    CloudTrail → S3 (長期保管) + CloudWatch Logs (リアルタイム分析)
    CloudTrail → S3 (장기 보관) + CloudWatch Logs (실시간 분석)
    GuardDuty → EventBridge → SNS → セキュリティチーム通知
    GuardDuty → EventBridge → SNS → 보안팀 알림
"""

from constructs import Construct
import aws_cdk as cdk
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    CfnOutput,
    aws_s3 as s3,
    aws_cloudtrail as cloudtrail,
    aws_guardduty as guardduty,
    aws_logs as logs,
    aws_events as events,
    aws_events_targets as events_targets,
    aws_sns as sns,
    aws_sns_subscriptions as sns_subscriptions,
    aws_iam as iam,
)


class DetectiveControlsStack(Stack):
    """
    発見的統制スタック
    탐지 통제 스택

    【構成要素】
    【구성 요소】
    1. CloudTrail  - 全API呼び出しの監査ログ記録
    1. CloudTrail  - 모든 API 호출의 감사 로그 기록
    2. GuardDuty   - 機械学習による脅威検出
    2. GuardDuty   - 머신러닝 기반 위협 탐지
    3. EventBridge - セキュリティイベントのルーティング
    3. EventBridge - 보안 이벤트 라우팅
    4. SNS         - セキュリティチームへの自動通知
    4. SNS         - 보안팀에 자동 알림
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ====================================================================
        # SNS Topic: セキュリティアラート通知
        # SNS Topic: 보안 알림 통지
        # ====================================================================
        # 【なぜ自動通知が重要なのか】
        # 【왜 자동 알림이 중요한가】
        # セキュリティの脅威は24時間365日発生します。人間が常時監視するのは
        # 보안 위협은 24시간 365일 발생합니다. 사람이 상시 모니터링하는 것은
        # 不可能なため、検出から通知までを自動化することが不可欠です。
        # 불가능하므로, 탐지부터 알림까지 자동화하는 것이 필수적입니다.
        # 平均検出時間(MTTD)を短縮することで、被害の拡大を防ぎます。
        # 평균 탐지 시간(MTTD)을 단축함으로써 피해 확산을 방지합니다.
        security_topic = sns.Topic(
            self,
            "SecurityAlertsTopic",
            topic_name="security-alerts",
            display_name="Security Alerts - High Severity Findings",
        )

        # メール通知のプレースホルダー
        # 이메일 알림 플레이스홀더
        # 本番環境では実際のセキュリティチームのメールアドレスに置き換えてください
        # 프로덕션 환경에서는 실제 보안팀 이메일 주소로 교체하세요
        # security_topic.add_subscription(
        #     sns_subscriptions.EmailSubscription("security-team@example.com")
        # )

        # ====================================================================
        # S3 Bucket: CloudTrailログの保管先
        # S3 Bucket: CloudTrail 로그 저장소
        # ====================================================================
        # 【なぜ専用バケットが必要なのか】
        # 【왜 전용 버킷이 필요한가】
        # CloudTrailのログは法的証拠(フォレンジック)として使用される場合があります。
        # CloudTrail 로그는 법적 증거(포렌식)로 사용될 수 있습니다.
        # そのため、改ざん防止・アクセス制御・ライフサイクル管理を厳密に行う
        # 따라서 위변조 방지, 접근 제어, 수명 주기 관리를 엄격하게 수행하는
        # 専用バケットが必要です。
        # 전용 버킷이 필요합니다.
        trail_bucket = s3.Bucket(
            self,
            "CloudTrailLogsBucket",
            # 暗号化: 保管時のデータ保護（コンプライアンス要件）
            # 암호화: 저장 시 데이터 보호 (컴플라이언스 요건)
            encryption=s3.BucketEncryption.S3_MANAGED,
            # バージョニング: ログファイルの改ざん検出に有効
            # 버전 관리: 로그 파일 위변조 감지에 유효
            versioned=True,
            # パブリックアクセス禁止: ログの外部漏洩を防止
            # 퍼블릭 액세스 차단: 로그의 외부 유출 방지
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            # ライフサイクルポリシー: コスト最適化と長期保管
            # 수명 주기 정책: 비용 최적화 및 장기 보관
            lifecycle_rules=[
                s3.LifecycleRule(
                    # 90日後にInfrequent Accessに移行（コスト削減）
                    # 90일 후 Infrequent Access로 전환 (비용 절감)
                    transitions=[
                        s3.Transition(
                            storage_class=s3.StorageClass.INFREQUENT_ACCESS,
                            transition_after=Duration.days(90),
                        ),
                        # 365日後にGlacierに移行（長期保管・コンプライアンス対応）
                        # 365일 후 Glacier로 전환 (장기 보관 및 컴플라이언스 대응)
                        s3.Transition(
                            storage_class=s3.StorageClass.GLACIER,
                            transition_after=Duration.days(365),
                        ),
                    ],
                    # 7年間保持（PCI DSS等のコンプライアンス要件に対応）
                    # 7년간 보존 (PCI DSS 등의 컴플라이언스 요건에 대응)
                    expiration=Duration.days(2555),
                ),
            ],
            # スタック削除時の動作: 本番では RETAIN を推奨
            # 스택 삭제 시 동작: 프로덕션에서는 RETAIN 권장
            # WARNING: Use RemovalPolicy.RETAIN in production
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )

        # ====================================================================
        # CloudWatch Logs Group: リアルタイムログ分析
        # CloudWatch Logs Group: 실시간 로그 분석
        # ====================================================================
        # 【なぜCloudWatch Logsにも送るのか】
        # 【왜 CloudWatch Logs에도 전송하는가】
        # S3は長期保管に適していますが、リアルタイム分析には向きません。
        # S3는 장기 보관에 적합하지만 실시간 분석에는 적합하지 않습니다.
        # CloudWatch Logsに送ることで、Metric Filtersを使った
        # CloudWatch Logs로 전송함으로써 Metric Filters를 사용한
        # リアルタイムアラート（例：ルートユーザーログイン検出）が可能になります。
        # 실시간 알림 (예: 루트 사용자 로그인 감지)이 가능해집니다.
        trail_log_group = logs.LogGroup(
            self,
            "CloudTrailLogGroup",
            log_group_name="/aws/cloudtrail/management-events",
            retention=logs.RetentionDays.SIX_MONTHS,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # ====================================================================
        # CloudTrail: 全API呼び出しの監査ログ
        # CloudTrail: 모든 API 호출의 감사 로그
        # ====================================================================
        # 【なぜCloudTrailがセキュリティインシデント対応の第一歩なのか】
        # 【왜 CloudTrail이 보안 인시던트 대응의 첫 단계인가】
        # CloudTrailは「誰が(who)」「何を(what)」「いつ(when)」「どこから(where)」
        # CloudTrail은 "누가(who)", "무엇을(what)", "언제(when)", "어디서(where)"
        # APIを呼び出したかを記録します。セキュリティインシデント発生時、
        # API를 호출했는지 기록합니다. 보안 인시던트 발생 시,
        # 攻撃者の行動を時系列で追跡するための唯一の信頼できるデータソースです。
        # 공격자의 행동을 시간순으로 추적하기 위한 유일하게 신뢰할 수 있는 데이터 소스입니다.
        #
        # 【なぜログファイル検証が重要なのか】
        # 【왜 로그 파일 검증이 중요한가】
        # enable_file_validation=True により、各ログファイルのSHA-256ハッシュが
        # enable_file_validation=True로 인해 각 로그 파일의 SHA-256 해시가
        # 連鎖的に計算されます（ハッシュチェーン）。これにより：
        # 연쇄적으로 계산됩니다 (해시 체인). 이를 통해:
        # - ログファイルが改ざんされていないことを暗号学的に証明できる
        # - 로그 파일이 위변조되지 않았음을 암호학적으로 증명할 수 있음
        # - ログファイルが削除されていないことを検出できる
        # - 로그 파일이 삭제되지 않았음을 감지할 수 있음
        # - フォレンジック調査でログの完全性を法的に証明できる
        # - 포렌식 조사에서 로그의 무결성을 법적으로 증명할 수 있음
        trail = cloudtrail.Trail(
            self,
            "ManagementEventsTrail",
            trail_name="management-events-trail",
            bucket=trail_bucket,
            # CloudWatch Logsへの配信（リアルタイム分析用）
            # CloudWatch Logs로의 전송 (실시간 분석용)
            send_to_cloud_watch_logs=True,
            cloud_watch_log_group=trail_log_group,
            # ログファイル検証: SHA-256ハッシュチェーンによる改ざん防止
            # 로그 파일 검증: SHA-256 해시 체인을 통한 위변조 방지
            # 攻撃者がログを改ざんしても、ハッシュの不整合で検出可能
            # 공격자가 로그를 위변조하더라도 해시 불일치로 감지 가능
            enable_file_validation=True,
            # マルチリージョン: 全リージョンのAPI呼び出しを記録
            # 멀티 리전: 모든 리전의 API 호출을 기록
            # 攻撃者は監視の薄いリージョンを狙うことがあるため、全リージョン必須
            # 공격자는 모니터링이 약한 리전을 노릴 수 있으므로 전체 리전 필수
            is_multi_region_trail=True,
            # 管理イベント: 読み取り+書き込みの両方を記録
            # 관리 이벤트: 읽기+쓰기 모두 기록
            # 読み取りイベントも記録する理由: 偵察活動（Reconnaissance）の検出
            # 읽기 이벤트도 기록하는 이유: 정찰 활동(Reconnaissance) 탐지
            management_events=cloudtrail.ReadWriteType.ALL,
            # S3暗号化: ログの保管時暗号化
            # S3 암호화: 로그의 저장 시 암호화
            s3_key_prefix="cloudtrail-logs",
        )

        # ====================================================================
        # GuardDuty: 機械学習ベースの脅威検出
        # GuardDuty: 머신러닝 기반 위협 탐지
        # ====================================================================
        # 【GuardDutyが機械学習と脅威インテリジェンスを活用する仕組み】
        # 【GuardDuty가 머신러닝과 위협 인텔리전스를 활용하는 구조】
        # GuardDutyは以下の3つのデータソースを分析します：
        # GuardDuty는 다음 3가지 데이터 소스를 분석합니다:
        # 1. VPC Flow Logs     - ネットワーク通信の異常検出
        # 1. VPC Flow Logs     - 네트워크 통신 이상 탐지
        # 2. DNS Logs          - 悪意あるドメインへの通信検出
        # 2. DNS Logs          - 악성 도메인으로의 통신 탐지
        # 3. CloudTrail Events - 不正なAPI呼び出しパターンの検出
        # 3. CloudTrail Events - 부정한 API 호출 패턴 탐지
        #
        # これらを機械学習モデルで分析し、以下のような脅威を自動検出します：
        # 이를 머신러닝 모델로 분석하여 다음과 같은 위협을 자동 탐지합니다:
        # - 暗号通貨マイニング（EC2がマイニングプールと通信）
        # - 암호화폐 마이닝 (EC2가 마이닝 풀과 통신)
        # - 認証情報の漏洩（通常と異なるIPからのAPI呼び出し）
        # - 인증 정보 유출 (평소와 다른 IP에서의 API 호출)
        # - データ流出（S3バケットへの異常なアクセスパターン）
        # - 데이터 유출 (S3 버킷에 대한 비정상 접근 패턴)
        # - C2通信（既知のCommand & Controlサーバーとの通信）
        # - C2 통신 (알려진 Command & Control 서버와의 통신)
        detector = guardduty.CfnDetector(
            self,
            "GuardDutyDetector",
            enable=True,
            # 検出結果の公開頻度: 15分間隔（最も短い設定）
            # 탐지 결과 게시 빈도: 15분 간격 (가장 짧은 설정)
            # セキュリティインシデントは早期発見が重要なため、最短間隔を推奨
            # 보안 인시던트는 조기 발견이 중요하므로 최단 간격 권장
            finding_publishing_frequency="FIFTEEN_MINUTES",
            # S3データソース保護: S3へのアクセスパターンを分析
            # S3 데이터 소스 보호: S3 접근 패턴을 분석
            # 不正なデータアクセスやデータ流出の試みを検出
            # 부정한 데이터 접근이나 데이터 유출 시도를 탐지
            data_sources=guardduty.CfnDetector.CFNDataSourceConfigurationsProperty(
                s3_logs=guardduty.CfnDetector.CFNS3LogsConfigurationProperty(
                    enable=True,
                ),
            ),
        )

        # ====================================================================
        # EventBridge Rule: GuardDuty高重要度検出結果の自動通知
        # EventBridge Rule: GuardDuty 고심각도 탐지 결과 자동 알림
        # ====================================================================
        # 【なぜ自動通知が不可欠なのか】
        # 【왜 자동 알림이 필수적인가】
        # GuardDutyの検出結果を人間が定期的にコンソールで確認するのは現実的ではありません。
        # GuardDuty 탐지 결과를 사람이 정기적으로 콘솔에서 확인하는 것은 현실적이지 않습니다.
        # 高重要度（High Severity）の検出結果は、即座にセキュリティチームに
        # 고심각도(High Severity) 탐지 결과는 즉시 보안팀에
        # 通知する必要があります。Severity 7.0以上は緊急対応が必要な脅威を示します。
        # 알려야 합니다. Severity 7.0 이상은 긴급 대응이 필요한 위협을 나타냅니다.
        #
        # 重要度レベル:
        # 심각도 레벨:
        #   High   (7.0-8.9): 即座に対応が必要（例：認証情報漏洩、マルウェア通信）
        #   High   (7.0-8.9): 즉시 대응 필요 (예: 인증 정보 유출, 맬웨어 통신)
        #   Medium (4.0-6.9): 調査が必要（例：異常なAPI呼び出しパターン）
        #   Medium (4.0-6.9): 조사 필요 (예: 비정상 API 호출 패턴)
        #   Low    (1.0-3.9): 情報提供（例：ポートスキャン検出）
        #   Low    (1.0-3.9): 정보 제공 (예: 포트 스캔 탐지)
        guardduty_rule = events.Rule(
            self,
            "GuardDutyHighSeverityRule",
            rule_name="guardduty-high-severity-findings",
            description="Capture GuardDuty findings with High severity (7.0+)",
            event_pattern=events.EventPattern(
                source=["aws.guardduty"],
                detail_type=["GuardDuty Finding"],
                detail={
                    "severity": [
                        {"numeric": [">=", 7]},
                    ],
                },
            ),
        )

        # SNSトピックをEventBridgeルールのターゲットに設定
        # SNS 토픽을 EventBridge 규칙의 타겟으로 설정
        guardduty_rule.add_target(events_targets.SnsTopic(security_topic))

        # ====================================================================
        # Outputs
        # ====================================================================
        CfnOutput(
            self,
            "TrailArn",
            value=trail.trail_arn,
            description="CloudTrail trail ARN for management event auditing",
            export_name="DetectiveControls-TrailArn",
        )

        CfnOutput(
            self,
            "DetectorId",
            value=detector.ref,
            description="GuardDuty detector ID for threat detection",
            export_name="DetectiveControls-DetectorId",
        )

        CfnOutput(
            self,
            "SecurityTopicArn",
            value=security_topic.topic_arn,
            description="SNS topic ARN for security alert notifications",
            export_name="DetectiveControls-SecurityTopicArn",
        )
