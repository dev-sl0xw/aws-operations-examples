"""
CloudFront + WAF Stack (コンテンツ配信 + WAFスタック)
CloudFront + WAF Stack (콘텐츠 전송 + WAF 스택)
====================================================

このスタックは、CloudFrontによるグローバルコンテンツ配信と
이 스택은 CloudFront를 통한 글로벌 콘텐츠 전송과
WAF(Web Application Firewall)による多層防御を構築します。
WAF(Web Application Firewall)를 통한 다층 방어를 구축합니다.

【Defense in Depth（多層防御）パターン】
【Defense in Depth (다층 방어) 패턴】
CloudFront + WAFの組み合わせは、以下の多層防御を実現します：
CloudFront + WAF 조합은 다음과 같은 다층 방어를 구현합니다:

    インターネット → WAF(L7フィルタリング) → CloudFront(エッジキャッシュ)
    인터넷 → WAF(L7 필터링) → CloudFront(엣지 캐시)
                                                    → S3(オリジン)
                                                    → S3(오리진)

1. WAF層:   SQLインジェクション、XSS、既知の攻撃パターンをブロック
1. WAF 계층: SQL Injection, XSS, 알려진 공격 패턴을 차단
2. CloudFront層: DDoS緩和(AWS Shield Standard自動適用)、地理制限
2. CloudFront 계층: DDoS 완화 (AWS Shield Standard 자동 적용), 지리적 제한
3. OAC層:   S3への直接アクセスを防止、CloudFront経由のみ許可
3. OAC 계층: S3에 대한 직접 접근을 방지, CloudFront 경유만 허용

【なぜCloudFront用のWAFはus-east-1にデプロイする必要があるのか】
【왜 CloudFront용 WAF는 us-east-1에 배포해야 하는가】
CloudFrontはグローバルサービスですが、設定管理はus-east-1で行われます。
CloudFront는 글로벌 서비스이지만 설정 관리는 us-east-1에서 수행됩니다.
WAF Web ACLをCloudFrontに関連付けるには、Web ACLも
WAF Web ACL을 CloudFront에 연결하려면 Web ACL도
us-east-1にデプロイする必要があります。これはAWSのアーキテクチャ上の制約です。
us-east-1에 배포해야 합니다. 이는 AWS 아키텍처상의 제약입니다.
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
    CloudFront + WAF 다층 방어 스택

    【構成要素】
    【구성 요소】
    1. S3バケット     - 静的コンテンツのオリジン
    1. S3 버킷       - 정적 콘텐츠의 오리진
    2. OAC           - S3への安全なアクセス制御
    2. OAC           - S3에 대한 안전한 접근 제어
    3. CloudFront    - グローバルCDN配信
    3. CloudFront    - 글로벌 CDN 전송
    4. WAF Web ACL   - Webアプリケーション保護
    4. WAF Web ACL   - 웹 애플리케이션 보호
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ====================================================================
        # S3 Bucket: CloudFrontオリジン（静的ウェブサイト）
        # S3 Bucket: CloudFront 오리진 (정적 웹사이트)
        # ====================================================================
        origin_bucket = s3.Bucket(
            self,
            "OriginBucket",
            # パブリックアクセスを完全にブロック
            # 퍼블릭 액세스를 완전히 차단
            # OACを使うため、S3バケット自体はプライベートのままでよい
            # OAC를 사용하므로 S3 버킷 자체는 프라이빗으로 유지하면 됨
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            # バージョニングでコンテンツの誤削除を防止
            # 버전 관리로 콘텐츠의 실수로 인한 삭제를 방지
            versioned=True,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )

        # ====================================================================
        # WAF Web ACL: Webアプリケーションファイアウォール
        # WAF Web ACL: 웹 애플리케이션 방화벽
        # ====================================================================
        # 【WAFルールの評価順序について】
        # 【WAF 규칙 평가 순서에 대해】
        # WAFルールはPriority（優先度）の数値が小さい順に評価されます。
        # WAF 규칙은 Priority(우선순위)의 숫자가 작은 순서대로 평가됩니다.
        # あるルールでBlock/Allowが決定すると、それ以降のルールは評価されません。
        # 어떤 규칙에서 Block/Allow가 결정되면 이후의 규칙은 평가되지 않습니다.
        # したがって、最も重要なルール（レート制限など）を最初に配置します。
        # 따라서 가장 중요한 규칙(Rate Limit 등)을 먼저 배치합니다.
        #
        # 評価順序:
        # 평가 순서:
        #   Priority 0: レート制限     → DDoS攻撃を最初にブロック
        #   Priority 0: Rate Limit    → DDoS 공격을 먼저 차단
        #   Priority 1: 共通ルールセット → OWASP Top 10の攻撃パターン
        #   Priority 1: 공통 규칙 세트  → OWASP Top 10 공격 패턴
        #   Priority 2: SQLi対策       → SQLインジェクション攻撃
        #   Priority 2: SQLi 대응      → SQL Injection 공격
        #   Priority 3: 既知の悪意ある入力 → Log4Shell等の既知脆弱性
        #   Priority 3: 알려진 악성 입력  → Log4Shell 등 알려진 취약점
        web_acl = wafv2.CfnWebACL(
            self,
            "CloudFrontWebAcl",
            # 【デフォルトアクション: Allow】
            # 【기본 액션: Allow】
            # どのルールにもマッチしない場合はリクエストを許可する。
            # 어떤 규칙에도 일치하지 않는 경우 요청을 허용한다.
            # これは「ホワイトリスト方式ではなくブラックリスト方式」の防御。
            # 이는 "화이트리스트 방식이 아닌 블랙리스트 방식"의 방어이다.
            # 正当なトラフィックをブロックしないことを優先している。
            # 정당한 트래픽을 차단하지 않는 것을 우선시한다.
            default_action=wafv2.CfnWebACL.DefaultActionProperty(
                allow=wafv2.CfnWebACL.AllowActionProperty(),
            ),
            # 【Scope: CLOUDFRONT】
            # 【Scope: CLOUDFRONT】
            # CloudFrontに関連付けるWeb ACLはスコープをCLOUDFRONTに設定する必要がある。
            # CloudFront에 연결할 Web ACL은 스코프를 CLOUDFRONT로 설정해야 한다.
            # REGIONAL スコープはALB/API Gateway等のリージョナルリソース用。
            # REGIONAL 스코프는 ALB/API Gateway 등의 리전 리소스용.
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
                # Rule 0: Rate Limit 규칙 (DDoS 보호)
                # ================================================================
                # 【なぜレート制限がDDoS対策になるのか】
                # 【왜 Rate Limit이 DDoS 대책이 되는가】
                # 単一IPアドレスからの大量リクエストを制限することで、
                # 단일 IP 주소에서의 대량 요청을 제한함으로써,
                # アプリケーション層(L7)のDDoS攻撃を緩和します。
                # 애플리케이션 계층(L7) DDoS 공격을 완화합니다.
                # 5分間で2000リクエスト = 1分あたり約400リクエストが上限。
                # 5분 동안 2000 요청 = 1분당 약 400 요청이 상한.
                # 正規ユーザーがこの制限に達することは通常ありません。
                # 정상 사용자가 이 제한에 도달하는 경우는 일반적으로 없습니다.
                #
                # 注意: これはL7 DDoSの緩和であり、L3/L4 DDoSは
                # 주의: 이것은 L7 DDoS 완화이며, L3/L4 DDoS는
                # AWS Shield Standard（CloudFrontに自動適用）が防御します。
                # AWS Shield Standard (CloudFront에 자동 적용)가 방어합니다.
                wafv2.CfnWebACL.RuleProperty(
                    name="RateLimitRule",
                    priority=0,
                    action=wafv2.CfnWebACL.RuleActionProperty(
                        block=wafv2.CfnWebACL.BlockActionProperty(),
                    ),
                    statement=wafv2.CfnWebACL.StatementProperty(
                        rate_based_statement=wafv2.CfnWebACL.RateBasedStatementProperty(
                            # 5分間あたりの最大リクエスト数（IP単位）
                            # 5분당 최대 요청 수 (IP 단위)
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
                # 【공통 규칙 세트(CRS)란】
                # OWASP Top 10を含む一般的なWeb攻撃パターンを検出するルール群。
                # OWASP Top 10을 포함한 일반적인 웹 공격 패턴을 탐지하는 규칙 모음.
                # クロスサイトスクリプティング(XSS)、パストラバーサル、
                # Cross-Site Scripting(XSS), Path Traversal,
                # リモートコード実行などの攻撃を防御します。
                # Remote Code Execution 등의 공격을 방어합니다.
                # AWSが継続的にルールを更新するため、新しい攻撃にも対応できます。
                # AWS가 지속적으로 규칙을 업데이트하므로 새로운 공격에도 대응할 수 있습니다.
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
                # 【SQL Injection(SQLi) 대책】
                # SQLiは最も危険な攻撃の一つで、データベースの
                # SQLi는 가장 위험한 공격 중 하나로, 데이터베이스의
                # 不正アクセス・データ漏洩・データ改ざんを引き起こします。
                # 부정 접근, 데이터 유출, 데이터 변조를 일으킵니다.
                # このルールセットは、リクエストのボディ、クエリ文字列、
                # 이 규칙 세트는 요청의 바디, 쿼리 문자열,
                # URIパスに含まれるSQLiパターンを検出・ブロックします。
                # URI 경로에 포함된 SQLi 패턴을 탐지하고 차단합니다.
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
                # 【알려진 악성 입력 패턴】
                # Log4Shell (CVE-2021-44228)、Spring4Shell等の
                # Log4Shell (CVE-2021-44228), Spring4Shell 등의
                # 既知の脆弱性を悪用するリクエストパターンを検出します。
                # 알려진 취약점을 악용하는 요청 패턴을 탐지합니다.
                # AWSのセキュリティチームが新しい脆弱性の発見後、
                # AWS 보안팀이 새로운 취약점 발견 후,
                # 迅速にルールを追加するため、ゼロデイ対応にも有効です。
                # 신속하게 규칙을 추가하므로 제로데이 대응에도 유효합니다.
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
        # 【왜 OAC(Origin Access Control)가 OAI(Origin Access Identity)보다 권장되는가】
        # OAI (旧方式) の問題点:
        # OAI (구방식)의 문제점:
        #   - SSE-KMS暗号化されたS3バケットをサポートしない
        #   - SSE-KMS 암호화된 S3 버킷을 지원하지 않음
        #   - S3バケットポリシーが複雑になる
        #   - S3 버킷 정책이 복잡해짐
        #   - レガシー機能として新機能の追加が停止している
        #   - 레거시 기능으로서 새로운 기능 추가가 중단됨
        #
        # OAC (新方式) の利点:
        # OAC (신방식)의 장점:
        #   - SSE-KMS暗号化をサポート
        #   - SSE-KMS 암호화 지원
        #   - SigV4署名によるセキュアなリクエスト認証
        #   - SigV4 서명을 통한 안전한 요청 인증
        #   - 全てのAWSリージョンのS3バケットをサポート
        #   - 모든 AWS 리전의 S3 버킷 지원
        #   - S3バケットポリシーが簡潔
        #   - S3 버킷 정책이 간결
        #   - AWSが推奨する現在のベストプラクティス
        #   - AWS가 권장하는 현재의 모범 사례
        distribution = cloudfront.Distribution(
            self,
            "CloudFrontDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                # S3オリジン（OACは高レベルコンストラクトが自動設定）
                # S3 오리진 (OAC는 고수준 Construct가 자동 설정)
                origin=origins.S3BucketOrigin.with_origin_access_control(
                    origin_bucket,
                ),
                # 【HTTPS リダイレクト】
                # 【HTTPS 리다이렉트】
                # HTTP→HTTPSリダイレクトにより、全通信を暗号化。
                # HTTP→HTTPS 리다이렉트를 통해 모든 통신을 암호화.
                # 中間者攻撃(MITM)やパケット盗聴を防止。
                # 중간자 공격(MITM)이나 패킷 도청을 방지.
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                # 【キャッシュポリシー: CacheOptimized】
                # 【캐시 정책: CacheOptimized】
                # AWSが提供する最適化済みキャッシュポリシー。
                # AWS가 제공하는 최적화된 캐시 정책.
                # 静的コンテンツのキャッシュヒット率を最大化し、
                # 정적 콘텐츠의 캐시 적중률을 최대화하고,
                # オリジンへのリクエストを削減します。
                # 오리진으로의 요청을 줄입니다.
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                # 圧縮を有効化してレスポンスサイズを削減
                # 압축을 활성화하여 응답 크기를 줄임
                compress=True,
            ),
            # 【Price Class 200】
            # 【Price Class 200】
            # 北米、ヨーロッパ、アジア、中東、アフリカのエッジロケーションを使用。
            # 북미, 유럽, 아시아, 중동, 아프리카의 엣지 로케이션을 사용.
            # Price Class ALLより安価だが、主要地域はカバー。
            # Price Class ALL보다 저렴하지만 주요 지역은 커버.
            # 南米とオセアニアの一部エッジロケーションは含まれない。
            # 남미와 오세아니아의 일부 엣지 로케이션은 포함되지 않음.
            price_class=cloudfront.PriceClass.PRICE_CLASS_200,
            # WAF Web ACLの関連付け
            # WAF Web ACL 연결
            web_acl_id=web_acl.attr_arn,
            # デフォルトルートオブジェクト
            # 기본 루트 객체
            default_root_object="index.html",
            # エラーレスポンス: SPAアプリケーション対応
            # 에러 응답: SPA 애플리케이션 대응
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
