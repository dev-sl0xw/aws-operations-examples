"""
CloudFront + WAF Stack (コンテンツ配信 + WAFスタック)
====================================================

このスタックは、CloudFrontによるグローバルコンテンツ配信と
WAF(Web Application Firewall)による多層防御を構築します。

【Defense in Depth（多層防御）パターン】
CloudFront + WAFの組み合わせは、以下の多層防御を実現します：

    インターネット → WAF(L7フィルタリング) → CloudFront(エッジキャッシュ)
                                                    → S3(オリジン)

1. WAF層:   SQLインジェクション、XSS、既知の攻撃パターンをブロック
2. CloudFront層: DDoS緩和(AWS Shield Standard自動適用)、地理制限
3. OAC層:   S3への直接アクセスを防止、CloudFront経由のみ許可

【なぜCloudFront用のWAFはus-east-1にデプロイする必要があるのか】
CloudFrontはグローバルサービスですが、設定管理はus-east-1で行われます。
WAF Web ACLをCloudFrontに関連付けるには、Web ACLも
us-east-1にデプロイする必要があります。これはAWSのアーキテクチャ上の制約です。
"""

from constructs import Construct
import aws_cdk as cdk
from aws_cdk import (
    Stack,
    RemovalPolicy,
    CfnOutput,
    aws_s3 as s3,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_wafv2 as wafv2,
)


