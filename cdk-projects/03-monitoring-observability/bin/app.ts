#!/usr/bin/env node

// =============================================================================
// モニタリング・オブザーバビリティ CDK アプリケーション
// =============================================================================
// このアプリケーションは、AWS上での包括的な監視・可観測性パターンを実装します。
// 3つのスタックを通じて、CloudWatch、EventBridge、X-Rayの主要な
// オブザーバビリティサービスを学ぶことができます。

// =============================================================================
// 모니터링・옵저버빌리티 CDK 애플리케이션
// =============================================================================
// 이 애플리케이션은 AWS에서의 포괄적인 감시・관측성 패턴을 구현합니다.
// 3개의 스택을 통해 CloudWatch, EventBridge, X-Ray의 주요
// 옵저버빌리티 서비스를 학습할 수 있습니다.

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CloudWatchDashboardStack } from '../lib/cloudwatch-dashboard-stack';
import { EventBridgeAutomationStack } from '../lib/eventbridge-automation-stack';
import { XRayTracingStack } from '../lib/xray-tracing-stack';

const app = new cdk.App();

// スタック1: CloudWatch ダッシュボードとアラーム
// WHY: メトリクス、ログ、アラームを一元管理することで、
// システムの健全性をリアルタイムに把握できます。

// 스택1: CloudWatch 대시보드와 알람
// WHY: 메트릭, 로그, 알람을 일원 관리함으로써,
// 시스템의 건전성을 실시간으로 파악할 수 있습니다.
new CloudWatchDashboardStack(app, 'CloudWatchDashboardStack', {
  description: 'CloudWatch Dashboard, Alarms, and Log Analytics for application monitoring',
});

// スタック2: EventBridge によるイベント駆動型運用自動化
// WHY: インフラストラクチャイベントに自動的に対応することで、
// 運用負荷を削減し、障害への対応速度を向上させます。

// 스택2: EventBridge를 이용한 이벤트 기반 운영 자동화
// WHY: 인프라스트럭처 이벤트에 자동으로 대응함으로써,
// 운영 부하를 줄이고, 장애 대응 속도를 향상시킵니다.
new EventBridgeAutomationStack(app, 'EventBridgeAutomationStack', {
  description: 'EventBridge rules for automated operational responses and scheduled health checks',
});

// スタック3: X-Ray による分散トレーシング
// WHY: マイクロサービス間のリクエストフローを可視化することで、
// ボトルネックやエラーの根本原因を迅速に特定できます。

// 스택3: X-Ray를 이용한 분산 트레이싱
// WHY: 마이크로서비스 간의 요청 흐름을 시각화함으로써,
// 병목 지점이나 오류의 근본 원인을 신속하게 특정할 수 있습니다.
new XRayTracingStack(app, 'XRayTracingStack', {
  description: 'X-Ray tracing for Lambda and API Gateway to enable distributed tracing',
});

cdk.Tags.of(app).add('Environment', 'Learning');
cdk.Tags.of(app).add('Project', 'MonitoringObservability');
cdk.Tags.of(app).add('ManagedBy', 'CDK');

app.synth();
