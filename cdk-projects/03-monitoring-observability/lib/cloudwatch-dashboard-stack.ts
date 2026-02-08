import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';

// =============================================================================
// CloudWatch ダッシュボード・アラームスタック
// =============================================================================
// なぜ CloudWatch を使うのか？
// CloudWatch は AWS のネイティブ監視サービスであり、メトリクス収集、
// ログ集約、アラーム通知を統合的に管理できます。
// 個別の監視ツールを組み合わせるよりも、AWSサービスとのシームレスな統合が
// 可能であり、運用の複雑さを大幅に削減できます。
// =============================================================================

export class CloudWatchDashboardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // ロググループの作成（30日間保持）
    // =========================================================================
    // なぜ保持期間を設定するのか？
    // ログの無制限保持はストレージコストを増大させます。
    // 30日間は多くのアプリケーションにとって、障害調査やトレンド分析に
    // 十分な期間です。コンプライアンス要件がある場合は、S3へのエクスポートで
    // 長期保存することを推奨します。
    const appLogGroup = new logs.LogGroup(this, 'ApplicationLogGroup', {
      logGroupName: '/app/monitoring-example',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // =========================================================================
    // メトリクスフィルターの作成（ERRORログのカウント）
    // =========================================================================
    // なぜメトリクスフィルターを使うのか？
    // ログの中から特定のパターン（例: ERROR）を自動的に検出し、
    // 数値メトリクスとして集計することで、アラームやグラフでの利用が可能になります。
    // これにより「ログを目視で確認する」という運用から脱却し、
    // 問題の早期検知を自動化できます。
    const errorMetricFilter = new logs.MetricFilter(this, 'ErrorMetricFilter', {
      logGroup: appLogGroup,
      filterPattern: logs.FilterPattern.literal('ERROR'),
      metricNamespace: 'MonitoringExample',
      metricName: 'ApplicationErrorCount',
      metricValue: '1',
      defaultValue: 0,
    });

    // メトリクスフィルターから CloudWatch メトリクスを取得
    const errorMetric = errorMetricFilter.metric({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // =========================================================================
    // SNS トピックの作成（アラーム通知先）
    // =========================================================================
    // なぜ SNS を使うのか？
    // SNS はアラーム通知のハブとして機能し、メール、SMS、Slack（Lambda経由）、
    // PagerDuty など、複数の通知チャネルに同時に配信できます。
    // アラームと通知先を疎結合にすることで、通知方法の変更が容易になります。
    const alarmTopic = new sns.Topic(this, 'AlarmNotificationTopic', {
      topicName: 'monitoring-alarm-notifications',
      displayName: 'Monitoring Alarm Notifications',
    });

    // =========================================================================
    // CloudWatch アラームの作成（エラー数しきい値: 5分間に10回以上）
    // =========================================================================
    // なぜアラームを設定するのか？
    // アラームは、メトリクスが定義されたしきい値を超えた際に自動的に通知を
    // トリガーします。人間が常時監視する必要がなくなり、異常が発生した時のみ
    // 対応すればよくなります。
    // しきい値の設定は、アプリケーションの通常のエラー率を考慮して決定します。
    // 低すぎると誤報（ノイズ）が増え、高すぎると検知が遅れます。
    const errorAlarm = new cloudwatch.Alarm(this, 'HighErrorRateAlarm', {
      alarmName: 'HighApplicationErrorRate',
      alarmDescription: 'アプリケーションのエラー率が高い状態を検知します。5分間に10件以上のERRORログが発生した場合にアラームが発報されます。',
      metric: errorMetric,
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // アラーム発報時に SNS トピックへ通知
    errorAlarm.addAlarmAction(
      new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic)
    );

    // =========================================================================
    // CPU 使用率のメトリクス（ダッシュボード用）
    // =========================================================================
    // なぜ CPU メトリクスを監視するのか？
    // CPU 使用率はシステムの負荷状態を示す基本的な指標です。
    // 高い CPU 使用率が継続すると、レスポンス遅延やタイムアウトの原因となります。
    // EC2 インスタンス全体の平均 CPU を監視することで、
    // スケーリングの必要性を判断できます。
    const cpuMetric = new cloudwatch.Metric({
      namespace: 'AWS/EC2',
      metricName: 'CPUUtilization',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    // CPU 使用率のアラーム
    const cpuAlarm = new cloudwatch.Alarm(this, 'HighCPUAlarm', {
      alarmName: 'HighCPUUtilization',
      alarmDescription: 'EC2インスタンスのCPU使用率が80%を超えた場合にアラームが発報されます。',
      metric: cpuMetric,
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.MISSING,
    });

    // =========================================================================
    // 複合アラーム（高CPU + 高エラー率）
    // =========================================================================
    // なぜ複合アラームを使うのか？
    // 単一のアラームだけでは、一時的なスパイクでも通知されてしまい、
    // 運用チームが「アラーム疲れ」に陥る危険があります。
    // 複合アラームは複数の条件を組み合わせることで、
    // 本当に対応が必要な状況のみを通知できます。
    // 例: CPU使用率が高い AND エラーも増加している → 深刻な問題の可能性が高い
    const compositeAlarm = new cloudwatch.CompositeAlarm(this, 'CriticalCompositeAlarm', {
      compositeAlarmName: 'CriticalSystemAlarm',
      alarmDescription: 'CPU使用率が高く、かつエラー率も高い場合に発報される複合アラームです。両方の条件が同時に満たされた場合のみ通知されます。',
      alarmRule: cloudwatch.AlarmRule.allOf(
        cloudwatch.AlarmRule.fromAlarm(cpuAlarm, cloudwatch.AlarmState.ALARM),
        cloudwatch.AlarmRule.fromAlarm(errorAlarm, cloudwatch.AlarmState.ALARM),
      ),
    });

    compositeAlarm.addAlarmAction(
      new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic)
    );

    // =========================================================================
    // CloudWatch ダッシュボードの作成
    // =========================================================================
    // なぜダッシュボードを作成するのか？
    // ダッシュボードは複数のメトリクスやログを一つの画面に集約し、
    // システム全体の健全性を一目で把握できるようにします。
    // 障害発生時に複数の AWS コンソール画面を切り替える必要がなくなり、
    // 平均復旧時間（MTTR）の短縮に貢献します。
    const dashboard = new cloudwatch.Dashboard(this, 'MonitoringDashboard', {
      dashboardName: 'ApplicationMonitoringDashboard',
    });

    // エラーメトリクスのグラフウィジェット
    // なぜグラフを使うのか？
    // 数値だけでなく時系列のトレンドを視覚化することで、
    // 「いつから問題が始まったか」「悪化しているか改善しているか」を
    // 直感的に判断できます。
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Application Error Count',
        left: [errorMetric],
        width: 12,
        height: 6,
        view: cloudwatch.GraphWidgetView.TIME_SERIES,
        period: cdk.Duration.minutes(5),
      }),

      // CPU 使用率のグラフウィジェット
      new cloudwatch.GraphWidget({
        title: 'EC2 CPU Utilization (%)',
        left: [cpuMetric],
        width: 12,
        height: 6,
        view: cloudwatch.GraphWidgetView.TIME_SERIES,
        period: cdk.Duration.minutes(5),
      }),
    );

    // ログクエリウィジェット
    // なぜログクエリウィジェットを使うのか？
    // CloudWatch Logs Insights を使ったクエリ結果をダッシュボードに埋め込むことで、
    // メトリクスだけでは分からない詳細な情報（エラーメッセージの内容、
    // リクエストの詳細など）をダッシュボード上で直接確認できます。
    dashboard.addWidgets(
      new cloudwatch.LogQueryWidget({
        title: 'Recent Application Errors',
        logGroupNames: [appLogGroup.logGroupName],
        queryLines: [
          'fields @timestamp, @message',
          'filter @message like /ERROR/',
          'sort @timestamp desc',
          'limit 20',
        ],
        width: 24,
        height: 6,
      }),
    );

    // =========================================================================
    // CfnOutputs（スタック出力）
    // =========================================================================
    // なぜ出力を定義するのか？
    // スタック出力により、デプロイ後に重要なリソース情報を簡単に確認できます。
    // また、他のスタックからクロススタック参照として利用することも可能です。
    new cdk.CfnOutput(this, 'DashboardName', {
      value: dashboard.dashboardName,
      description: 'CloudWatch Dashboard name for application monitoring',
    });

    new cdk.CfnOutput(this, 'ErrorAlarmArn', {
      value: errorAlarm.alarmArn,
      description: 'ARN of the high error rate CloudWatch Alarm',
    });

    new cdk.CfnOutput(this, 'CompositeAlarmArn', {
      value: compositeAlarm.alarmArn,
      description: 'ARN of the composite alarm combining CPU and error rate',
    });

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS Topic ARN for alarm notifications',
    });

    new cdk.CfnOutput(this, 'LogGroupName', {
      value: appLogGroup.logGroupName,
      description: 'CloudWatch Log Group name for application logs',
    });
  }
}
