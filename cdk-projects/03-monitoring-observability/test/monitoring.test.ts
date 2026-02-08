import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { CloudWatchDashboardStack } from '../lib/cloudwatch-dashboard-stack';
import { EventBridgeAutomationStack } from '../lib/eventbridge-automation-stack';
import { XRayTracingStack } from '../lib/xray-tracing-stack';

// =============================================================================
// モニタリング・オブザーバビリティ テストスイート
// =============================================================================
// なぜインフラのテストを書くのか？
// CDK テストにより、デプロイ前にインフラストラクチャの設定が
// 意図通りであることを検証できます。
// これにより、誤った設定変更（例: アラームしきい値の変更、
// 権限の削除）がデプロイされるのを防ぎます。
// =============================================================================

describe('CloudWatchDashboardStack', () => {
  let app: cdk.App;
  let stack: CloudWatchDashboardStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new CloudWatchDashboardStack(app, 'TestCloudWatchStack');
    template = Template.fromStack(stack);
  });

  // =========================================================================
  // ロググループのテスト
  // =========================================================================
  test('creates log group with 30-day retention', () => {
    // ロググループが正しい保持期間で作成されることを検証
    // RetentionInDays: 30 は ONE_MONTH に対応
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/app/monitoring-example',
      RetentionInDays: 30,
    });
  });

  // =========================================================================
  // メトリクスフィルターのテスト
  // =========================================================================
  test('creates metric filter for ERROR logs', () => {
    // メトリクスフィルターが正しいパターンとメトリクス設定で作成されることを検証
    template.hasResourceProperties('AWS::Logs::MetricFilter', {
      FilterPattern: 'ERROR',
      MetricTransformations: Match.arrayWith([
        Match.objectLike({
          MetricNamespace: 'MonitoringExample',
          MetricName: 'ApplicationErrorCount',
          MetricValue: '1',
        }),
      ]),
    });
  });

  // =========================================================================
  // アラームのテスト
  // =========================================================================
  test('creates error rate alarm with correct threshold', () => {
    // エラー率アラームが正しいしきい値と評価期間で作成されることを検証
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'HighApplicationErrorRate',
      Threshold: 10,
      EvaluationPeriods: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      TreatMissingData: 'notBreaching',
    });
  });

  test('creates CPU utilization alarm', () => {
    // CPU使用率アラームが80%のしきい値で作成されることを検証
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'HighCPUUtilization',
      Threshold: 80,
      EvaluationPeriods: 3,
      ComparisonOperator: 'GreaterThanThreshold',
    });
  });

  test('creates composite alarm combining CPU and error alarms', () => {
    // 複合アラームが作成されることを検証
    // CompositeAlarm は AlarmName プロパティでアラーム名が設定される
    template.hasResourceProperties('AWS::CloudWatch::CompositeAlarm', {
      AlarmName: 'CriticalSystemAlarm',
    });
  });

  // =========================================================================
  // SNS トピックのテスト
  // =========================================================================
  test('creates SNS topic for alarm notifications', () => {
    template.hasResourceProperties('AWS::SNS::Topic', {
      TopicName: 'monitoring-alarm-notifications',
      DisplayName: 'Monitoring Alarm Notifications',
    });
  });

  // =========================================================================
  // ダッシュボードのテスト
  // =========================================================================
  test('creates CloudWatch dashboard', () => {
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'ApplicationMonitoringDashboard',
    });
  });

  // =========================================================================
  // リソース数のテスト
  // =========================================================================
  test('creates expected number of alarms', () => {
    // エラーアラーム + CPUアラーム = 2つの通常アラーム
    template.resourceCountIs('AWS::CloudWatch::Alarm', 2);
  });

  test('creates one composite alarm', () => {
    template.resourceCountIs('AWS::CloudWatch::CompositeAlarm', 1);
  });

  // =========================================================================
  // CfnOutputs のテスト
  // =========================================================================
  test('outputs dashboard name and alarm ARN', () => {
    template.hasOutput('DashboardName', {});
    template.hasOutput('ErrorAlarmArn', {});
    template.hasOutput('CompositeAlarmArn', {});
  });
});

