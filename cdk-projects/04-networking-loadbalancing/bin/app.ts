#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcDesignStack } from '../lib/vpc-design-stack';
import { AlbNlbStack } from '../lib/alb-nlb-stack';
import { Route53FailoverStack } from '../lib/route53-failover-stack';
import { AutoScalingStack } from '../lib/autoscaling-stack';

// ============================================================================
// CDKアプリケーションのエントリーポイント
// ============================================================================
// スタック間の依存関係:
//   VpcDesignStack（基盤）
//     ├── AlbNlbStack（VPCを参照）
//     │     └── AutoScalingStack（VPCとALBターゲットグループを参照）
//     └── Route53FailoverStack（VPCを参照）
//
// CDKはスタック間の依存関係を自動的に検出し、正しい順序でデプロイする。
// ============================================================================

// ============================================================================
// CDK 애플리케이션의 엔트리 포인트
// ============================================================================
// 스택 간의 의존 관계:
//   VpcDesignStack (기반)
//     ├── AlbNlbStack (VPC를 참조)
//     │     └── AutoScalingStack (VPC와 ALB 타겟 그룹을 참조)
//     └── Route53FailoverStack (VPC를 참조)
//
// CDK는 스택 간의 의존 관계를 자동으로 감지하고, 올바른 순서로 배포한다.
// ============================================================================

const app = new cdk.App();

// 環境設定（アカウントとリージョン）
// CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION は `cdk deploy` 時に
// AWS CLIの設定から自動的に取得される。

// 환경 설정 (계정과 리전)
// CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION은 `cdk deploy` 시에
// AWS CLI의 설정에서 자동으로 취득된다.
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// スタック1: VPC（全てのスタックの基盤）
// VPCは他の全てのスタックから参照されるため、最初にデプロイする。

// 스택1: VPC (모든 스택의 기반)
// VPC는 다른 모든 스택에서 참조되기 때문에, 먼저 배포한다.
const vpcStack = new VpcDesignStack(app, 'VpcDesignStack', {
  env,
  description: 'VPC、サブネット、NATゲートウェイ、VPCエンドポイントの構築',
});

// スタック2: ALB/NLB（VPCに依存）
// ロードバランサーをVPCのパブリックサブネットに配置する。

// 스택2: ALB/NLB (VPC에 의존)
// 로드 밸런서를 VPC의 퍼블릭 서브넷에 배치한다.
const albNlbStack = new AlbNlbStack(app, 'AlbNlbStack', {
  env,
  vpc: vpcStack.vpc,
  description: 'Application Load BalancerとNetwork Load Balancerの構築',
});

// スタック3: Route 53（VPCに依存）
// プライベートホストゾーンを作成し、VPCに関連付ける。

// 스택3: Route 53 (VPC에 의존)
// 프라이빗 호스트 존을 생성하고, VPC에 연결한다.
const route53Stack = new Route53FailoverStack(app, 'Route53FailoverStack', {
  env,
  vpc: vpcStack.vpc,
  description: 'Route 53プライベートホストゾーンと加重ルーティングの構築',
});

// スタック4: Auto Scaling（VPCとALBに依存）
// ASGをプライベートサブネットに配置し、ALBのターゲットグループに登録する。

// 스택4: Auto Scaling (VPC와 ALB에 의존)
// ASG를 프라이빗 서브넷에 배치하고, ALB의 타겟 그룹에 등록한다.
const autoScalingStack = new AutoScalingStack(app, 'AutoScalingStack', {
  env,
  vpc: vpcStack.vpc,
  alb: albNlbStack.alb,
  albTargetGroup: albNlbStack.albTargetGroup,
  description: 'Auto Scaling Group、スケーリングポリシー、ライフサイクルフックの構築',
});

// タグの一括適用
// 全てのスタックに共通のタグを付与する。
// コスト管理、リソース管理、コンプライアンスに活用する。

// 태그 일괄 적용
// 모든 스택에 공통 태그를 부여한다.
// 비용 관리, 리소스 관리, 컴플라이언스에 활용한다.
cdk.Tags.of(app).add('Environment', 'Learning');
cdk.Tags.of(app).add('Project', 'NetworkingLoadBalancing');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
