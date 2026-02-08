"""
Detective Controls Stack (発見的統制スタック)
=============================================

このスタックは、AWSアカウントのセキュリティ監視基盤を構築します。

【なぜ発見的統制が最優先なのか】
セキュリティインシデントが発生した場合、最初に確認するのはCloudTrailのログです。
ログがなければ「何が起きたか」「誰がやったか」「いつ発生したか」を特定できません。
つまり、CloudTrailは全てのセキュリティ対策の土台となるサービスです。

Architecture:
    CloudTrail → S3 (長期保管) + CloudWatch Logs (リアルタイム分析)
    GuardDuty → EventBridge → SNS → セキュリティチーム通知
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

    【構成要素】
    1. CloudTrail  - 全API呼び出しの監査ログ記録
    2. GuardDuty   - 機械学習による脅威検出
    3. EventBridge - セキュリティイベントのルーティング
    4. SNS         - セキュリティチームへの自動通知
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ====================================================================
        # SNS Topic: セキュリティアラート通知
        # ====================================================================
        # 【なぜ自動通知が重要なのか】
        # セキュリティの脅威は24時間365日発生します。人間が常時監視するのは
        # 不可能なため、検出から通知までを自動化することが不可欠です。
        # 平均検出時間(MTTD)を短縮することで、被害の拡大を防ぎます。
        security_topic = sns.Topic(
            self,
            "SecurityAlertsTopic",
            topic_name="security-alerts",
            display_name="Security Alerts - High Severity Findings",
        )

        # メール通知のプレースホルダー
        # 本番環境では実際のセキュリティチームのメールアドレスに置き換えてください
        # security_topic.add_subscription(
        #     sns_subscriptions.EmailSubscription("security-team@example.com")
        # )

        # ====================================================================
        # S3 Bucket: CloudTrailログの保管先
        # ====================================================================
        # 【なぜ専用バケットが必要なのか】
        # CloudTrailのログは法的証拠(フォレンジック)として使用される場合があります。
        # そのため、改ざん防止・アクセス制御・ライフサイクル管理を厳密に行う
        # 専用バケットが必要です。
        trail_bucket = s3.Bucket(
            self,
            "CloudTrailLogsBucket",
            # 暗号化: 保管時のデータ保護（コンプライアンス要件）
            encryption=s3.BucketEncryption.S3_MANAGED,
            # バージョニング: ログファイルの改ざん検出に有効
            versioned=True,
            # パブリックアクセス禁止: ログの外部漏洩を防止
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            # ライフサイクルポリシー: コスト最適化と長期保管
            lifecycle_rules=[
                s3.LifecycleRule(
                    # 90日後にInfrequent Accessに移行（コスト削減）
                    transitions=[
                        s3.Transition(
                            storage_class=s3.StorageClass.INFREQUENT_ACCESS,
                            transition_after=Duration.days(90),
                        ),
                        # 365日後にGlacierに移行（長期保管・コンプライアンス対応）
                        s3.Transition(
                            storage_class=s3.StorageClass.GLACIER,
                            transition_after=Duration.days(365),
                        ),
                    ],
                    # 7年間保持（PCI DSS等のコンプライアンス要件に対応）
                    expiration=Duration.days(2555),
                ),
            ],
            # スタック削除時の動作: 本番では RETAIN を推奨
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )

        # ====================================================================
        # CloudWatch Logs Group: リアルタイムログ分析
        # ====================================================================
        # 【なぜCloudWatch Logsにも送るのか】
        # S3は長期保管に適していますが、リアルタイム分析には向きません。
        # CloudWatch Logsに送ることで、Metric Filtersを使った
        # リアルタイムアラート（例：ルートユーザーログイン検出）が可能になります。
        trail_log_group = logs.LogGroup(
            self,
            "CloudTrailLogGroup",
            log_group_name="/aws/cloudtrail/management-events",
            retention=logs.RetentionDays.SIX_MONTHS,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # ====================================================================
        # CloudTrail: 全API呼び出しの監査ログ
        # ====================================================================
        # 【なぜCloudTrailがセキュリティインシデント対応の第一歩なのか】
        # CloudTrailは「誰が(who)」「何を(what)」「いつ(when)」「どこから(where)」
        # APIを呼び出したかを記録します。セキュリティインシデント発生時、
        # 攻撃者の行動を時系列で追跡するための唯一の信頼できるデータソースです。
        #
        # 【なぜログファイル検証が重要なのか】
        # enable_file_validation=True により、各ログファイルのSHA-256ハッシュが
        # 連鎖的に計算されます（ハッシュチェーン）。これにより：
        # - ログファイルが改ざんされていないことを暗号学的に証明できる
        # - ログファイルが削除されていないことを検出できる
        # - フォレンジック調査でログの完全性を法的に証明できる
        trail = cloudtrail.Trail(
            self,
            "ManagementEventsTrail",
            trail_name="management-events-trail",
            bucket=trail_bucket,
            # CloudWatch Logsへの配信（リアルタイム分析用）
            send_to_cloud_watch_logs=True,
            cloud_watch_log_group=trail_log_group,
            # ログファイル検証: SHA-256ハッシュチェーンによる改ざん防止
            # 攻撃者がログを改ざんしても、ハッシュの不整合で検出可能
            enable_file_validation=True,
            # マルチリージョン: 全リージョンのAPI呼び出しを記録
            # 攻撃者は監視の薄いリージョンを狙うことがあるため、全リージョン必須
            is_multi_region_trail=True,
            # 管理イベント: 読み取り+書き込みの両方を記録
            # 読み取りイベントも記録する理由: 偵察活動（Reconnaissance）の検出
            management_events=cloudtrail.ReadWriteType.ALL,
            # S3暗号化: ログの保管時暗号化
            s3_key_prefix="cloudtrail-logs",
        )

        # ====================================================================
        # GuardDuty: 機械学習ベースの脅威検出
        # ====================================================================
        # 【GuardDutyが機械学習と脅威インテリジェンスを活用する仕組み】
        # GuardDutyは以下の3つのデータソースを分析します：
        # 1. VPC Flow Logs     - ネットワーク通信の異常検出
        # 2. DNS Logs          - 悪意あるドメインへの通信検出
        # 3. CloudTrail Events - 不正なAPI呼び出しパターンの検出
        #
        # これらを機械学習モデルで分析し、以下のような脅威を自動検出します：
        # - 暗号通貨マイニング（EC2がマイニングプールと通信）
        # - 認証情報の漏洩（通常と異なるIPからのAPI呼び出し）
        # - データ流出（S3バケットへの異常なアクセスパターン）
        # - C2通信（既知のCommand & Controlサーバーとの通信）
        detector = guardduty.CfnDetector(
            self,
            "GuardDutyDetector",
            enable=True,
            # 検出結果の公開頻度: 15分間隔（最も短い設定）
            # セキュリティインシデントは早期発見が重要なため、最短間隔を推奨
            finding_publishing_frequency="FIFTEEN_MINUTES",
            # S3データソース保護: S3へのアクセスパターンを分析
            # 不正なデータアクセスやデータ流出の試みを検出
            data_sources=guardduty.CfnDetector.CFNDataSourceConfigurationsProperty(
                s3_logs=guardduty.CfnDetector.CFNS3LogsConfigurationProperty(
                    enable=True,
                ),
            ),
        )

        # ====================================================================
        # EventBridge Rule: GuardDuty高重要度検出結果の自動通知
        # ====================================================================
        # 【なぜ自動通知が不可欠なのか】
        # GuardDutyの検出結果を人間が定期的にコンソールで確認するのは現実的ではありません。
        # 高重要度（High Severity）の検出結果は、即座にセキュリティチームに
        # 通知する必要があります。Severity 7.0以上は緊急対応が必要な脅威を示します。
        #
        # 重要度レベル:
        #   High   (7.0-8.9): 即座に対応が必要（例：認証情報漏洩、マルウェア通信）
        #   Medium (4.0-6.9): 調査が必要（例：異常なAPI呼び出しパターン）
        #   Low    (1.0-3.9): 情報提供（例：ポートスキャン検出）
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
