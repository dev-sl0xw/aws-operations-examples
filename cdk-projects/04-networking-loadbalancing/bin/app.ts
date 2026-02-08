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

const app = new cdk.App();

// 環境設定（アカウントとリージョン）
// CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION は `cdk deploy` 時に
// AWS CLIの設定から自動的に取得される。
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// スタック1: VPC（全てのスタックの基盤）
// VPCは他の全てのスタックから参照されるため、最初にデプロイする。
const vpcStack = new VpcDesignStack(app, 'VpcDesignStack', {
  env,
  description: 'VPC、サブネット、NATゲートウェイ、VPCエンドポイントの構築',
});

// スタック2: ALB/NLB（VPCに依存）
// ロードバランサーをVPCのパブリックサブネットに配置する。
const albNlbStack = new AlbNlbStack(app, 'AlbNlbStack', {
  env,
  vpc: vpcStack.vpc,
  description: 'Application Load BalancerとNetwork Load Balancerの構築',
});

// スタック3: Route 53（VPCに依存）
// プライベートホストゾーンを作成し、VPCに関連付ける。
const route53Stack = new Route53FailoverStack(app, 'Route53FailoverStack', {
  env,
  vpc: vpcStack.vpc,
  description: 'Route 53プライベートホストゾーンと加重ルーティングの構築',
});

// スタック4: Auto Scaling（VPCとALBに依存）
// ASGをプライベートサブネットに配置し、ALBのターゲットグループに登録する。
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
cdk.Tags.of(app).add('Environment', 'Learning');
cdk.Tags.of(app).add('Project', 'NetworkingLoadBalancing');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
