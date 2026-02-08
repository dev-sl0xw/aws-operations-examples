"""
Storage & Backup CDK Tests

各スタックが正しいリソースを生成することを検証するテストスイートです。
aws_cdk.assertions.Template を使用して、合成されたCloudFormationテンプレートを
検査します。
"""

import pytest
import aws_cdk as cdk
from aws_cdk import assertions

from storage_backup.s3_lifecycle_stack import S3LifecycleStack
from storage_backup.ebs_snapshots_stack import EbsSnapshotsStack
from storage_backup.backup_automation_stack import BackupAutomationStack


# ====================================================================
# テスト用のヘルパー
# ====================================================================


@pytest.fixture
def app():
    """CDKアプリケーションのフィクスチャ"""
    return cdk.App()


@pytest.fixture
def env():
    """テスト用の環境設定"""
    return cdk.Environment(account="123456789012", region="us-east-1")


# ====================================================================
# S3 Lifecycle Stack Tests
# ====================================================================


class TestS3LifecycleStack:
    """S3ライフサイクルスタックのテスト"""

    def test_s3_bucket_created_with_versioning(self, app, env):
        """S3バケットがバージョニング有効で作成されることを確認"""
        stack = S3LifecycleStack(app, "TestS3LifecycleStack", env=env)
        template = assertions.Template.from_stack(stack)

        # バケットリソースが存在し、バージョニングが有効であることを確認
        template.has_resource_properties(
            "AWS::S3::Bucket",
            {
                "VersioningConfiguration": {"Status": "Enabled"},
            },
        )

    def test_s3_bucket_has_encryption(self, app, env):
        """S3バケットにSSE-S3暗号化が設定されていることを確認"""
        stack = S3LifecycleStack(app, "TestS3LifecycleStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
            "AWS::S3::Bucket",
            {
                "BucketEncryption": {
                    "ServerSideEncryptionConfiguration": [
                        {
                            "ServerSideEncryptionByDefault": {
                                "SSEAlgorithm": "AES256",
                            }
                        }
                    ]
                }
            },
        )

    def test_s3_bucket_blocks_public_access(self, app, env):
        """S3バケットでパブリックアクセスが完全にブロックされていることを確認"""
        stack = S3LifecycleStack(app, "TestS3LifecycleStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
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

    def test_s3_bucket_has_lifecycle_rules(self, app, env):
        """S3バケットにライフサイクルルールが設定されていることを確認"""
        stack = S3LifecycleStack(app, "TestS3LifecycleStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
            "AWS::S3::Bucket",
            {
                "LifecycleConfiguration": {
                    "Rules": assertions.Match.any_value(),
                }
            },
        )

    def test_s3_bucket_policy_exists(self, app, env):
        """バケットポリシーが作成されていることを確認"""
        stack = S3LifecycleStack(app, "TestS3LifecycleStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.resource_count_is("AWS::S3::BucketPolicy", 1)

    def test_outputs_exist(self, app, env):
        """必要なCfnOutputが定義されていることを確認"""
        stack = S3LifecycleStack(app, "TestS3LifecycleStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_output("BucketName", {})
        template.has_output("BucketArn", {})


# ====================================================================
# EBS Snapshots Stack Tests
# ====================================================================


class TestEbsSnapshotsStack:
    """EBSスナップショットスタックのテスト"""

    def test_dlm_policy_created(self, app, env):
        """DLMライフサイクルポリシーが作成されることを確認"""
        stack = EbsSnapshotsStack(app, "TestEbsSnapshotsStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
            "AWS::DLM::LifecyclePolicy",
            {
                "State": "ENABLED",
                "Description": assertions.Match.any_value(),
            },
        )

    def test_dlm_policy_targets_backup_tag(self, app, env):
        """DLMポリシーがBackup=trueタグを持つボリュームを対象としていることを確認"""
        stack = EbsSnapshotsStack(app, "TestEbsSnapshotsStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
            "AWS::DLM::LifecyclePolicy",
            {
                "PolicyDetails": {
                    "ResourceTypes": ["VOLUME"],
                    "TargetTags": [{"Key": "Backup", "Value": "true"}],
                },
            },
        )

    def test_dlm_policy_has_schedule(self, app, env):
        """DLMポリシーにスケジュールが定義されていることを確認"""
        stack = EbsSnapshotsStack(app, "TestEbsSnapshotsStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
            "AWS::DLM::LifecyclePolicy",
            {
                "PolicyDetails": {
                    "Schedules": assertions.Match.any_value(),
                },
            },
        )

    def test_ebs_volume_created(self, app, env):
        """デモ用EBSボリュームが作成されることを確認"""
        stack = EbsSnapshotsStack(app, "TestEbsSnapshotsStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
            "AWS::EC2::Volume",
            {
                "VolumeType": "gp3",
                "Size": 100,
                "Encrypted": True,
            },
        )

    def test_dlm_iam_role_created(self, app, env):
        """DLM用のIAMロールが作成されることを確認"""
        stack = EbsSnapshotsStack(app, "TestEbsSnapshotsStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
            "AWS::IAM::Role",
            {
                "AssumeRolePolicyDocument": {
                    "Statement": [
                        {
                            "Action": "sts:AssumeRole",
                            "Effect": "Allow",
                            "Principal": {"Service": "dlm.amazonaws.com"},
                        }
                    ],
                },
            },
        )

    def test_outputs_exist(self, app, env):
        """必要なCfnOutputが定義されていることを確認"""
        stack = EbsSnapshotsStack(app, "TestEbsSnapshotsStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_output("LifecyclePolicyId", {})
        template.has_output("DemoVolumeId", {})


# ====================================================================
# Backup Automation Stack Tests
# ====================================================================


class TestBackupAutomationStack:
    """AWS Backup自動化スタックのテスト"""

    def test_backup_vault_created(self, app, env):
        """バックアップVaultが作成されることを確認"""
        stack = BackupAutomationStack(app, "TestBackupStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
            "AWS::Backup::BackupVault",
            {
                "BackupVaultName": "storage-backup-vault",
            },
        )

    def test_backup_vault_has_encryption(self, app, env):
        """バックアップVaultにKMS暗号化が設定されていることを確認"""
        stack = BackupAutomationStack(app, "TestBackupStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
            "AWS::Backup::BackupVault",
            {
                "EncryptionKeyArn": assertions.Match.any_value(),
            },
        )

    def test_backup_plan_created(self, app, env):
        """バックアッププランが作成されることを確認"""
        stack = BackupAutomationStack(app, "TestBackupStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.resource_count_is("AWS::Backup::BackupPlan", 1)

    def test_backup_plan_has_two_rules(self, app, env):
        """バックアッププランに2つのルール（日次・月次）が含まれることを確認"""
        stack = BackupAutomationStack(app, "TestBackupStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
            "AWS::Backup::BackupPlan",
            {
                "BackupPlan": {
                    "BackupPlanRule": assertions.Match.array_with(
                        [
                            assertions.Match.object_like(
                                {"RuleName": "DailyBackupRule"}
                            ),
                            assertions.Match.object_like(
                                {"RuleName": "MonthlyBackupRule"}
                            ),
                        ]
                    ),
                },
            },
        )

    def test_backup_selection_created(self, app, env):
        """バックアップセレクションが作成されることを確認"""
        stack = BackupAutomationStack(app, "TestBackupStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.resource_count_is("AWS::Backup::BackupSelection", 1)

    def test_backup_selection_uses_tags(self, app, env):
        """バックアップセレクションがタグベースの選択を使用していることを確認"""
        stack = BackupAutomationStack(app, "TestBackupStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
            "AWS::Backup::BackupSelection",
            {
                "BackupSelection": {
                    "ListOfTags": assertions.Match.array_with(
                        [
                            assertions.Match.object_like(
                                {
                                    "ConditionKey": "BackupPlan",
                                    "ConditionValue": "daily",
                                }
                            ),
                        ]
                    ),
                },
            },
        )

    def test_kms_key_created(self, app, env):
        """KMS暗号化キーが作成されることを確認"""
        stack = BackupAutomationStack(app, "TestBackupStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_resource_properties(
            "AWS::KMS::Key",
            {
                "EnableKeyRotation": True,
            },
        )

    def test_outputs_exist(self, app, env):
        """必要なCfnOutputが定義されていることを確認"""
        stack = BackupAutomationStack(app, "TestBackupStack", env=env)
        template = assertions.Template.from_stack(stack)

        template.has_output("VaultName", {})
        template.has_output("VaultArn", {})
        template.has_output("BackupPlanId", {})