class CloudFrontWafStack(Stack):
    """
    CloudFront + WAF多層防御スタック

    【構成要素】
    1. S3バケット     - 静的コンテンツのオリジン
    2. OAC           - S3への安全なアクセス制御
    3. CloudFront    - グローバルCDN配信
    4. WAF Web ACL   - Webアプリケーション保護
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ====================================================================
        # S3 Bucket: CloudFrontオリジン（静的ウェブサイト）
        # ====================================================================
        origin_bucket = s3.Bucket(
            self,
            "OriginBucket",
            # パブリックアクセスを完全にブロック
            # OACを使うため、S3バケット自体はプライベートのままでよい
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            # バージョニングでコンテンツの誤削除を防止
            versioned=True,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )

        # ====================================================================
        # WAF Web ACL: Webアプリケーションファイアウォール
        # ====================================================================
        # 【WAFルールの評価順序について】
        # WAFルールはPriority（優先度）の数値が小さい順に評価されます。
        # あるルールでBlock/Allowが決定すると、それ以降のルールは評価されません。
        # したがって、最も重要なルール（レート制限など）を最初に配置します。
        #
        # 評価順序:
        #   Priority 0: レート制限     → DDoS攻撃を最初にブロック
        #   Priority 1: 共通ルールセット → OWASP Top 10の攻撃パターン
        #   Priority 2: SQLi対策       → SQLインジェクション攻撃
        #   Priority 3: 既知の悪意ある入力 → Log4Shell等の既知脆弱性
        web_acl = wafv2.CfnWebACL(
            self,
            "CloudFrontWebAcl",
            # 【デフォルトアクション: Allow】
            # どのルールにもマッチしない場合はリクエストを許可する。
            # これは「ホワイトリスト方式ではなくブラックリスト方式」の防御。
            # 正当なトラフィックをブロックしないことを優先している。
            default_action=wafv2.CfnWebACL.DefaultActionProperty(
                allow=wafv2.CfnWebACL.AllowActionProperty(),
            ),
            # 【Scope: CLOUDFRONT】
            # CloudFrontに関連付けるWeb ACLはスコープをCLOUDFRONTに設定する必要がある。
            # REGIONAL スコープはALB/API Gateway等のリージョナルリソース用。
            scope="CLOUDFRONT",
            visibility_config=wafv2.CfnWebACL.VisibilityConfigProperty(
                cloud_watch_metrics_enabled=True,
                metric_name="CloudFrontWebAclMetrics",
                sampled_requests_enabled=True,
            ),
            name="cloudfront-web-acl",
            rules=[
                # ================================================================
                # Rule 0: レート制限ルール（DDoS保護）
                # ================================================================
                # 【なぜレート制限がDDoS対策になるのか】
                # 単一IPアドレスからの大量リクエストを制限することで、
                # アプリケーション層(L7)のDDoS攻撃を緩和します。
                # 5分間で2000リクエスト = 1分あたり約400リクエストが上限。
                # 正規ユーザーがこの制限に達することは通常ありません。
                #
                # 注意: これはL7 DDoSの緩和であり、L3/L4 DDoSは
                # AWS Shield Standard（CloudFrontに自動適用）が防御します。
                wafv2.CfnWebACL.RuleProperty(
                    name="RateLimitRule",
                    priority=0,
                    action=wafv2.CfnWebACL.RuleActionProperty(
                        block=wafv2.CfnWebACL.BlockActionProperty(),
                    ),
                    statement=wafv2.CfnWebACL.StatementProperty(
                        rate_based_statement=wafv2.CfnWebACL.RateBasedStatementProperty(
                            # 5分間あたりの最大リクエスト数（IP単位）
                            limit=2000,
                            aggregate_key_type="IP",
                        ),
                    ),
                    visibility_config=wafv2.CfnWebACL.VisibilityConfigProperty(
                        cloud_watch_metrics_enabled=True,
                        metric_name="RateLimitRuleMetrics",
                        sampled_requests_enabled=True,
                    ),
                ),
                # ================================================================
                # Rule 1: AWS Managed Rules - Common Rule Set
                # ================================================================
                # 【共通ルールセット(CRS)とは】
                # OWASP Top 10を含む一般的なWeb攻撃パターンを検出するルール群。
                # クロスサイトスクリプティング(XSS)、パストラバーサル、
                # リモートコード実行などの攻撃を防御します。
                # AWSが継続的にルールを更新するため、新しい攻撃にも対応できます。
                wafv2.CfnWebACL.RuleProperty(
                    name="AWSManagedRulesCommonRuleSet",
                    priority=1,
                    override_action=wafv2.CfnWebACL.OverrideActionProperty(
                        none={}
                    ),
                    statement=wafv2.CfnWebACL.StatementProperty(
                        managed_rule_group_statement=wafv2.CfnWebACL.ManagedRuleGroupStatementProperty(
                            vendor_name="AWS",
                            name="AWSManagedRulesCommonRuleSet",
                        ),
                    ),
                    visibility_config=wafv2.CfnWebACL.VisibilityConfigProperty(
                        cloud_watch_metrics_enabled=True,
                        metric_name="CommonRuleSetMetrics",
                        sampled_requests_enabled=True,
                    ),
                ),
                # ================================================================
                # Rule 2: AWS Managed Rules - SQL Injection
                # ================================================================
                # 【SQLインジェクション(SQLi)対策】
                # SQLiは最も危険な攻撃の一つで、データベースの
                # 不正アクセス・データ漏洩・データ改ざんを引き起こします。
                # このルールセットは、リクエストのボディ、クエリ文字列、
                # URIパスに含まれるSQLiパターンを検出・ブロックします。
                wafv2.CfnWebACL.RuleProperty(
                    name="AWSManagedRulesSQLiRuleSet",
                    priority=2,
                    override_action=wafv2.CfnWebACL.OverrideActionProperty(
                        none={}
                    ),
                    statement=wafv2.CfnWebACL.StatementProperty(
                        managed_rule_group_statement=wafv2.CfnWebACL.ManagedRuleGroupStatementProperty(
                            vendor_name="AWS",
                            name="AWSManagedRulesSQLiRuleSet",
                        ),
                    ),
                    visibility_config=wafv2.CfnWebACL.VisibilityConfigProperty(
                        cloud_watch_metrics_enabled=True,
                        metric_name="SQLiRuleSetMetrics",
                        sampled_requests_enabled=True,
                    ),
                ),
                # ================================================================
                # Rule 3: AWS Managed Rules - Known Bad Inputs
                # ================================================================
                # 【既知の悪意ある入力パターン】
                # Log4Shell (CVE-2021-44228)、Spring4Shell等の
                # 既知の脆弱性を悪用するリクエストパターンを検出します。
                # AWSのセキュリティチームが新しい脆弱性の発見後、
                # 迅速にルールを追加するため、ゼロデイ対応にも有効です。
                wafv2.CfnWebACL.RuleProperty(
                    name="AWSManagedRulesKnownBadInputsRuleSet",
                    priority=3,
                    override_action=wafv2.CfnWebACL.OverrideActionProperty(
                        none={}
                    ),
                    statement=wafv2.CfnWebACL.StatementProperty(
                        managed_rule_group_statement=wafv2.CfnWebACL.ManagedRuleGroupStatementProperty(
                            vendor_name="AWS",
                            name="AWSManagedRulesKnownBadInputsRuleSet",
                        ),
                    ),
                    visibility_config=wafv2.CfnWebACL.VisibilityConfigProperty(
                        cloud_watch_metrics_enabled=True,
                        metric_name="KnownBadInputsRuleSetMetrics",
                        sampled_requests_enabled=True,
                    ),
                ),
            ],
        )

        # ====================================================================
        # CloudFront Distribution
        # ====================================================================
        # 【なぜOAC(Origin Access Control)がOAI(Origin Access Identity)より推奨されるのか】
        # OAI (旧方式) の問題点:
        #   - SSE-KMS暗号化されたS3バケットをサポートしない
        #   - S3バケットポリシーが複雑になる
        #   - レガシー機能として新機能の追加が停止している
        #
        # OAC (新方式) の利点:
        #   - SSE-KMS暗号化をサポート
        #   - SigV4署名によるセキュアなリクエスト認証
        #   - 全てのAWSリージョンのS3バケットをサポート
        #   - S3バケットポリシーが簡潔
        #   - AWSが推奨する現在のベストプラクティス
        distribution = cloudfront.Distribution(
            self,
            "CloudFrontDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                # S3オリジン（OACは高レベルコンストラクトが自動設定）
                origin=origins.S3BucketOrigin.with_origin_access_control(
                    origin_bucket,
                ),
                # 【HTTPS リダイレクト】
                # HTTP→HTTPSリダイレクトにより、全通信を暗号化。
                # 中間者攻撃(MITM)やパケット盗聴を防止。
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                # 【キャッシュポリシー: CacheOptimized】
                # AWSが提供する最適化済みキャッシュポリシー。
                # 静的コンテンツのキャッシュヒット率を最大化し、
                # オリジンへのリクエストを削減します。
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                # 圧縮を有効化してレスポンスサイズを削減
                compress=True,
            ),
            # 【Price Class 200】
            # 北米、ヨーロッパ、アジア、中東、アフリカのエッジロケーションを使用。
            # Price Class ALLより安価だが、主要地域はカバー。
            # 南米とオセアニアの一部エッジロケーションは含まれない。
            price_class=cloudfront.PriceClass.PRICE_CLASS_200,
            # WAF Web ACLの関連付け
            web_acl_id=web_acl.attr_arn,
            # デフォルトルートオブジェクト
            default_root_object="index.html",
            # エラーレスポンス: SPAアプリケーション対応
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                ),
            ],
        )

        # ====================================================================
        # Outputs
        # ====================================================================
        CfnOutput(
            self,
            "DistributionDomainName",
            value=distribution.distribution_domain_name,
            description="CloudFront distribution domain name",
            export_name="CloudFrontWaf-DistributionDomainName",
        )

        CfnOutput(
            self,
            "WebAclArn",
            value=web_acl.attr_arn,
            description="WAF Web ACL ARN",
            export_name="CloudFrontWaf-WebAclArn",
        )
