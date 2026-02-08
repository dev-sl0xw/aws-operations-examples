"""
SSM Operations テストスイート
==============================

CDK アプリケーションのインフラストラクチャテストです。
aws_cdk.assertions を使用して、合成された CloudFormation テンプレートを
検証します。

テストの目的：
- 各スタックが正しく合成されることを確認
- 期待されるリソースが作成されることを確認
- セキュリティ設定（暗号化、アクセス制御等）が正しく適用されていることを確認
"""

import pytest
import aws_cdk as cdk
from aws_cdk.assertions import Template

from ssm_operations.ssm_inventory_stack import SsmInventoryStack
from ssm_operations.patch_manager_stack import PatchManagerStack
from ssm_operations.parameter_store_stack import ParameterStoreStack


# =============================================================================
# SsmInventoryStack のテスト
# =============================================================================
class TestSsmInventoryStack:
    """SSM Inventory Stack のテスト"""

    @pytest.fixture(autouse=True)
    def setup(self):
        app = cdk.App()
        stack = SsmInventoryStack(app, "TestSsmInventoryStack")
        self.template = Template.from_stack(stack)

    def test_creates_s3_bucket_for_inventory_data(self):
        """インベントリデータ保存用の S3 バケットが作成されること"""
        self.template.resource_count_is("AWS::S3::Bucket", 1)

    def test_s3_bucket_has_encryption_enabled(self):
        """S3 バケットにサーバーサイド暗号化が設定されていること"""
        self.template.has_resource_properties(
            "AWS::S3::Bucket",
            {
                "BucketEncryption": {
                    "ServerSideEncryptionConfiguration": [
                        {
                            "ServerSideEncryptionByDefault": {
                                "SSEAlgorithm": "aws:kms",
                            }
                        }
                    ]
                }
            },
        )

    def test_s3_bucket_blocks_public_access(self):
        """S3 バケットでパブリックアクセスが完全にブロックされていること"""
        self.template.has_resource_properties(
            "AWS::S3::Bucket",
            {
                "PublicAccessBlockConfiguration": {
                    "BlockPublicAcls": True,
                    "BlockPublicPolicy": True,
                    "IgnorePublicAcls": True,
                    "RestrictPublicBuckets": True,
                }
            },
        )

    def test_creates_ssm_association(self):
        """SSM Association（インベントリ収集設定）が作成されること"""
        self.template.has_resource_properties(
            "AWS::SSM::Association",
            {
                "Name": "AWS-GatherSoftwareInventory",
                "AssociationName": "GatherSoftwareInventory",
                "ScheduleExpression": "rate(1 day)",
            },
        )

    def test_ssm_association_targets_all_instances(self):
        """SSM Association が全マネージドインスタンスを対象にしていること"""
        self.template.has_resource_properties(
            "AWS::SSM::Association",
            {
                "Targets": [
                    {
                        "Key": "InstanceIds",
                        "Values": ["*"],
                    }
                ],
            },
        )

    def test_creates_resource_data_sync(self):
        """Resource Data Sync が作成されること"""
        self.template.has_resource_properties(
            "AWS::SSM::ResourceDataSync",
            {
                "SyncName": "InventoryToS3Sync",
            },
        )

    def test_has_expected_outputs(self):
        """期待される CfnOutput が存在すること"""
        self.template.has_output("InventoryBucketName", {})
        self.template.has_output("InventoryBucketArn", {})
        self.template.has_output("ResourceDataSyncName", {})


