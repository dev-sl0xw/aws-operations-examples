import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

// ============================================================================
// ALB・NLBスタック — ロードバランサーの設計
// ============================================================================
//
// 【ALB（Application Load Balancer）— L7ロードバランサー】
// ALBはOSI参照モデルのレイヤー7（アプリケーション層）で動作します。
// HTTPリクエストの中身（パス、ヘッダー、ホスト名等）を理解して、
// リクエストを適切なターゲットにルーティングできます。
//
// 主な用途:
//   - パスベースルーティング: /api/* → APIサーバー群、/web/* → Webサーバー群
//   - ホストベースルーティング: api.example.com → API、www.example.com → Web
//   - HTTPSの終端（SSL/TLS Termination）
//   - WebSocket、HTTP/2のサポート
//
// 【NLB（Network Load Balancer）— L4ロードバランサー】
// NLBはレイヤー4（トランスポート層）で動作します。
// TCP/UDPレベルでパケットを転送するため、非常に高いパフォーマンスを発揮します。
//
// 主な用途:
//   - 超低レイテンシが必要な場合（金融取引システム等）
//   - TCP/UDPプロトコルのロードバランシング
//   - 静的IPアドレスが必要な場合
//   - 毎秒数百万リクエストの処理
//
// 【ヘルスチェックの重要性】
// ヘルスチェックは、ターゲット（EC2インスタンス等）が正常に動作しているか
// 定期的に確認する仕組みです。異常なターゲットは自動的にルーティング対象から
// 外され、新しいリクエストが送られなくなります。
//
// 適切なヘルスチェック設定のポイント:
//   - interval: チェック間隔（短すぎるとEC2に負荷、長すぎると障害検出が遅い）
//   - healthyThresholdCount: 正常判定に必要な連続成功回数
//   - unhealthyThresholdCount: 異常判定に必要な連続失敗回数
//   - path: アプリケーションの深い部分まで確認するパスを指定する
//           （DB接続確認も含む /health/deep 等が理想的）
// ============================================================================

