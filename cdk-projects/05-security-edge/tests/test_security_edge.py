"""
Tests for Security & Edge Services CDK Stacks
==============================================

These tests use CDK assertions to verify that the synthesized CloudFormation
templates contain the expected resources and configurations.
"""

import pytest
import aws_cdk as cdk
from aws_cdk import assertions

from security_edge.detective_controls_stack import DetectiveControlsStack
from security_edge.cloudfront_waf_stack import CloudFrontWafStack
from security_edge.acm_certificates_stack import AcmCertificatesStack


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def app():
    """Create a CDK app for testing."""
    return cdk.App()


@pytest.fixture
def detective_template(app):
    """Synthesize the DetectiveControlsStack and return its template."""
    stack = DetectiveControlsStack(app, "TestDetectiveControlsStack")
    return assertions.Template.from_stack(stack)


@pytest.fixture
def cloudfront_waf_template(app):
    """Synthesize the CloudFrontWafStack and return its template."""
    stack = CloudFrontWafStack(
        app,
        "TestCloudFrontWafStack",
        env=cdk.Environment(region="us-east-1"),
    )
    return assertions.Template.from_stack(stack)


@pytest.fixture
def acm_template(app):
    """Synthesize the AcmCertificatesStack and return its template."""
    stack = AcmCertificatesStack(
        app,
        "TestAcmCertificatesStack",
        env=cdk.Environment(region="us-east-1"),
    )
    return assertions.Template.from_stack(stack)


# ============================================================================
# Detective Controls Stack Tests
# ============================================================================


class TestDetectiveControlsStack:
    """Tests for the DetectiveControlsStack."""

    def test_cloudtrail_trail_created(self, detective_template):
        """Verify that a CloudTrail trail is created with correct configuration."""
        detective_template.resource_count_is("AWS::CloudTrail::Trail", 1)

    def test_cloudtrail_has_file_validation(self, detective_template):
        """Verify CloudTrail has log file validation enabled (SHA-256 hash chain)."""
        detective_template.has_resource_properties(
            "AWS::CloudTrail::Trail",
            {
                "EnableLogFileValidation": True,
            },
        )

    def test_cloudtrail_is_multi_region(self, detective_template):
        """Verify CloudTrail is a multi-region trail."""
        detective_template.has_resource_properties(
            "AWS::CloudTrail::Trail",
            {
                "IsMultiRegionTrail": True,
            },
        )

    def test_cloudtrail_is_logging(self, detective_template):
        """Verify CloudTrail logging is enabled."""
        detective_template.has_resource_properties(
            "AWS::CloudTrail::Trail",
            {
                "IsLogging": True,
            },
        )

    def test_guardduty_detector_created(self, detective_template):
        """Verify that a GuardDuty detector is created and enabled."""
        detective_template.resource_count_is("AWS::GuardDuty::Detector", 1)
        detective_template.has_resource_properties(
            "AWS::GuardDuty::Detector",
            {
                "Enable": True,
            },
        )

    def test_guardduty_finding_frequency(self, detective_template):
        """Verify GuardDuty publishes findings at 15-minute intervals."""
        detective_template.has_resource_properties(
            "AWS::GuardDuty::Detector",
            {
                "FindingPublishingFrequency": "FIFTEEN_MINUTES",
            },
        )

    def test_sns_topic_created(self, detective_template):
        """Verify SNS topic for security alerts is created."""
        detective_template.resource_count_is("AWS::SNS::Topic", 1)
        detective_template.has_resource_properties(
            "AWS::SNS::Topic",
            {
                "TopicName": "security-alerts",
            },
        )

    def test_eventbridge_rule_created(self, detective_template):
        """Verify EventBridge rule for GuardDuty high severity findings exists."""
        detective_template.resource_count_is("AWS::Events::Rule", 1)
        detective_template.has_resource_properties(
            "AWS::Events::Rule",
            {
                "EventPattern": {
                    "source": ["aws.guardduty"],
                    "detail-type": ["GuardDuty Finding"],
                },
            },
        )

    def test_cloudtrail_log_bucket_created(self, detective_template):
        """Verify S3 bucket for CloudTrail logs is created with encryption."""
        detective_template.has_resource_properties(
            "AWS::S3::Bucket",
            {
                "VersioningConfiguration": {"Status": "Enabled"},
                "PublicAccessBlockConfiguration": {
                    "BlockPublicAcls": True,
                    "BlockPublicPolicy": True,
                    "IgnorePublicAcls": True,
                    "RestrictPublicBuckets": True,
                },
            },
        )

    def test_cloudwatch_log_group_created(self, detective_template):
        """Verify CloudWatch Logs group for CloudTrail is created."""
        detective_template.has_resource_properties(
            "AWS::Logs::LogGroup",
            {
                "LogGroupName": "/aws/cloudtrail/management-events",
            },
        )

    def test_outputs_present(self, detective_template):
        """Verify all expected CfnOutputs are present."""
        detective_template.has_output(
            "TrailArn",
            {"Export": {"Name": "DetectiveControls-TrailArn"}},
        )
        detective_template.has_output(
            "DetectorId",
            {"Export": {"Name": "DetectiveControls-DetectorId"}},
        )
        detective_template.has_output(
            "SecurityTopicArn",
            {"Export": {"Name": "DetectiveControls-SecurityTopicArn"}},
        )


# ============================================================================
# CloudFront + WAF Stack Tests
# ============================================================================


