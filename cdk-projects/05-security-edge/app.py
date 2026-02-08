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
acm_stack = AcmCertificatesStack(
    app,
    "AcmCertificatesStack",
    env=cdk.Environment(region="us-east-1"),
    description="ACM certificate management for TLS/HTTPS encryption",
)

app.synth()
