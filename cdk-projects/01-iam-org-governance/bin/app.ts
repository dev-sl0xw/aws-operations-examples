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
/**
 * =============================================================================
 * IAM・Organizations・Config 거버넌스 CDK 애플리케이션
 * =============================================================================
 *
 * 이 애플리케이션은 AWS 계정의 보안 거버넌스를 구성하는
 * 3개의 스택을 배포합니다:
 *
 * 1. IamRolesStack     - IAM Role, Policy, Permission Boundary 정의
 * 2. OrgScpStack       - Organizations SCP Policy 정의 (합성만)
 * 3. ConfigRulesStack  - AWS Config Rule에 의한 지속적 컴플라이언스 모니터링
 *
 * 왜 이 3가지를 조합하는가?
 * - IAM: "누가 무엇을 할 수 있는가"를 제어 (인증・인가)
 * - SCP: "조직 전체에서 무엇을 금지할 것인가"의 가드레일
 * - Config: "실제 상태가 기대대로인가"를 지속적으로 검증
 *
 * 이 3계층 방어를 통해 예방적 제어와 탐지적 제어를 모두 실현합니다.
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
/**
 * 공유 환경 설정
 *
 * 왜 환경을 명시적으로 지정하는가?
 * - 리전을 고정하여 의도하지 않은 리전으로의 배포를 방지
 * - 계정 ID를 지정하여 잘못된 계정으로의 배포를 방지
 * - IAM과 Organizations 리소스는 글로벌이지만 Config는 리전별
 *
 * 프로덕션 운영에서는 CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION을 사용하고,
 * CI/CD 파이프라인에서 환경 변수로 주입하는 것을 권장합니다.
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
/**
 * 스택 1: IAM Role과 Policy
 *
 * IAM은 AWS 보안의 기반입니다. 최소 권한 원칙에 기반하여
 * Role을 설계하고, Permission Boundary로 권한 상승을 방지합니다.
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
/**
 * 스택 2: Organizations SCP Policy
 *
 * SCP는 조직 전체의 "해서는 안 되는 것"을 정의하는 가드레일입니다.
 * 주의: 이 스택은 Policy 문서의 합성만 수행하며,
 * 실제 Organizations 배포는 수행하지 않습니다 (관리 계정이 필요하기 때문).
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
/**
 * 스택 3: AWS Config Rule
 *
 * Config는 "현재 상태가 기대되는 상태와 일치하는가"를
 * 지속적으로 평가합니다. 위반을 탐지하고 자동 수정하여
 * 컴플라이언스 드리프트를 방지합니다.
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
/**
 * 태깅 전략
 *
 * 왜 모든 리소스에 태그를 붙이는가?
 * - 비용 배분: 어떤 프로젝트에 얼마나 비용이 드는지 추적
 * - 접근 제어: 태그 기반 IAM Policy로 권한을 동적으로 제어
 * - 자동화: 태그에 기반하여 리소스 수명 주기를 관리
 * - 컴플라이언스: 감사 시 리소스의 소유자와 목적을 특정
 */
cdk.Tags.of(app).add('Project', 'iam-org-governance');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('Environment', 'governance');