// 他のスタック（特にAutoScalingスタック）にVPCとターゲットグループを渡すためのインターフェース
export interface AlbNlbStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class AlbNlbStack extends cdk.Stack {
  // AutoScalingスタックからターゲットグループを参照するために公開
  public readonly albTargetGroup: elbv2.ApplicationTargetGroup;
  public readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: AlbNlbStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    // ========================================================================
    // ALB（Application Load Balancer）の作成
    // ========================================================================
    // 【パブリックサブネットに配置する理由】
    // ALBはインターネットからのリクエストを受け付けるため、
    // パブリックサブネットに配置する必要がある。
    // 内部ALB（internal: true）の場合はプライベートサブネットに配置する。
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'AppAlb', {
      vpc,
      internetFacing: true, // インターネット向け（パブリック）
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      // ALBは最低2つのAZに配置する必要がある（高可用性のため）
    });

    // ========================================================================
    // HTTPSリダイレクト（ポート80 → 443）
    // ========================================================================
    // 【なぜリダイレクトが必要か】
    // ユーザーがHTTP（ポート80）でアクセスした場合、自動的にHTTPS（ポート443）
    // にリダイレクトすることで、通信の暗号化を強制する。
    // これはセキュリティのベストプラクティスであり、多くの規制要件でも求められる。
    //
    // 注意: 本番環境ではACM証明書を使ったHTTPSリスナーも必要。
    // ここではHTTPリスナーのみデモとして作成する。
    this.alb.addRedirect({
      sourceProtocol: elbv2.ApplicationProtocol.HTTP,
      sourcePort: 80,
      targetProtocol: elbv2.ApplicationProtocol.HTTPS,
      targetPort: 443,
    });

    // ========================================================================
    // HTTPリスナー（ポート80）— パスベースルーティングのデモ
    // ========================================================================
    // 【デフォルトアクション】
    // どのルーティングルールにもマッチしないリクエストに対する応答を定義する。
    // 固定レスポンスを返すことで、不正なリクエストに対して適切に応答する。
    const httpListener = this.alb.addListener('HttpListener', {
      port: 80,
      open: true, // 0.0.0.0/0 からのアクセスを許可
      defaultAction: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'text/plain',
        messageBody: 'OK - Default Response from ALB',
      }),
    });

    // ========================================================================
    // ターゲットグループの作成
    // ========================================================================
    // 【ターゲットグループとは】
    // ロードバランサーがリクエストを転送する先のグループ。
    // EC2インスタンス、ECSタスク、Lambda関数等を登録できる。
    // ヘルスチェックの設定もここで行う。
    this.albTargetGroup = new elbv2.ApplicationTargetGroup(this, 'ApiTargetGroup', {
      vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.INSTANCE,

      // 【ヘルスチェック設定】
      // healthyHttpCodes: '200' — HTTPステータス200のみを正常とみなす
      // interval: 30秒ごとにチェック（デフォルト）
      // healthyThresholdCount: 2回連続成功で正常と判定
      // unhealthyThresholdCount: 3回連続失敗で異常と判定
      // timeout: 5秒以内に応答がなければ失敗
      // path: /health — アプリケーションのヘルスチェック用エンドポイント
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: '200',
      },
    });

    // ========================================================================
    // パスベースルーティングルール
    // ========================================================================
    // 【パスベースルーティングの使い方】
    // URLのパスに基づいてリクエストを異なるターゲットグループに振り分ける。
    // マイクロサービスアーキテクチャで特に有効：
    //   - /api/*    → APIサービスのターゲットグループ
    //   - /admin/*  → 管理画面のターゲットグループ
    //   - /static/* → S3へのリダイレクト
    //
    // 優先度（priority）が低い数値ほど先に評価される。

    // ルール1: /api/* パスへのリクエストをAPIターゲットグループに転送
    httpListener.addAction('ApiRoute', {
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/api/*']),
      ],
      action: elbv2.ListenerAction.forward([this.albTargetGroup]),
    });

    // ルール2: /health パスへのリクエストに固定200レスポンスを返す
    // ALB自体のヘルスチェック用。外部監視ツールからの確認に使用する。
    httpListener.addAction('HealthRoute', {
      priority: 20,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/health']),
      ],
      action: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'application/json',
        messageBody: '{"status": "healthy", "service": "alb"}',
      }),
    });

    // ========================================================================
    // NLB（Network Load Balancer）の作成
    // ========================================================================
    // 【NLBを使う場面】
    // - TCP/UDPレベルのロードバランシングが必要な場合
    // - 超低レイテンシ（ALBよりも高速）が求められる場合
    // - 静的IPアドレスが必要な場合（ファイアウォールのホワイトリスト用）
    // - gRPC、MQTT、その他のTCPプロトコルを使用する場合
    //
    // 【ALBとNLBの選択基準】
    // ALBを選ぶ: HTTP/HTTPSトラフィック、パスベースルーティング、WebSocket
    // NLBを選ぶ: TCP/UDP、超低レイテンシ、静的IP、極端に高いスループット
    const nlb = new elbv2.NetworkLoadBalancer(this, 'AppNlb', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      // crossZoneEnabled: true にすると、AZ間の負荷分散が均等になる
      // ただし、AZ間のデータ転送料金が発生する点に注意
      crossZoneEnabled: true,
    });

    // NLBターゲットグループ（TCP）
    const nlbTargetGroup = new elbv2.NetworkTargetGroup(this, 'TcpTargetGroup', {
      vpc,
      port: 443,
      protocol: elbv2.Protocol.TCP,
      targetType: elbv2.TargetType.INSTANCE,
      // NLBのヘルスチェックはTCPレベル（ポートが開いているかの確認）
      // HTTPヘルスチェックも設定可能だが、TCPのほうが軽量
      healthCheck: {
        protocol: elbv2.Protocol.TCP,
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 3,
        unhealthyThresholdCount: 3,
      },
    });

    // NLBリスナー（ポート443、TCP）
    nlb.addListener('TcpListener', {
      port: 443,
      defaultTargetGroups: [nlbTargetGroup],
    });

    // ========================================================================
    // CfnOutputs
    // ========================================================================
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      description: 'ALBのDNS名（HTTPアクセス用）',
      exportName: 'NetworkingAlbDnsName',
    });

    new cdk.CfnOutput(this, 'AlbArn', {
      value: this.alb.loadBalancerArn,
      description: 'ALBのARN',
    });

    new cdk.CfnOutput(this, 'NlbDnsName', {
      value: nlb.loadBalancerDnsName,
      description: 'NLBのDNS名（TCPアクセス用）',
      exportName: 'NetworkingNlbDnsName',
    });
  }
}
