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
// EventBridge 운영 자동화 스택
// =============================================================================
// なぜ EventBridge を使うのか？
// 왜 EventBridge를 사용하는가?
// EventBridge はサーバーレスのイベントバスサービスであり、
// EventBridge는 서버리스 이벤트 버스 서비스이며,
// AWSサービスのイベント、カスタムイベント、SaaSイベントを
// AWS 서비스의 이벤트, 커스텀 이벤트, SaaS 이벤트를
// ルールベースで自動的にルーティングできます。
// 룰 기반으로 자동으로 라우팅할 수 있습니다.
//
// 従来の「ポーリング型」の監視（定期的にチェックする方式）と比べて、
// 기존의 "폴링형" 감시(정기적으로 체크하는 방식)와 비교하여,
// 「イベント駆動型」の監視は以下の利点があります：
// "이벤트 기반형" 감시는 다음과 같은 장점이 있습니다:
// - リアルタイムに近い応答（イベント発生時に即座に対応）
// - 실시간에 가까운 응답 (이벤트 발생 시 즉시 대응)
// - 無駄なAPIコールの削減（変化がない時は何もしない）
// - 불필요한 API 호출의 절감 (변화가 없을 때는 아무것도 하지 않음)
// - 疎結合なアーキテクチャ（イベント発行者と受信者が独立）
// - 느슨한 결합 아키텍처 (이벤트 발행자와 수신자가 독립적)
// =============================================================================

