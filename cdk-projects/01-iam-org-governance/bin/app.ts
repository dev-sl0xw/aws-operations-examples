#!/usr/bin/env node

/**
 * =============================================================================
 * IAM・Organizations・Config ガバナンス CDK アプリケーション
 * =============================================================================
 *
 * このアプリケーションは、AWSアカウントのセキュリティガバナンスを構成する
 * 3つのスタックをデプロイします：
 *
 * 1. IamRolesStack     - IAMロール、ポリシー、権限境界の定義
 * 2. OrgScpStack       - Organizations SCPポリシーの定義（合成のみ）
 * 3. ConfigRulesStack  - AWS Config ルールによる継続的コンプライアンス監視
 *
 * なぜこの3つを組み合わせるのか？
 * - IAM: 「誰が何をできるか」を制御する（認証・認可）
 * - SCP: 「組織全体で何を禁止するか」のガードレール
 * - Config: 「実際の状態が期待通りか」を継続的に検証する
 *
 * この3層防御により、予防的制御と発見的制御の両方を実現します。
 */

import * as cdk from 'aws-cdk-lib';
import { IamRolesStack } from '../lib/iam-roles-stack';
import { OrgScpStack } from '../lib/org-scp-stack';
import { ConfigRulesStack } from '../lib/config-rules-stack';

const app = new cdk.App();

/**
 * 共有環境設定
 *
 * なぜ環境を明示的に指定するのか？
 * - リージョンを固定することで、意図しないリージョンへのデプロイを防止
 * - アカウントIDを指定することで、誤ったアカウントへのデプロイを防止
 * - IAMとOrganizationsのリソースはグローバルだが、Configはリージョナル
 *
 * 本番運用では、CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION を使い、
 * CI/CDパイプラインで環境変数として注入することを推奨します。
 */
const sharedEnv: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT || '123456789012',
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

/**
 * スタック1: IAMロールとポリシー
 *
 * IAMはAWSセキュリティの基盤です。最小権限の原則に基づいて
 * ロールを設計し、権限境界で特権エスカレーションを防止します。
 */
const iamStack = new IamRolesStack(app, 'IamRolesStack', {
  env: sharedEnv,
  description: 'IAM roles, policies, and permission boundaries for governance',
});

/**
 * スタック2: Organizations SCPポリシー
 *
 * SCPは組織全体の「してはいけないこと」を定義するガードレールです。
 * 注意: このスタックはポリシードキュメントの合成のみを行い、
 * 実際のOrganizationsデプロイは行いません（管理アカウントが必要なため）。
 */
const orgStack = new OrgScpStack(app, 'OrgScpStack', {
  env: sharedEnv,
  description: 'Organizations SCP policy documents for governance guardrails',
});

/**
 * スタック3: AWS Config ルール
 *
 * Configは「現在の状態が期待される状態と一致しているか」を
 * 継続的に評価します。違反を検知し、自動修復することで
 * コンプライアンスのドリフトを防止します。
 */
const configStack = new ConfigRulesStack(app, 'ConfigRulesStack', {
  env: sharedEnv,
  description: 'AWS Config rules for continuous compliance monitoring',
});

/**
 * タグ付け戦略
 *
 * なぜすべてのリソースにタグを付けるのか？
 * - コスト配分: どのプロジェクトがいくらかかっているか追跡
 * - アクセス制御: タグベースのIAMポリシーで権限を動的に制御
 * - 自動化: タグに基づいてリソースのライフサイクルを管理
 * - コンプライアンス: 監査時にリソースの所有者と目的を特定
 */
cdk.Tags.of(app).add('Project', 'iam-org-governance');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('Environment', 'governance');
