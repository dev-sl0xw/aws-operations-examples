import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

// ============================================================================
// Auto Scalingスタック — 自動スケーリングの設計
// ============================================================================
//
// 【Auto Scaling Groupとは】
// EC2インスタンスのグループを管理し、需要に応じて自動的にインスタンス数を
// 増減させる仕組みです。以下の要素で構成されます：
//   - 起動テンプレート: どのようなEC2を起動するかの設定（AMI、インスタンスタイプ等）
//   - スケーリングポリシー: いつ、どれだけスケールするかのルール
//   - ヘルスチェック: 異常なインスタンスを自動的に置き換える
//
// 【スケーリングポリシーの種類】
//
// 1. ターゲット追跡スケーリング（Target Tracking）★推奨
//    「CPU使用率を70%に維持する」のように、目標値を設定するだけで
//    AWSが自動的にインスタンス数を調整する。最もシンプルで効果的。
//    サーモスタットのように動作する — 設定温度（目標値）を設定すれば、
//    エアコン（AWS）が自動的に調整してくれる。
//
// 2. ステップスケーリング
//    CloudWatchアラームに基づいて、段階的にスケールする。
//    例: CPU 70% → +1台、CPU 85% → +2台、CPU 95% → +3台
//    より細かい制御が必要な場合に使用する。
//
// 3. シンプルスケーリング（非推奨）
//    1つのアラームに1つのアクション。クールダウン期間中は
//    新しいスケーリングが発生しない。ターゲット追跡に置き換えられつつある。
//
// 4. スケジュールスケーリング
//    予測可能なトラフィックパターンに基づいて、事前にスケールする。
//    例: 平日の業務時間帯にスケールアップ、夜間・週末にスケールダウン。
//
// 【クールダウン期間とは】
// スケーリングアクション後、次のスケーリングを実行するまでの待機時間。
// スケールアウト後のインスタンスがメトリクスに反映されるまでの
// 時間を確保するために必要。短すぎるとオシレーション（不安定な
// 増減の繰り返し）が発生する。デフォルト300秒（5分）。
//
// 【ライフサイクルフックとは】
// インスタンスの起動/終了時に「一時停止」し、カスタム処理を実行する仕組み。
// 起動時のフック: ソフトウェアのインストール、設定の適用、テストの実行
// 終了時のフック: ログの退避、セッションのドレイン、クリーンアップ処理
// タイムアウト時間内に処理が完了しない場合、デフォルトの結果（CONTINUE/ABANDON）
// が適用される。
// ============================================================================

export interface AutoScalingStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  alb: elbv2.ApplicationLoadBalancer;
  albTargetGroup: elbv2.ApplicationTargetGroup;
}