describe('EventBridgeAutomationStack', () => {
  let app: cdk.App;
  let stack: EventBridgeAutomationStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new EventBridgeAutomationStack(app, 'TestEventBridgeStack');
    template = Template.fromStack(stack);
  });

  // =========================================================================
  // カスタムイベントバスのテスト
  // =========================================================================
  test('creates custom event bus', () => {
    template.hasResourceProperties('AWS::Events::EventBus', {
      Name: 'monitoring-app-events',
    });
  });

  // =========================================================================
  // EC2 状態変更ルールのテスト
  // =========================================================================
  test('creates EC2 state change rule with correct event pattern', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      Name: 'ec2-instance-state-change',
      EventPattern: {
        source: ['aws.ec2'],
        'detail-type': ['EC2 Instance State-change Notification'],
        detail: {
          state: ['stopping', 'terminated'],
        },
      },
    });
  });

  // =========================================================================
  // スケジュールルールのテスト
  // =========================================================================
  test('creates scheduled health check rule running every 5 minutes', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      Name: 'scheduled-health-check',
      ScheduleExpression: 'rate(5 minutes)',
    });
  });

  // =========================================================================
  // Lambda 関数のテスト
  // =========================================================================
  test('creates health check Lambda function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'scheduled-health-check',
      Runtime: 'nodejs18.x',
      Timeout: 30,
      MemorySize: 128,
    });
  });

  // =========================================================================
  // SNS トピックのテスト
  // =========================================================================
  test('creates operational alerts SNS topic', () => {
    template.hasResourceProperties('AWS::SNS::Topic', {
      TopicName: 'operational-alerts',
    });
  });

  // =========================================================================
  // ルール数のテスト
  // =========================================================================
  test('creates expected number of EventBridge rules', () => {
    // EC2 状態変更ルール + スケジュールヘルスチェックルール = 2つ
    template.resourceCountIs('AWS::Events::Rule', 2);
  });

  // =========================================================================
  // Lambda の EventBridge 権限テスト
  // =========================================================================
  test('grants EventBridge permission to invoke health check Lambda', () => {
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'events.amazonaws.com',
    });
  });

  // =========================================================================
  // CfnOutputs のテスト
  // =========================================================================
  test('outputs event bus name and rule names', () => {
    template.hasOutput('EventBusName', {});
    template.hasOutput('EC2StateChangeRuleName', {});
    template.hasOutput('ScheduledHealthCheckRuleName', {});
  });
});

describe('XRayTracingStack', () => {
  let app: cdk.App;
  let stack: XRayTracingStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new XRayTracingStack(app, 'TestXRayStack');
    template = Template.fromStack(stack);
  });

  // =========================================================================
  // Lambda 関数のテスト（X-Ray トレーシング有効）
  // =========================================================================
  test('creates Lambda function with X-Ray active tracing', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'xray-traced-function',
      Runtime: 'nodejs18.x',
      // TracingConfig.Mode が Active であることを検証
      // Active = Lambda が独自にサンプリング判断を行い、トレースを開始
      TracingConfig: {
        Mode: 'Active',
      },
    });
  });

  test('Lambda function has X-Ray environment variables', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          AWS_XRAY_TRACING_NAME: 'MonitoringExampleService',
          AWS_XRAY_CONTEXT_MISSING: 'LOG_ERROR',
        }),
      },
    });
  });

  // =========================================================================
  // IAM ロールのテスト（X-Ray 書き込み権限）
  // =========================================================================
  test('creates IAM role with X-Ray write permissions', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'xray-traced-lambda-role',
      ManagedPolicyArns: Match.arrayWith([
        Match.objectLike({
          'Fn::Join': Match.arrayWith([
            Match.arrayWith([
              Match.stringLikeRegexp('AWSXRayDaemonWriteAccess'),
            ]),
          ]),
        }),
      ]),
    });
  });

  test('IAM role has Lambda basic execution policy', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: Match.arrayWith([
        Match.objectLike({
          'Fn::Join': Match.arrayWith([
            Match.arrayWith([
              Match.stringLikeRegexp('AWSLambdaBasicExecutionRole'),
            ]),
          ]),
        }),
      ]),
    });
  });

  // =========================================================================
  // API Gateway のテスト（X-Ray トレーシング有効）
  // =========================================================================
  test('creates API Gateway REST API', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: 'xray-traced-api',
    });
  });

  test('API Gateway stage has X-Ray tracing enabled', () => {
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      StageName: 'prod',
      TracingEnabled: true,
    });
  });

  // =========================================================================
  // API リソースとメソッドのテスト
  // =========================================================================
  test('creates API Gateway methods', () => {
    // GET/POST メソッドが作成されていることを検証
    // ルート GET + /health GET + /trace GET + /trace POST + OPTIONS = 少なくとも4つ
    const methods = template.findResources('AWS::ApiGateway::Method');
    expect(Object.keys(methods).length).toBeGreaterThanOrEqual(4);
  });

  test('creates API Gateway resources for health and trace paths', () => {
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: 'health',
    });
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: 'trace',
    });
  });

  // =========================================================================
  // Lambda ロググループのテスト
  // =========================================================================
  test('creates log group for traced Lambda function', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/lambda/xray-traced-function',
      RetentionInDays: 14,
    });
  });

  // =========================================================================
  // CfnOutputs のテスト
  // =========================================================================
  test('outputs API endpoint URL and Lambda function name', () => {
    template.hasOutput('ApiEndpointUrl', {});
    template.hasOutput('TracedFunctionName', {});
    template.hasOutput('LambdaRoleArn', {});
  });
});
