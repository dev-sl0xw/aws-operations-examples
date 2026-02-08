"""
ACM Certificates Stack (TLS証明書管理スタック)
==============================================

このスタックは、AWS Certificate Manager (ACM) を使用して
TLS/SSL証明書を管理します。

【なぜHTTPSが必須なのか（通信中データの暗号化）】
HTTP通信は暗号化されていないため、以下のリスクがあります：
1. 盗聴（Eavesdropping）: ネットワーク上のデータが第三者に読まれる
2. 改ざん（Tampering）: 通信内容が途中で書き換えられる
3. なりすまし（Impersonation）: 偽サイトにユーザーが誘導される

HTTPS (TLS) はこれらの脅威を暗号化・デジタル署名で防止します。
また、最新のブラウザはHTTPサイトに「安全でない」と警告を表示するため、
ユーザー信頼の観点からもHTTPSは必須です。

【ACM証明書のCloudFront制約】
CloudFrontで使用するACM証明書はus-east-1にデプロイする必要があります。
これはCloudFrontの設定管理がus-east-1で行われるためです。
ALB等のリージョナルサービスでは、そのリソースと同じリージョンの
ACM証明書を使用します。
"""

from constructs import Construct
import aws_cdk as cdk
from aws_cdk import (
    Stack,
    CfnOutput,
    aws_certificatemanager as acm,
)


class AcmCertificatesStack(Stack):
    """
    ACM証明書管理スタック

    【構成要素】
    1. ACM証明書 - example.com + *.example.com のワイルドカード証明書

    【注意事項】
    - DNS検証を使用する場合、証明書発行にはDNSレコードの作成が必要です
    - CDKでRoute 53ホストゾーンを管理している場合、DnsValidatedCertificate
      を使用すると自動検証が可能です
    - このスタックはプレースホルダーとしてexample.comを使用しています
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ====================================================================
        # ACM Certificate: TLS/SSL証明書
        # ====================================================================
        # 【DNS検証 vs メール検証のトレードオフ】
        #
        # DNS検証（推奨）:
        #   利点:
        #     - 自動更新が可能（DNSレコードが存在する限り、ACMが自動更新）
        #     - Route 53との統合でCDKから自動設定可能
        #     - 人手の介入が不要
        #   欠点:
        #     - DNSゾーンへのアクセス権が必要
        #     - 初回設定時にDNSレコードの作成が必要
        #
        # メール検証:
        #   利点:
        #     - DNSへのアクセス権が不要
        #     - 設定が簡単（メールのリンクをクリックするだけ）
        #   欠点:
        #     - 自動更新ができない（更新の度にメール承認が必要）
        #     - 承認メールを受信できる管理者が必要
        #     - 人手の介入が必要なため、更新忘れのリスクがある
        #
        # 【ACMの自動更新の利点】
        # DNS検証を使用したACM証明書は、有効期限の60日前に自動更新されます。
        # これにより：
        # - 証明書の有効期限切れによるサービス停止を防止
        # - 手動更新の運用負荷を削減
        # - セキュリティのベストプラクティス（短い有効期間）を自動で維持
        certificate = acm.Certificate(
            self,
            "SiteCertificate",
            # メインドメイン
            domain_name="example.com",
            # Subject Alternative Names (SANs)
            # ワイルドカード証明書でサブドメインもカバー
            # 例: www.example.com, api.example.com, admin.example.com
            subject_alternative_names=["*.example.com"],
            # DNS検証を使用（自動更新のため推奨）
            validation=acm.CertificateValidation.from_dns(),
            # 証明書の説明（タグとして設定される）
            certificate_name="example-com-certificate",
        )

        # 【重要: 実際のデプロイにおける注意事項】
        # この証明書はDNS検証を使用しているため、デプロイ後に
        # ACMコンソールに表示されるCNAMEレコードをDNSに追加する必要があります。
        #
        # Route 53を使用している場合の自動化:
        #   certificate = acm.Certificate(
        #       self, "SiteCertificate",
        #       domain_name="example.com",
        #       subject_alternative_names=["*.example.com"],
        #       validation=acm.CertificateValidation.from_dns(hosted_zone),
        #   )
        #
        # hosted_zoneはRoute 53のHostedZoneオブジェクトです。
        # これにより、CDKが自動的にDNS検証レコードを作成します。

        # ====================================================================
        # Outputs
        # ====================================================================
        CfnOutput(
            self,
            "CertificateArn",
            value=certificate.certificate_arn,
            description="ACM certificate ARN for TLS/HTTPS",
            export_name="AcmCertificates-CertificateArn",
        )
