#!/usr/bin/env python3
"""
SSM Operations CDK Application
==============================

AWS Systems Manager (SSM) は、AWSインフラストラクチャの運用管理を統合するサービスです。
このCDKアプリケーションでは、SSMの3つの主要機能をスタックとして実装します：

1. SSM Inventory (インベントリ収集) - インフラの可視化
2. Patch Manager (パッチ管理) - セキュリティコンプライアンスの自動化
3. Parameter Store (パラメータストア) - 設定情報の一元管理

これらを組み合わせることで、運用管理の基盤を構築します。
"""

import aws_cdk as cdk

from ssm_operations.ssm_inventory_stack import SsmInventoryStack
from ssm_operations.patch_manager_stack import PatchManagerStack
from ssm_operations.parameter_store_stack import ParameterStoreStack

app = cdk.App()

# ============================================================================
# スタック1: SSM Inventory（インベントリ収集）
# インフラ全体の「何があるか」を把握する基盤です。
# 全てのマネージドインスタンスからソフトウェア情報を収集し、
# S3に集約することで分析基盤を構築します。
# ============================================================================
inventory_stack = SsmInventoryStack(
    app,
    "SsmInventoryStack",
    description="SSM Inventory collection and Resource Data Sync to S3",
)

# ============================================================================
# スタック2: Patch Manager（パッチ管理）
# セキュリティパッチの自動適用を管理します。
# メンテナンスウィンドウを使って、計画的にパッチを適用します。
# ============================================================================
patch_manager_stack = PatchManagerStack(
    app,
    "PatchManagerStack",
    description="SSM Patch Manager with maintenance windows and custom baselines",
)

# ============================================================================
# スタック3: Parameter Store（パラメータストア）
# アプリケーション設定や機密情報を安全に一元管理します。
# 階層構造の命名規則とKMS暗号化を活用します。
# ============================================================================
parameter_store_stack = ParameterStoreStack(
    app,
    "ParameterStoreStack",
    description="SSM Parameter Store with hierarchical parameters and KMS encryption",
)

cdk.Tags.of(app).add("Environment", "Learning")
cdk.Tags.of(app).add("Project", "SsmOperations")
cdk.Tags.of(app).add("ManagedBy", "CDK")

app.synth()