export class AutoScalingStack extends cdk.Stack {
  public readonly asg: autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, props: AutoScalingStackProps) {
    super(scope, id, props);

    const { vpc, alb, albTargetGroup } = props;

    // ========================================================================
    // IAMロール — EC2インスタンスに付与する権限
    // ========================================================================
    // SSM（Systems Manager）で接続するために必要な権限。
    // SSMを使えばSSHキーの管理が不要になり、セキュリティが向上する。
    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
      description: 'EC2インスタンス用のIAMロール（SSMアクセス権限付き）',
    });

    // ========================================================================
    // セキュリティグループ — ネットワークレベルのアクセス制御
    // ========================================================================
    const instanceSg = new ec2.SecurityGroup(this, 'InstanceSecurityGroup', {
      vpc,
      description: 'Auto Scalingインスタンス用のセキュリティグループ',
      allowAllOutbound: true, // アウトバウンドは全許可（パッチ取得等）
    });

    // ALBからのHTTPトラフィックのみ許可（ALBのセキュリティグループからのみ受信）
    instanceSg.addIngressRule(
      ec2.Peer.securityGroupId(alb.connections.securityGroups[0].securityGroupId),
      ec2.Port.tcp(80),
      'ALBからのHTTPトラフィックを許可',
    );

    // ========================================================================
    // ユーザーデータスクリプト — インスタンス起動時の初期化
    // ========================================================================
    // 【ユーザーデータとは】
    // EC2インスタンスが初回起動時に実行するスクリプト。
    // ソフトウェアのインストール、設定ファイルの配置等を自動化する。
    // 注意: ユーザーデータは初回起動時のみ実行される（再起動時は実行されない）。
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -euxo pipefail',
      '',
      '# システムの更新',
      'yum update -y',
      '',
      '# nginxのインストールと起動',
      'amazon-linux-extras install nginx1 -y',
      'systemctl start nginx',
      'systemctl enable nginx',
      '',
      '# ヘルスチェック用のエンドポイントを作成',
      'cat > /usr/share/nginx/html/health <<\'HEALTH_EOF\'',
      '{"status": "healthy", "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"}',
      'HEALTH_EOF',
      '',
      '# インスタンスメタデータをトップページに表示（デバッグ用）',
      '# IMDSv2トークンを取得（セキュリティ強化のためIMDSv2を使用）',
      'TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")',
      'INSTANCE_ID=$(curl -sf -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)',
      'AZ=$(curl -sf -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/availability-zone)',
      'cat > /usr/share/nginx/html/index.html <<HTML_EOF',
      '<!DOCTYPE html>',
      '<html><body>',
      '<h1>Auto Scaling Demo</h1>',
      '<p>Instance ID: ${INSTANCE_ID}</p>',
      '<p>Availability Zone: ${AZ}</p>',
      '</body></html>',
      'HTML_EOF',
    );

    // ========================================================================
    // Auto Scaling Group の作成
    // ========================================================================
    this.asg = new autoscaling.AutoScalingGroup(this, 'AppAsg', {
      vpc,
      // プライベートサブネットに配置（インターネットからの直接アクセスを防ぐ）
      // ALB経由でのみアクセス可能にする
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },

      // 【インスタンスタイプの選択】
      // t3.micro: バースト可能なインスタンス。開発/テスト環境に最適。
      // 本番環境では m5.large や c5.xlarge 等、ワークロードに適したものを選ぶ。
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),

      // 【AMIの選択】
      // Amazon Linux 2は無料でAWSに最適化されたLinuxディストリビューション。
      // SSMエージェントが標準でインストールされている。
      machineImage: ec2.MachineImage.latestAmazonLinux2(),

      role: instanceRole,
      securityGroup: instanceSg,
      userData,
      requireImdsv2: true,

      // 【容量設定】
      // minCapacity: 最小インスタンス数。0にすると全停止のリスクがある。
      //              本番環境では最低2（AZあたり1台）を推奨。
      // maxCapacity: 最大インスタンス数。コスト上限の安全弁。
      //              予想されるピークトラフィックに十分な数を設定する。
      // desiredCapacity: 初期のインスタンス数。Auto Scalingが自動調整する。
      minCapacity: 1,
      maxCapacity: 4,
      desiredCapacity: 2,

      // 【ヘルスチェックの猶予期間】
      // インスタンス起動後、ヘルスチェックを開始するまでの待機時間。
      // ユーザーデータの実行やアプリケーションの起動に必要な時間を確保する。
      // 短すぎるとまだ起動中のインスタンスが異常と判定されてしまう。
      healthChecks: autoscaling.HealthChecks.ec2({
        gracePeriod: cdk.Duration.seconds(300),
      }),

      // 【クールダウン期間】
      // スケーリングアクション後、次のスケーリングを実行するまでの待機時間。
      // 新しいインスタンスがメトリクスに反映されるまでの時間を確保する。
      cooldown: cdk.Duration.seconds(300),
    });

    // ========================================================================
    // ALBターゲットグループへの登録
    // ========================================================================
    // ASGのインスタンスをALBのターゲットグループに自動的に登録する。
    // 新しいインスタンスが起動するとターゲットグループに追加され、
    // 終了するインスタンスは自動的に削除される。
    this.asg.attachToApplicationTargetGroup(albTargetGroup);

    // ========================================================================
    // ターゲット追跡スケーリングポリシー
    // ========================================================================
    // 【なぜターゲット追跡が最もシンプルか】
    // 「CPU使用率を70%に維持する」と宣言するだけで、AWSが自動的に
    // スケールアウト/インの判断を行う。CloudWatchアラームの作成も自動。
    //
    // 70%を選ぶ理由:
    //   - 100%に近すぎると、急なトラフィック増加時にスケールが間に合わない
    //   - 50%等低すぎると、過剰なインスタンスが維持されコストが増大する
    //   - 70%は、応答時間の維持とコスト効率のバランスが良い値
    this.asg.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      // クールダウン: スケールアウト後の安定化待ち時間
      cooldown: cdk.Duration.seconds(300),
      // スケールインのクールダウン（オプション）
      // スケールインはより慎重に行う（ユーザー体験に影響するため）
      estimatedInstanceWarmup: cdk.Duration.seconds(300),
    });

    // ========================================================================
    // スケジュールスケーリング — 業務時間帯の事前スケール
    // ========================================================================
    // 【予測可能なトラフィックパターンへの対応】
    // 業務アプリケーションは、平日9時〜18時にトラフィックが集中する。
    // 事前にスケールアップしておくことで、朝のトラフィック急増時に
    // ターゲット追跡のスケーリングを待つ必要がなくなる。
    //
    // スケジュール式はcron式で指定する:
    //   cron(分 時 日 月 曜日)
    //   曜日: 1=月曜日、5=金曜日（AWS cron式）

    // 平日の朝9時（UTC+9 = JST。UTCでは0時）にスケールアップ
    this.asg.scaleOnSchedule('ScaleUpMorning', {
      schedule: autoscaling.Schedule.cron({
        hour: '0',   // UTC 0:00 = JST 9:00
        minute: '0',
        weekDay: 'MON-FRI',
      }),
      minCapacity: 2,
      desiredCapacity: 3,
      maxCapacity: 4,
    });

    // 平日の夜18時（UTC+9 = JST。UTCでは9時）にスケールダウン
    this.asg.scaleOnSchedule('ScaleDownEvening', {
      schedule: autoscaling.Schedule.cron({
        hour: '9',   // UTC 9:00 = JST 18:00
        minute: '0',
        weekDay: 'MON-FRI',
      }),
      minCapacity: 1,
      desiredCapacity: 1,
      maxCapacity: 4,
    });

    // ========================================================================
    // ライフサイクルフック — インスタンス起動時のカスタム初期化
    // ========================================================================
    // 【ライフサイクルフックの動作】
    // 1. ASGが新しいインスタンスを起動する
    // 2. 起動フックにより、インスタンスは「Pending:Wait」状態で一時停止
    // 3. カスタム初期化処理を実行（Lambda、SSM等で実装）
    //    例: 設定管理ツールの適用、シークレットの配置、テストの実行
    // 4. 処理完了後、CONTINUE シグナルを送信してインスタンスを稼働開始
    // 5. タイムアウト（ここでは300秒）以内にシグナルがない場合は
    //    defaultResult の動作が適用される
    //
    // defaultResult の選択:
    //   CONTINUE: タイムアウトしてもインスタンスをサービスインする
    //             （初期化が必須でない場合）
    //   ABANDON: タイムアウトしたらインスタンスを終了する
    //            （初期化が必須の場合、不完全なインスタンスを防ぐ）
    this.asg.addLifecycleHook('LaunchHook', {
      lifecycleTransition: autoscaling.LifecycleTransition.INSTANCE_LAUNCHING,
      heartbeatTimeout: cdk.Duration.seconds(300),
      defaultResult: autoscaling.DefaultResult.CONTINUE,
    });

    // ========================================================================
    // CfnOutputs
    // ========================================================================
    new cdk.CfnOutput(this, 'AsgName', {
      value: this.asg.autoScalingGroupName,
      description: 'Auto Scaling Groupの名前',
      exportName: 'NetworkingAsgName',
    });

    new cdk.CfnOutput(this, 'AsgArn', {
      value: this.asg.autoScalingGroupArn,
      description: 'Auto Scaling GroupのARN',
    });
  }
}
