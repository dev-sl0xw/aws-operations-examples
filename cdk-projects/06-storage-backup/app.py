#!/usr/bin/env python3
"""
Storage & Backup CDK Application

ストレージとバックアップに関する3つのスタックを定義するエントリーポイントです:
1. S3LifecycleStack: S3バケットのライフサイクル管理（階層化ストレージ、暗号化、バージョニング）
2. EbsSnapshotsStack: EBSスナップショットの自動化（DLMによる日次スナップショット）
3. BackupAutomationStack: AWS Backupによる一元的バックアップ管理（日次・月次ルール）

스토리지와 백업에 관한 3개의 스택을 정의하는 엔트리 포인트입니다:
1. S3LifecycleStack: S3 버킷의 라이프사이클 관리 (계층형 스토리지, 암호화, 버전 관리)
2. EbsSnapshotsStack: EBS 스냅샷 자동화 (DLM을 통한 일일 스냅샷)
3. BackupAutomationStack: AWS Backup을 통한 중앙 집중식 백업 관리 (일일/월간 규칙)
"""

import os

import aws_cdk as cdk

from storage_backup.s3_lifecycle_stack import S3LifecycleStack
from storage_backup.ebs_snapshots_stack import EbsSnapshotsStack
from storage_backup.backup_automation_stack import BackupAutomationStack


app = cdk.App()

# デプロイ先の環境設定
# 実際の運用では、環境変数やcdk.jsonのcontextから取得することを推奨
# 배포 대상 환경 설정
# 실제 운영에서는 환경 변수나 cdk.json의 context에서 가져오는 것을 권장
env = cdk.Environment(
    account=os.environ.get("CDK_DEFAULT_ACCOUNT", "123456789012"),
    region=os.environ.get("CDK_DEFAULT_REGION", "us-east-1"),
)

# DRリージョン（クロスリージョンコピー先）
# DR 리전 (크로스 리전 복사 대상)
dr_region = "us-west-2"

# --- Stack 1: S3ライフサイクル管理 ---
# S3バケットのバージョニング、ストレージクラスの自動階層化、
# 暗号化の強制、パブリックアクセスのブロックを設定
# --- Stack 1: S3 라이프사이클 관리 ---
# S3 버킷의 버전 관리, 스토리지 클래스 자동 계층화,
# 암호화 강제, 퍼블릭 액세스 차단을 설정
S3LifecycleStack(
    app,
    "S3LifecycleStack",
    env=env,
)

# --- Stack 2: EBSスナップショット自動化 ---
# DLMを使用した日次スナップショットの自動取得と
# DRリージョンへのクロスリージョンコピーを設定
# --- Stack 2: EBS 스냅샷 자동화 ---
# DLM을 사용한 일일 스냅샷 자동 생성과
# DR 리전으로의 크로스 리전 복사를 설정
EbsSnapshotsStack(
    app,
    "EbsSnapshotsStack",
    dr_region=dr_region,
    env=env,
)

# --- Stack 3: AWS Backup自動化 ---
# 一元的なバックアップ管理（日次・月次ルール）と
# KMS暗号化されたVaultでのバックアップ保管を設定
# --- Stack 3: AWS Backup 자동화 ---
# 중앙 집중식 백업 관리 (일일/월간 규칙)와
# KMS 암호화된 Vault에서의 백업 보관을 설정
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
