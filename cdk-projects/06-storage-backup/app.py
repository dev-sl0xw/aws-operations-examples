#!/usr/bin/env python3
"""
Storage & Backup CDK Application

ストレージとバックアップに関する3つのスタックを定義するエントリーポイントです:
1. S3LifecycleStack: S3バケットのライフサイクル管理（階層化ストレージ、暗号化、バージョニング）
2. EbsSnapshotsStack: EBSスナップショットの自動化（DLMによる日次スナップショット）
3. BackupAutomationStack: AWS Backupによる一元的バックアップ管理（日次・月次ルール）
"""

import os

import aws_cdk as cdk

from storage_backup.s3_lifecycle_stack import S3LifecycleStack
from storage_backup.ebs_snapshots_stack import EbsSnapshotsStack
from storage_backup.backup_automation_stack import BackupAutomationStack


app = cdk.App()

# デプロイ先の環境設定
# 実際の運用では、環境変数やcdk.jsonのcontextから取得することを推奨
env = cdk.Environment(
    account=os.environ.get("CDK_DEFAULT_ACCOUNT", "123456789012"),
    region=os.environ.get("CDK_DEFAULT_REGION", "us-east-1"),
)

# DRリージョン（クロスリージョンコピー先）
dr_region = "us-west-2"

# --- Stack 1: S3ライフサイクル管理 ---
# S3バケットのバージョニング、ストレージクラスの自動階層化、
# 暗号化の強制、パブリックアクセスのブロックを設定
S3LifecycleStack(
    app,
    "S3LifecycleStack",
    env=env,
)

# --- Stack 2: EBSスナップショット自動化 ---
# DLMを使用した日次スナップショットの自動取得と
# DRリージョンへのクロスリージョンコピーを設定
EbsSnapshotsStack(
    app,
    "EbsSnapshotsStack",
    dr_region=dr_region,
    env=env,
)

# --- Stack 3: AWS Backup自動化 ---
# 一元的なバックアップ管理（日次・月次ルール）と
# KMS暗号化されたVaultでのバックアップ保管を設定
BackupAutomationStack(
    app,
    "BackupAutomationStack",
    dr_region=dr_region,
    env=env,
)

cdk.Tags.of(app).add("Environment", "Learning")
cdk.Tags.of(app).add("Project", "StorageBackup")
cdk.Tags.of(app).add("ManagedBy", "CDK")

app.synth()
