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

AWS Systems Manager (SSM)는 AWS 인프라의 운영 관리를 통합하는 서비스입니다.
이 CDK 애플리케이션에서는 SSM의 3가지 주요 기능을 Stack으로 구현합니다:

1. SSM Inventory (인벤토리 수집) - 인프라 가시화
2. Patch Manager (패치 관리) - 보안 컴플라이언스 자동화
3. Parameter Store (파라미터 스토어) - 설정 정보의 일원 관리

이들을 조합하여 운영 관리의 기반을 구축합니다.
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
# Stack 1: SSM Inventory (인벤토리 수집)
# 인프라 전체에서 "무엇이 있는지"를 파악하는 기반입니다.
# 모든 Managed Instance에서 소프트웨어 정보를 수집하고,
# S3에 집약하여 분석 기반을 구축합니다.
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
# Stack 2: Patch Manager (패치 관리)
# 보안 패치의 자동 적용을 관리합니다.
# Maintenance Window를 사용하여 계획적으로 패치를 적용합니다.
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
# Stack 3: Parameter Store (파라미터 스토어)
# 애플리케이션 설정과 기밀 정보를 안전하게 일원 관리합니다.
# 계층 구조의 명명 규칙과 KMS 암호화를 활용합니다.
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