export class EventBridgeAutomationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // カスタムイベントバスの作成
    // 커스텀 이벤트 버스 생성
    // =========================================================================
    // なぜカスタムイベントバスを使うのか？
    // 왜 커스텀 이벤트 버스를 사용하는가?
    // デフォルトのイベントバスはAWSサービスのイベントで混雑しています。
    // 기본 이벤트 버스는 AWS 서비스의 이벤트로 혼잡합니다.
    // カスタムイベントバスを使うことで、アプリケーション固有のイベントを
    // 커스텀 이벤트 버스를 사용함으로써, 애플리케이션 고유의 이벤트를
    // 分離・整理し、ルール管理を簡素化できます。
    // 분리・정리하고, 룰 관리를 간소화할 수 있습니다.
    // また、アクセス制御もイベントバス単位で設定できるため、
    // 또한, 접근 제어도 이벤트 버스 단위로 설정할 수 있기 때문에,
    // セキュリティの観点でも優れています。
    // 보안 관점에서도 우수합니다.
    const appEventBus = new events.EventBus(this, 'ApplicationEventBus', {
      eventBusName: 'monitoring-app-events',
    });

    // =========================================================================
    // SNS トピック（運用アラート通知先）
    // SNS 토픽 (운영 알림 통지 대상)
    // =========================================================================
    // なぜ SNS を EventBridge と組み合わせるのか？
    // 왜 SNS를 EventBridge와 조합하는가?
    // EventBridge はイベントのルーティングに特化しており、
    // EventBridge는 이벤트의 라우팅에 특화되어 있으며,
    // SNS は通知配信に特化しています。
    // SNS는 통지 배포에 특화되어 있습니다.
    // この組み合わせにより、「どのイベントに反応するか」と
    // 이 조합을 통해, "어떤 이벤트에 반응하는가"와
    // 「誰にどう通知するか」を分離して管理できます。
    // "누구에게 어떻게 통지하는가"를 분리하여 관리할 수 있습니다.
    const operationalAlertsTopic = new sns.Topic(this, 'OperationalAlertsTopic', {
      topicName: 'operational-alerts',
      displayName: 'Operational Alerts from EventBridge',
    });

    // =========================================================================
    // ルール1: EC2 インスタンス状態変更の検知
    // 룰1: EC2 인스턴스 상태 변경 감지
    // =========================================================================
    // なぜ EC2 の状態変更を監視するのか？
    // 왜 EC2의 상태 변경을 감시하는가?
    // EC2 インスタンスの予期しない停止や終了は、サービス障害の直接的な原因です。
    // EC2 인스턴스의 예기치 않은 중지나 종료는, 서비스 장애의 직접적인 원인입니다.
    // EventBridge を使ってリアルタイムに検知することで、
    // EventBridge를 사용하여 실시간으로 감지함으로써,
    // 手動でのコンソール確認に頼ることなく、迅速な対応が可能になります。
    // 수동 콘솔 확인에 의존하지 않고, 신속한 대응이 가능해집니다.
    //
    // イベントパターンの詳細:
    // 이벤트 패턴의 상세:
    // - source: "aws.ec2" → EC2 サービスからのイベントのみを対象
    // - source: "aws.ec2" → EC2 서비스에서의 이벤트만 대상
    // - detail-type: "EC2 Instance State-change Notification" → 状態変更イベントのみ
    // - detail-type: "EC2 Instance State-change Notification" → 상태 변경 이벤트만
    // - detail.state: ["stopping", "terminated"] → 停止中・終了済みのみ通知
    // - detail.state: ["stopping", "terminated"] → 중지 중・종료 완료만 통지
    //   （running への変更は正常な動作なので通知不要）
    //   (running으로의 변경은 정상적인 동작이므로 통지 불필요)
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
    // EC2 상태 변경 시 SNS로 통지
    ec2StateChangeRule.addTarget(new targets.SnsTopic(operationalAlertsTopic, {
      message: events.RuleTargetInput.fromText(
        `EC2 Instance State Change Detected: Instance ${events.EventField.fromPath('$.detail.instance-id')} changed to state ${events.EventField.fromPath('$.detail.state')}`
      ),
    }));

    // =========================================================================
    // ヘルスチェック Lambda 関数の作成
    // 헬스 체크 Lambda 함수 생성
    // =========================================================================
    // なぜ Lambda でヘルスチェックを行うのか？
    // 왜 Lambda로 헬스 체크를 수행하는가?
    // 定期的なヘルスチェックにより、CloudWatch メトリクスだけでは
    // 정기적인 헬스 체크를 통해, CloudWatch 메트릭만으로는
    // 検知できない問題（例: APIのレスポンス内容の異常、外部依存サービスの障害）
    // 감지할 수 없는 문제(예: API 응답 내용의 이상, 외부 의존 서비스의 장애)를
    // を発見できます。Lambda を使うことで、サーバーの管理なしに
    // 발견할 수 있습니다. Lambda를 사용함으로써, 서버 관리 없이
    // ヘルスチェックロジックを実行できます。
    // 헬스 체크 로직을 실행할 수 있습니다.
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
      // 인라인 코드로 헬스 체크 로직을 정의
      // なぜインラインコードを使うのか？
      // 왜 인라인 코드를 사용하는가?
      // シンプルなヘルスチェック処理の場合、外部ファイルを管理するよりも
      // 심플한 헬스 체크 처리의 경우, 외부 파일을 관리하는 것보다
      // インラインコードの方が可搬性が高く、CDKスタックだけで完結します。
      // 인라인 코드 쪽이 이식성이 높고, CDK 스택만으로 완결됩니다.
      code: lambda.Code.fromInline(`
        // ヘルスチェック Lambda ハンドラー
        // 헬스 체크 Lambda 핸들러
        // このハンドラーは EventBridge のスケジュールルールによって
        // 이 핸들러는 EventBridge의 스케줄 룰에 의해
        // 5分ごとに実行されます。
        // 5분마다 실행됩니다.
        exports.handler = async (event) => {
          const timestamp = new Date().toISOString();

          // ヘルスチェック結果のログ出力
          // 헬스 체크 결과의 로그 출력
          // 構造化ログを使用することで、CloudWatch Logs Insights での
          // 구조화 로그를 사용함으로써, CloudWatch Logs Insights에서의
          // 分析が容易になります。
          // 분석이 용이해집니다.
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
    // Lambda의 로그 그룹을 명시적으로 연결
    healthCheckFunction.node.addDependency(healthCheckLogGroup);

    // =========================================================================
    // ルール2: スケジュールルール（5分ごとのヘルスチェック）
    // 룰2: 스케줄 룰 (5분마다 헬스 체크)
    // =========================================================================
    // なぜスケジュールルールを使うのか？
    // 왜 스케줄 룰을 사용하는가?
    // EventBridge のスケジュールルールは、cron ジョブの AWS マネージド版です。
    // EventBridge의 스케줄 룰은, cron 작업의 AWS 매니지드 버전입니다.
    // EC2 上で cron を動かす場合と比較して以下の利点があります：
    // EC2에서 cron을 실행하는 경우와 비교하여 다음과 같은 장점이 있습니다:
    // - サーバー管理不要（EventBridge 自体がフルマネージド）
    // - 서버 관리 불필요 (EventBridge 자체가 완전 관리형)
    // - 高い信頼性（AWS が冗長性を保証）
    // - 높은 신뢰성 (AWS가 이중화를 보장)
    // - 実行履歴の追跡（CloudTrail との統合）
    // - 실행 이력의 추적 (CloudTrail과의 통합)
    //
    // rate(5 minutes) は「5分ごとに実行」を意味します。
    // rate(5 minutes)는 "5분마다 실행"을 의미합니다.
    // cron 式も使用可能で、より複雑なスケジュール設定も可能です。
    // cron 식도 사용 가능하며, 더 복잡한 스케줄 설정도 가능합니다.
    const scheduledHealthCheckRule = new events.Rule(this, 'ScheduledHealthCheckRule', {
      ruleName: 'scheduled-health-check',
      description: '5分ごとにヘルスチェック Lambda を実行してシステムの健全性を確認します',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
    });

    // スケジュールルールのターゲットとして Lambda を設定
    // 스케줄 룰의 타겟으로 Lambda를 설정
    scheduledHealthCheckRule.addTarget(
      new targets.LambdaFunction(healthCheckFunction, {
        retryAttempts: 2,
      })
    );

    // =========================================================================
    // CfnOutputs（スタック出力）
    // CfnOutputs (스택 출력)
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