# =============================================================================
# PatchManagerStack のテスト
# =============================================================================
class TestPatchManagerStack:
    """Patch Manager Stack のテスト"""

    @pytest.fixture(autouse=True)
    def setup(self):
        app = cdk.App()
        stack = PatchManagerStack(app, "TestPatchManagerStack")
        self.template = Template.from_stack(stack)

    def test_creates_linux_patch_baseline(self):
        """Amazon Linux 2 用のパッチベースラインが作成されること"""
        self.template.has_resource_properties(
            "AWS::SSM::PatchBaseline",
            {
                "Name": "CustomAmazonLinux2Baseline",
                "OperatingSystem": "AMAZON_LINUX_2",
            },
        )

    def test_creates_windows_patch_baseline(self):
        """Windows Server 用のパッチベースラインが作成されること"""
        self.template.has_resource_properties(
            "AWS::SSM::PatchBaseline",
            {
                "Name": "CustomWindowsBaseline",
                "OperatingSystem": "WINDOWS",
            },
        )

    def test_creates_maintenance_window(self):
        """メンテナンスウィンドウが正しい設定で作成されること"""
        self.template.has_resource_properties(
            "AWS::SSM::MaintenanceWindow",
            {
                "Name": "ProductionPatchWindow",
                "Schedule": "cron(0 2 ? * SAT *)",
                "Duration": 3,
                "Cutoff": 1,
            },
        )

    def test_creates_maintenance_window_target(self):
        """メンテナンスウィンドウターゲットが PatchGroup タグで設定されていること"""
        self.template.has_resource_properties(
            "AWS::SSM::MaintenanceWindowTarget",
            {
                "ResourceType": "INSTANCE",
                "Targets": [
                    {
                        "Key": "tag:PatchGroup",
                        "Values": ["production"],
                    }
                ],
            },
        )

    def test_creates_maintenance_window_task(self):
        """メンテナンスウィンドウタスクが AWS-RunPatchBaseline を使用すること"""
        self.template.has_resource_properties(
            "AWS::SSM::MaintenanceWindowTask",
            {
                "TaskArn": "AWS-RunPatchBaseline",
                "TaskType": "RUN_COMMAND",
                "Priority": 1,
                "MaxConcurrency": "25%",
                "MaxErrors": "25%",
            },
        )

    def test_patch_baselines_have_rejected_patches(self):
        """パッチベースラインに拒否パッチリストが設定されていること"""
        # Linux baseline
        self.template.has_resource_properties(
            "AWS::SSM::PatchBaseline",
            {
                "Name": "CustomAmazonLinux2Baseline",
                "RejectedPatches": ["CVE-2099-99999"],
                "RejectedPatchesAction": "BLOCK",
            },
        )
        # Windows baseline
        self.template.has_resource_properties(
            "AWS::SSM::PatchBaseline",
            {
                "Name": "CustomWindowsBaseline",
                "RejectedPatches": ["KB5001234"],
                "RejectedPatchesAction": "BLOCK",
            },
        )

    def test_has_expected_outputs(self):
        """期待される CfnOutput が存在すること"""
        self.template.has_output("LinuxPatchBaselineId", {})
        self.template.has_output("WindowsPatchBaselineId", {})
        self.template.has_output("MaintenanceWindowId", {})
        self.template.has_output("MaintenanceWindowTaskId", {})


# =============================================================================
# ParameterStoreStack のテスト
# =============================================================================
class TestParameterStoreStack:
    """Parameter Store Stack のテスト"""

    @pytest.fixture(autouse=True)
    def setup(self):
        app = cdk.App()
        stack = ParameterStoreStack(app, "TestParameterStoreStack")
        self.template = Template.from_stack(stack)

    def test_creates_kms_key(self):
        """SecureString 暗号化用の KMS キーが作成されること"""
        self.template.has_resource_properties(
            "AWS::KMS::Key",
            {
                "EnableKeyRotation": True,
                "Description": "KMS key for encrypting SSM SecureString parameters",
            },
        )

    def test_creates_kms_key_alias(self):
        """KMS キーにエイリアスが設定されていること"""
        self.template.has_resource_properties(
            "AWS::KMS::Alias",
            {
                "AliasName": "alias/ssm-parameter-encryption-key",
            },
        )

    def test_creates_production_db_host_parameter(self):
        """本番環境のデータベースホスト名パラメータが作成されること"""
        self.template.has_resource_properties(
            "AWS::SSM::Parameter",
            {
                "Name": "/app/production/database/host",
                "Type": "String",
            },
        )

    def test_creates_production_db_port_parameter(self):
        """本番環境のデータベースポート番号パラメータが作成されること"""
        self.template.has_resource_properties(
            "AWS::SSM::Parameter",
            {
                "Name": "/app/production/database/port",
                "Type": "String",
                "Value": "5432",
            },
        )

    def test_creates_production_db_name_parameter(self):
        """本番環境のデータベース名パラメータが作成されること"""
        self.template.has_resource_properties(
            "AWS::SSM::Parameter",
            {
                "Name": "/app/production/database/name",
                "Type": "String",
                "Value": "myapp_production",
            },
        )

    def test_creates_secure_string_parameter_for_password(self):
        """パスワード用の SecureString パラメータが KMS 暗号化で作成されること"""
        self.template.has_resource_properties(
            "AWS::SSM::Parameter",
            {
                "Name": "/app/production/database/password",
                "Type": "SecureString",
            },
        )

    def test_creates_staging_db_host_parameter(self):
        """ステージング環境のデータベースホスト名パラメータが作成されること"""
        self.template.has_resource_properties(
            "AWS::SSM::Parameter",
            {
                "Name": "/app/staging/database/host",
                "Type": "String",
            },
        )

    def test_creates_ssm_document(self):
        """カスタム SSM ドキュメントが作成されること"""
        self.template.has_resource_properties(
            "AWS::SSM::Document",
            {
                "Name": "CustomReadParameter",
                "DocumentType": "Command",
                "DocumentFormat": "JSON",
            },
        )

    def test_has_expected_outputs(self):
        """期待される CfnOutput が存在すること"""
        self.template.has_output("KmsKeyArn", {})
        self.template.has_output("KmsKeyId", {})
        self.template.has_output("ProductionDbParameterPath", {})
        self.template.has_output("StagingDbParameterPath", {})
        self.template.has_output("CustomDocumentName", {})
