import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';

// =============================================================================
// CloudWatch ダッシュボード・アラームスタック
// CloudWatch 대시보드・알람 스택
// =============================================================================
// なぜ CloudWatch を使うのか？
// 왜 CloudWatch를 사용하는가?
// CloudWatch は AWS のネイティブ監視サービスであり、メトリクス収集、
// CloudWatch는 AWS의 네이티브 감시 서비스이며, 메트릭 수집,
// ログ集約、アラーム通知を統合的に管理できます。
// 로그 집약, 알람 통지를 통합적으로 관리할 수 있습니다.
// 個別の監視ツールを組み合わせるよりも、AWSサービスとのシームレスな統合が
// 개별 감시 도구를 조합하는 것보다, AWS 서비스와의 원활한 통합이
// 可能であり、運用の複雑さを大幅に削減できます。
// 가능하며, 운영의 복잡성을 크게 줄일 수 있습니다.
// =============================================================================

export class CloudWatchDashboardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // ロググループの作成（30日間保持）
    // 로그 그룹 생성 (30일간 보존)
    // =========================================================================
    // なぜ保持期間を設定するのか？
    // 왜 보존 기간을 설정하는가?
    // ログの無制限保持はストレージコストを増大させます。
    // 로그의 무제한 보존은 스토리지 비용을 증가시킵니다.
    // 30日間は多くのアプリケーションにとって、障害調査やトレンド分析に
    // 30일간은 많은 애플리케이션에 있어서, 장애 조사나 트렌드 분석에
    // 十分な期間です。コンプライアンス要件がある場合は、S3へのエクスポートで
    // 충분한 기간입니다. 컴플라이언스 요건이 있는 경우, S3로의 Export로
    // 長期保存することを推奨します。
    // 장기 보존하는 것을 권장합니다.
    const appLogGroup = new logs.LogGroup(this, 'ApplicationLogGroup', {
      logGroupName: '/app/monitoring-example',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // =========================================================================
    // メトリクスフィルターの作成（ERRORログのカウント）
    // 메트릭 필터 생성 (ERROR 로그 카운트)
    // =========================================================================
    // なぜメトリクスフィルターを使うのか？
    // 왜 메트릭 필터를 사용하는가?
    // ログの中から特定のパターン（例: ERROR）を自動的に検出し、
    // 로그 중에서 특정 패턴(예: ERROR)을 자동으로 감지하고,
    // 数値メトリクスとして集計することで、アラームやグラフでの利用が可能になります。
    // 수치 메트릭으로 집계함으로써, 알람이나 그래프에서의 활용이 가능해집니다.
    // これにより「ログを目視で確認する」という運用から脱却し、
    // 이를 통해 "로그를 육안으로 확인하는" 운영에서 벗어나,
    // 問題の早期検知を自動化できます。
    // 문제의 조기 감지를 자동화할 수 있습니다.
    const errorMetricFilter = new logs.MetricFilter(this, 'ErrorMetricFilter', {
      logGroup: appLogGroup,
      filterPattern: logs.FilterPattern.literal('ERROR'),
      metricNamespace: 'MonitoringExample',
      metricName: 'ApplicationErrorCount',
      metricValue: '1',
      defaultValue: 0,
    });

    // メトリクスフィルターから CloudWatch メトリクスを取得
    // 메트릭 필터에서 CloudWatch 메트릭을 취득
    const errorMetric = errorMetricFilter.metric({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // =========================================================================
    // SNS トピックの作成（アラーム通知先）
    // SNS 토픽 생성 (알람 통지 대상)
    // =========================================================================
    // なぜ SNS を使うのか？
    // 왜 SNS를 사용하는가?
    // SNS はアラーム通知のハブとして機能し、メール、SMS、Slack（Lambda経由）、
    // SNS는 알람 통지의 허브로 기능하며, 이메일, SMS, Slack(Lambda 경유),
    // PagerDuty など、複数の通知チャネルに同時に配信できます。
    // PagerDuty 등, 복수의 통지 채널에 동시에 배포할 수 있습니다.
    // アラームと通知先を疎結合にすることで、通知方法の変更が容易になります。
    // 알람과 통지 대상을 느슨한 결합으로 함으로써, 통지 방법의 변경이 용이해집니다.
    const alarmTopic = new sns.Topic(this, 'AlarmNotificationTopic', {
      topicName: 'monitoring-alarm-notifications',
      displayName: 'Monitoring Alarm Notifications',
    });

    // =========================================================================
    // CloudWatch アラームの作成（エラー数しきい値: 5分間に10回以上）
    // CloudWatch 알람 생성 (오류 수 임계값: 5분간 10회 이상)
    // =========================================================================
    // なぜアラームを設定するのか？
    // 왜 알람을 설정하는가?
    // アラームは、メトリクスが定義されたしきい値を超えた際に自動的に通知を
    // 알람은, 메트릭이 정의된 임계값을 초과했을 때 자동으로 통지를
    // トリガーします。人間が常時監視する必要がなくなり、異常が発生した時のみ
    // 트리거합니다. 사람이 상시 감시할 필요가 없어지며, 이상이 발생했을 때만
    // 対応すればよくなります。
    // 대응하면 됩니다.
    // しきい値の設定は、アプリケーションの通常のエラー率を考慮して決定します。
    // 임계값의 설정은, 애플리케이션의 통상적인 오류율을 고려하여 결정합니다.
    // 低すぎると誤報（ノイズ）が増え、高すぎると検知が遅れます。
    // 너무 낮으면 오보(노이즈)가 늘어나고, 너무 높으면 감지가 늦어집니다.
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
    // 알람 발보 시 SNS 토픽으로 통지
    errorAlarm.addAlarmAction(
      new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic)
    );

    // =========================================================================
    // CPU 使用率のメトリクス（ダッシュボード用）
    // CPU 사용률 메트릭 (대시보드용)
    // =========================================================================
    // なぜ CPU メトリクスを監視するのか？
    // 왜 CPU 메트릭을 감시하는가?
    // CPU 使用率はシステムの負荷状態を示す基本的な指標です。
    // CPU 사용률은 시스템의 부하 상태를 나타내는 기본적인 지표입니다.
    // 高い CPU 使用率が継続すると、レスポンス遅延やタイムアウトの原因となります。
    // 높은 CPU 사용률이 지속되면, 응답 지연이나 타임아웃의 원인이 됩니다.
    // EC2 インスタンス全体の平均 CPU を監視することで、
    // EC2 인스턴스 전체의 평균 CPU를 감시함으로써,
    // スケーリングの必要性を判断できます。
    // 스케일링의 필요성을 판단할 수 있습니다.
    const cpuMetric = new cloudwatch.Metric({
      namespace: 'AWS/EC2',
      metricName: 'CPUUtilization',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    // CPU 使用率のアラーム
    // CPU 사용률 알람
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
    // 복합 알람 (높은 CPU + 높은 오류율)
    // =========================================================================
    // なぜ複合アラームを使うのか？
    // 왜 복합 알람을 사용하는가?
    // 単一のアラームだけでは、一時的なスパイクでも通知されてしまい、
    // 단일 알람만으로는, 일시적인 스파이크에도 통지되어 버려,
    // 運用チームが「アラーム疲れ」に陥る危険があります。
    // 운영 팀이 "알람 피로"에 빠질 위험이 있습니다.
    // 複合アラームは複数の条件を組み合わせることで、
    // 복합 알람은 복수의 조건을 조합함으로써,
    // 本当に対応が必要な状況のみを通知できます。
    // 정말로 대응이 필요한 상황만을 통지할 수 있습니다.
    // 例: CPU使用率が高い AND エラーも増加している → 深刻な問題の可能性が高い
    // 예: CPU 사용률이 높고 AND 오류도 증가하고 있다 → 심각한 문제의 가능성이 높다
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
    // CloudWatch 대시보드 생성
    // =========================================================================
    // なぜダッシュボードを作成するのか？
    // 왜 대시보드를 생성하는가?
    // ダッシュボードは複数のメトリクスやログを一つの画面に集約し、
    // 대시보드는 복수의 메트릭이나 로그를 하나의 화면에 집약하여,
    // システム全体の健全性を一目で把握できるようにします。
    // 시스템 전체의 건전성을 한눈에 파악할 수 있도록 합니다.
    // 障害発生時に複数の AWS コンソール画面を切り替える必要がなくなり、
    // 장애 발생 시 여러 AWS 콘솔 화면을 전환할 필요가 없어지며,
    // 平均復旧時間（MTTR）の短縮に貢献します。
    // 평균 복구 시간(MTTR)의 단축에 기여합니다.
    const dashboard = new cloudwatch.Dashboard(this, 'MonitoringDashboard', {
      dashboardName: 'ApplicationMonitoringDashboard',
    });

    // エラーメトリクスのグラフウィジェット
    // 오류 메트릭 그래프 위젯
    // なぜグラフを使うのか？
    // 왜 그래프를 사용하는가?
    // 数値だけでなく時系列のトレンドを視覚化することで、
    // 수치뿐만 아니라 시계열 트렌드를 시각화함으로써,
    // 「いつから問題が始まったか」「悪化しているか改善しているか」を
    // "언제부터 문제가 시작되었는가" "악화되고 있는가 개선되고 있는가"를
    // 直感的に判断できます。
    // 직감적으로 판단할 수 있습니다.
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
      // CPU 사용률 그래프 위젯
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
    // 로그 쿼리 위젯
    // なぜログクエリウィジェットを使うのか？
    // 왜 로그 쿼리 위젯을 사용하는가?
    // CloudWatch Logs Insights を使ったクエリ結果をダッシュボードに埋め込むことで、
    // CloudWatch Logs Insights를 사용한 쿼리 결과를 대시보드에 삽입함으로써,
    // メトリクスだけでは分からない詳細な情報（エラーメッセージの内容、
    // 메트릭만으로는 알 수 없는 상세 정보(오류 메시지의 내용,
    // リクエストの詳細など）をダッシュボード上で直接確認できます。
    // 요청의 상세 등)를 대시보드 상에서 직접 확인할 수 있습니다.
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
    // CfnOutputs (스택 출력)
    // =========================================================================
    // なぜ出力を定義するのか？
    // 왜 출력을 정의하는가?
    // スタック出力により、デプロイ後に重要なリソース情報を簡単に確認できます。
    // 스택 출력을 통해, 배포 후 중요한 리소스 정보를 간단히 확인할 수 있습니다.
    // また、他のスタックからクロススタック参照として利用することも可能です。
    // 또한, 다른 스택에서 크로스 스택 참조로 이용하는 것도 가능합니다.
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
