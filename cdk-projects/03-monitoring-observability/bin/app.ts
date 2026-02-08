#!/usr/bin/env node

// =============================================================================
// モニタリング・オブザーバビリティ CDK アプリケーション
// =============================================================================
// このアプリケーションは、AWS上での包括的な監視・可観測性パターンを実装します。
// 3つのスタックを通じて、CloudWatch、EventBridge、X-Rayの主要な
// オブザーバビリティサービスを学ぶことができます。

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CloudWatchDashboardStack } from '../lib/cloudwatch-dashboard-stack';
import { EventBridgeAutomationStack } from '../lib/eventbridge-automation-stack';
import { XRayTracingStack } from '../lib/xray-tracing-stack';

const app = new cdk.App();

// スタック1: CloudWatch ダッシュボードとアラーム
// WHY: メトリクス、ログ、アラームを一元管理することで、
// システムの健全性をリアルタイムに把握できます。
new CloudWatchDashboardStack(app, 'CloudWatchDashboardStack', {
  description: 'CloudWatch Dashboard, Alarms, and Log Analytics for application monitoring',
});

// スタック2: EventBridge によるイベント駆動型運用自動化
// WHY: インフラストラクチャイベントに自動的に対応することで、
// 運用負荷を削減し、障害への対応速度を向上させます。
new EventBridgeAutomationStack(app, 'EventBridgeAutomationStack', {
  description: 'EventBridge rules for automated operational responses and scheduled health checks',
});

// スタック3: X-Ray による分散トレーシング
// WHY: マイクロサービス間のリクエストフローを可視化することで、
// ボトルネックやエラーの根本原因を迅速に特定できます。
new XRayTracingStack(app, 'XRayTracingStack', {
  description: 'X-Ray tracing for Lambda and API Gateway to enable distributed tracing',
});