class TestCloudFrontWafStack:
    """Tests for the CloudFrontWafStack."""

    def test_cloudfront_distribution_created(self, cloudfront_waf_template):
        """Verify CloudFront distribution is created."""
        cloudfront_waf_template.resource_count_is(
            "AWS::CloudFront::Distribution", 1
        )

    def test_cloudfront_viewer_protocol_policy(self, cloudfront_waf_template):
        """Verify CloudFront redirects HTTP to HTTPS."""
        cloudfront_waf_template.has_resource_properties(
            "AWS::CloudFront::Distribution",
            {
                "DistributionConfig": {
                    "DefaultCacheBehavior": {
                        "ViewerProtocolPolicy": "redirect-to-https",
                    },
                },
            },
        )

    def test_cloudfront_default_root_object(self, cloudfront_waf_template):
        """Verify CloudFront has a default root object."""
        cloudfront_waf_template.has_resource_properties(
            "AWS::CloudFront::Distribution",
            {
                "DistributionConfig": {
                    "DefaultRootObject": "index.html",
                },
            },
        )

    def test_waf_web_acl_created(self, cloudfront_waf_template):
        """Verify WAF Web ACL is created with CLOUDFRONT scope."""
        cloudfront_waf_template.resource_count_is("AWS::WAFv2::WebACL", 1)
        cloudfront_waf_template.has_resource_properties(
            "AWS::WAFv2::WebACL",
            {
                "Scope": "CLOUDFRONT",
            },
        )

    def test_waf_default_action_allow(self, cloudfront_waf_template):
        """Verify WAF default action is Allow."""
        cloudfront_waf_template.has_resource_properties(
            "AWS::WAFv2::WebACL",
            {
                "DefaultAction": {"Allow": {}},
            },
        )

    def test_waf_has_four_rules(self, cloudfront_waf_template):
        """Verify WAF Web ACL has 4 rules (rate limit + 3 managed rule groups)."""
        cloudfront_waf_template.has_resource_properties(
            "AWS::WAFv2::WebACL",
            assertions.Match.object_like(
                {
                    "Rules": assertions.Match.array_with(
                        [
                            assertions.Match.object_like(
                                {"Name": "RateLimitRule", "Priority": 0}
                            ),
                            assertions.Match.object_like(
                                {
                                    "Name": "AWSManagedRulesCommonRuleSet",
                                    "Priority": 1,
                                }
                            ),
                            assertions.Match.object_like(
                                {
                                    "Name": "AWSManagedRulesSQLiRuleSet",
                                    "Priority": 2,
                                }
                            ),
                            assertions.Match.object_like(
                                {
                                    "Name": "AWSManagedRulesKnownBadInputsRuleSet",
                                    "Priority": 3,
                                }
                            ),
                        ]
                    ),
                }
            ),
        )

    def test_waf_rate_limit_value(self, cloudfront_waf_template):
        """Verify rate limit is set to 2000 requests per 5 minutes."""
        cloudfront_waf_template.has_resource_properties(
            "AWS::WAFv2::WebACL",
            assertions.Match.object_like(
                {
                    "Rules": assertions.Match.array_with(
                        [
                            assertions.Match.object_like(
                                {
                                    "Name": "RateLimitRule",
                                    "Statement": {
                                        "RateBasedStatement": {
                                            "Limit": 2000,
                                            "AggregateKeyType": "IP",
                                        },
                                    },
                                }
                            ),
                        ]
                    ),
                }
            ),
        )

    def test_s3_origin_bucket_created(self, cloudfront_waf_template):
        """Verify S3 origin bucket is created with public access blocked."""
        cloudfront_waf_template.has_resource_properties(
            "AWS::S3::Bucket",
            {
                "PublicAccessBlockConfiguration": {
                    "BlockPublicAcls": True,
                    "BlockPublicPolicy": True,
                    "IgnorePublicAcls": True,
                    "RestrictPublicBuckets": True,
                },
            },
        )

    def test_origin_access_control_created(self, cloudfront_waf_template):
        """Verify OAC is created for secure S3 access."""
        cloudfront_waf_template.resource_count_is(
            "AWS::CloudFront::OriginAccessControl", 1
        )

    def test_outputs_present(self, cloudfront_waf_template):
        """Verify all expected CfnOutputs are present."""
        cloudfront_waf_template.has_output(
            "DistributionDomainName",
            {"Export": {"Name": "CloudFrontWaf-DistributionDomainName"}},
        )
        cloudfront_waf_template.has_output(
            "WebAclArn",
            {"Export": {"Name": "CloudFrontWaf-WebAclArn"}},
        )


# ============================================================================
# ACM Certificates Stack Tests
# ============================================================================


class TestAcmCertificatesStack:
    """Tests for the AcmCertificatesStack."""

    def test_certificate_created(self, acm_template):
        """Verify ACM certificate is created."""
        acm_template.resource_count_is(
            "AWS::CertificateManager::Certificate", 1
        )

    def test_certificate_domain_name(self, acm_template):
        """Verify certificate has the correct domain name."""
        acm_template.has_resource_properties(
            "AWS::CertificateManager::Certificate",
            {
                "DomainName": "example.com",
            },
        )

    def test_certificate_sans(self, acm_template):
        """Verify certificate has wildcard SAN."""
        acm_template.has_resource_properties(
            "AWS::CertificateManager::Certificate",
            {
                "SubjectAlternativeNames": ["*.example.com"],
            },
        )

    def test_certificate_dns_validation(self, acm_template):
        """Verify certificate uses DNS validation."""
        acm_template.has_resource_properties(
            "AWS::CertificateManager::Certificate",
            {
                "ValidationMethod": "DNS",
            },
        )

    def test_output_present(self, acm_template):
        """Verify certificate ARN output is present."""
        acm_template.has_output(
            "CertificateArn",
            {"Export": {"Name": "AcmCertificates-CertificateArn"}},
        )
