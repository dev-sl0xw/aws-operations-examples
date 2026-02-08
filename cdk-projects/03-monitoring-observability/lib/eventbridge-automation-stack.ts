import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

// =============================================================================
// EventBridge 運用自動化スタック
// =============================================================================
// なぜ EventBridge を使うのか？
// EventBridge はサーバーレスのイベントバスサービスであり、
// AWSサービスのイベント、カスタムイベント、SaaSイベントを
// ルールベースで自動的にルーティングできます。
//
// 従来の「ポーリング型」の監視（定期的にチェックする方式）と比べて、
// 「イベント駆動型」の監視は以下の利点があります：
// - リアルタイムに近い応答（イベント発生時に即座に対応）
// - 無駄なAPIコールの削減（変化がない時は何もしない）
// - 疎結合なアーキテクチャ（イベント発行者と受信者が独立）
// =============================================================================

export class EventBridgeAutomationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // カスタムイベントバスの作成
    // =========================================================================
    // なぜカスタムイベントバスを使うのか？
    // デフォルトのイベントバスはAWSサービスのイベントで混雑しています。
    // カスタムイベントバスを使うことで、アプリケーション固有のイベントを
    // 分離・整理し、ルール管理を簡素化できます。
    // また、アクセス制御もイベントバス単位で設定できるため、
    // セキュリティの観点でも優れています。
    const appEventBus = new events.EventBus(this, 'ApplicationEventBus', {
      eventBusName: 'monitoring-app-events',
    });

    // =========================================================================
    // SNS トピック（運用アラート通知先）
    // =========================================================================
    // なぜ SNS を EventBridge と組み合わせるのか？
    // EventBridge はイベントのルーティングに特化しており、
    // SNS は通知配信に特化しています。
    // この組み合わせにより、「どのイベントに反応するか」と
    // 「誰にどう通知するか」を分離して管理できます。
    const operationalAlertsTopic = new sns.Topic(this, 'OperationalAlertsTopic', {
      topicName: 'operational-alerts',
      displayName: 'Operational Alerts from EventBridge',
    });

    // =========================================================================
    // ルール1: EC2 インスタンス状態変更の検知
    // =========================================================================
    // なぜ EC2 の状態変更を監視するのか？
    // EC2 インスタンスの予期しない停止や終了は、サービス障害の直接的な原因です。
    // EventBridge を使ってリアルタイムに検知することで、
    // 手動でのコンソール確認に頼ることなく、迅速な対応が可能になります。
    //
    // イベントパターンの詳細:
    // - source: "aws.ec2" → EC2 サービスからのイベントのみを対象
    // - detail-type: "EC2 Instance State-change Notification" → 状態変更イベントのみ
    // - detail.state: ["stopping", "terminated"] → 停止中・終了済みのみ通知
    //   （running への変更は正常な動作なので通知不要）
    const ec2StateChangeRule = new events.Rule(this, 'EC2StateChangeRule', {
      ruleName: 'ec2-instance-state-change',
      description: 'EC2インスタンスが停止または終了した場合にSNS通知を送信します',
      eventPattern: {
        source: ['aws.ec2'],
        detailType: ['EC2 Instance State-change Notification'],
        detail: {
          state: ['stopping', 'terminated'],
        },
      },
    });

    // EC2 状態変更時に SNS へ通知
    ec2StateChangeRule.addTarget(new targets.SnsTopic(operationalAlertsTopic, {
      message: events.RuleTargetInput.fromText(
        `EC2 Instance State Change Detected: Instance ${events.EventField.fromPath('$.detail.instance-id')} changed to state ${events.EventField.fromPath('$.detail.state')}`
      ),
    }));

    // =========================================================================
    // ヘルスチェック Lambda 関数の作成
    // =========================================================================
    // なぜ Lambda でヘルスチェックを行うのか？
    // 定期的なヘルスチェックにより、CloudWatch メトリクスだけでは
    // 検知できない問題（例: APIのレスポンス内容の異常、外部依存サービスの障害）
    // を発見できます。Lambda を使うことで、サーバーの管理なしに
    // ヘルスチェックロジックを実行できます。
    const healthCheckLogGroup = new logs.LogGroup(this, 'HealthCheckLogGroup', {
      logGroupName: '/aws/lambda/scheduled-health-check',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const healthCheckFunction = new lambda.Function(this, 'HealthCheckFunction', {
      functionName: 'scheduled-health-check',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      // インラインコードでヘルスチェックロジックを定義
      // なぜインラインコードを使うのか？
      // シンプルなヘルスチェック処理の場合、外部ファイルを管理するよりも
      // インラインコードの方が可搬性が高く、CDKスタックだけで完結します。
      code: lambda.Code.fromInline(`
        // ヘルスチェック Lambda ハンドラー
        // このハンドラーは EventBridge のスケジュールルールによって
        // 5分ごとに実行されます。
        exports.handler = async (event) => {
          const timestamp = new Date().toISOString();

          // ヘルスチェック結果のログ出力
          // 構造化ログを使用することで、CloudWatch Logs Insights での
          // 分析が容易になります。
          const healthStatus = {
            timestamp: timestamp,
            service: 'monitoring-example',
            status: 'healthy',
            checks: {
              memory: {
                status: 'ok',
                usedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                totalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
              },
              uptime: {
                status: 'ok',
                seconds: process.uptime(),
              },
            },
            eventSource: event.source || 'manual',
            eventDetailType: event['detail-type'] || 'manual-invocation',
          };

          console.log(JSON.stringify(healthStatus));

          return {
            statusCode: 200,
            body: JSON.stringify(healthStatus),
          };
        };
      `),
    });

    // Lambda のロググループを明示的に関連付け
    healthCheckFunction.node.addDependency(healthCheckLogGroup);

    // =========================================================================
    // ルール2: スケジュールルール（5分ごとのヘルスチェック）
    // =========================================================================
    // なぜスケジュールルールを使うのか？
    // EventBridge のスケジュールルールは、cron ジョブの AWS マネージド版です。
    // EC2 上で cron を動かす場合と比較して以下の利点があります：
    // - サーバー管理不要（EventBridge 自体がフルマネージド）
    // - 高い信頼性（AWS が冗長性を保証）
    // - 実行履歴の追跡（CloudTrail との統合）
    //
    // rate(5 minutes) は「5分ごとに実行」を意味します。
    // cron 式も使用可能で、より複雑なスケジュール設定も可能です。
    const scheduledHealthCheckRule = new events.Rule(this, 'ScheduledHealthCheckRule', {
      ruleName: 'scheduled-health-check',
      description: '5分ごとにヘルスチェック Lambda を実行してシステムの健全性を確認します',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
    });

    // スケジュールルールのターゲットとして Lambda を設定
    scheduledHealthCheckRule.addTarget(
      new targets.LambdaFunction(healthCheckFunction, {
        retryAttempts: 2,
      })
    );

    // =========================================================================
    // CfnOutputs（スタック出力）
    // =========================================================================
    new cdk.CfnOutput(this, 'EventBusName', {
      value: appEventBus.eventBusName,
      description: 'Custom EventBridge event bus name for application events',
    });

    new cdk.CfnOutput(this, 'EventBusArn', {
      value: appEventBus.eventBusArn,
      description: 'Custom EventBridge event bus ARN',
    });

    new cdk.CfnOutput(this, 'EC2StateChangeRuleName', {
      value: ec2StateChangeRule.ruleName,
      description: 'EventBridge rule name for EC2 state change notifications',
    });

    new cdk.CfnOutput(this, 'ScheduledHealthCheckRuleName', {
      value: scheduledHealthCheckRule.ruleName,
      description: 'EventBridge rule name for scheduled health checks',
    });

    new cdk.CfnOutput(this, 'HealthCheckFunctionName', {
      value: healthCheckFunction.functionName,
      description: 'Lambda function name for health checks',
    });

    new cdk.CfnOutput(this, 'OperationalAlertsTopicArn', {
      value: operationalAlertsTopic.topicArn,
      description: 'SNS Topic ARN for operational alerts',
    });
  }
}
