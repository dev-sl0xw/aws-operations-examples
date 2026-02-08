#!/usr/bin/env python3
"""
Security & Edge Services CDK Application
=========================================

セキュリティとエッジサービスのCDKアプリケーション

This application deploys three stacks that together provide a comprehensive
security and content delivery architecture on AWS:

1. DetectiveControlsStack - CloudTrail, GuardDuty, and automated alerting
2. CloudFrontWafStack     - CloudFront CDN with WAF protection
3. AcmCertificatesStack   - TLS certificate management with ACM

보안 및 Edge 서비스 CDK 애플리케이션

이 애플리케이션은 AWS에서 포괄적인 보안 및 콘텐츠 전송 아키텍처를 제공하는
3개의 스택을 배포합니다:

1. DetectiveControlsStack - CloudTrail, GuardDuty, 자동 알림
2. CloudFrontWafStack     - WAF 보호 기능이 있는 CloudFront CDN
3. AcmCertificatesStack   - ACM을 이용한 TLS 인증서 관리
"""

import aws_cdk as cdk

from security_edge.detective_controls_stack import DetectiveControlsStack
from security_edge.cloudfront_waf_stack import CloudFrontWafStack
from security_edge.acm_certificates_stack import AcmCertificatesStack

app = cdk.App()

# ============================================================================
# Stack 1: Detective Controls (発見的統制)
# ============================================================================
# CloudTrail and GuardDuty form the foundation of AWS security monitoring.
# Deploy this stack first -- without visibility, you cannot detect threats.

# ============================================================================
# Stack 1: Detective Controls (탐지 통제)
# ============================================================================
# CloudTrail과 GuardDuty는 AWS 보안 모니터링의 기반을 형성합니다.
# 이 스택을 먼저 배포하세요 -- 가시성이 없으면 위협을 탐지할 수 없습니다.
detective_stack = DetectiveControlsStack(
    app,
    "DetectiveControlsStack",
    description="Detective controls: CloudTrail audit logging, GuardDuty threat detection, and automated security alerting",
)

# ============================================================================
# Stack 2: CloudFront + WAF (コンテンツ配信 + Webアプリケーションファイアウォール)
# ============================================================================
# NOTE: WAF for CloudFront must be deployed in us-east-1.
# If your default region differs, set env explicitly.

# ============================================================================
# Stack 2: CloudFront + WAF (콘텐츠 전송 + Web Application Firewall)
# ============================================================================
# 참고: CloudFront용 WAF는 us-east-1에 배포해야 합니다.
# 기본 리전이 다른 경우 env를 명시적으로 설정하세요.
cloudfront_waf_stack = CloudFrontWafStack(
    app,
    "CloudFrontWafStack",
    env=cdk.Environment(region="us-east-1"),
    description="CloudFront distribution with WAF Web ACL for content delivery and edge security",
)

# ============================================================================
# Stack 3: ACM Certificates (TLS証明書管理)
# ============================================================================
# ACM certificates for CloudFront must also be in us-east-1.

# ============================================================================
# Stack 3: ACM Certificates (TLS 인증서 관리)
# ============================================================================
# CloudFront용 ACM 인증서도 us-east-1에 있어야 합니다.
acm_stack = AcmCertificatesStack(
    app,
    "AcmCertificatesStack",
    env=cdk.Environment(region="us-east-1"),
    description="ACM certificate management for TLS/HTTPS encryption",
)

cdk.Tags.of(app).add("Environment", "Learning")
cdk.Tags.of(app).add("Project", "SecurityEdge")
cdk.Tags.of(app).add("ManagedBy", "CDK")

app.synth()
