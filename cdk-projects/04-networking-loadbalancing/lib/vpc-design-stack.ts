import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

// ============================================================================
// VPC設計スタック — ネットワークの基盤
// ============================================================================
//
// 【なぜVPCが必要か】
// VPC（Virtual Private Cloud）は、AWS上に作る自分専用の仮想ネットワークです。
// インターネットから隔離された安全な環境で、アプリケーションやデータベースを
// 配置できます。CIDRブロックでIPアドレスの範囲を定義し、サブネットで
// ネットワークをさらに分割して、セキュリティと通信制御を実現します。
//
// 【サブネット設計の考え方 — 3層アーキテクチャ】
//
// パブリックサブネット（PUBLIC）:
//   - インターネットゲートウェイ（IGW）へのルートを持つサブネット
//   - ALB（ロードバランサー）やNATゲートウェイを配置する
//   - 直接インターネットからアクセスできるため、最小限のリソースのみ置く
//   - EC2を直接置くのはセキュリティ上推奨されない
//
// プライベートサブネット（PRIVATE_WITH_EGRESS）:
//   - インターネットへの「出口」はあるが、外部からの「入口」はない
//   - NATゲートウェイ経由でインターネットにアクセスする（パッチ取得、API呼び出し等）
//   - アプリケーションサーバー（EC2、ECS、Lambda）を配置する主要な場所
//   - 外部からの直接アクセスはALB経由でのみ許可する
//
// アイソレートサブネット（PRIVATE_ISOLATED）:
//   - インターネットへの接続が一切ないサブネット
//   - RDS、ElastiCache等のデータストアを配置する
//   - 最も高いセキュリティレベル — データの外部流出リスクを最小化
//   - VPCエンドポイント経由でのみAWSサービスにアクセス可能
//
// 【なぜAZごとにNATゲートウェイが必要か】
// NATゲートウェイを1つだけ配置すると、そのAZに障害が発生した場合、
// 他のAZのプライベートサブネットからもインターネットに出られなくなります。
// 高可用性を確保するには、各AZに1つずつNATゲートウェイを配置します。
// ただし、NATゲートウェイは月額約$45/個のコストがかかるため、
// 開発環境ではnatGateways: 1 でコスト削減することもあります。
//
// 【VPCエンドポイントとは】
// 通常、VPC内からAWSサービス（S3、DynamoDB等）にアクセスするには
// インターネット経由で通信します。VPCエンドポイントを使うと、
// AWS内部ネットワークを通じて直接アクセスでき、以下のメリットがあります：
//   - セキュリティ向上: データがインターネットを通過しない
//   - レイテンシ低減: AWS内部ネットワークは高速
//   - コスト削減: NAT Gatewayのデータ処理料金を回避
//
// ゲートウェイエンドポイント vs インターフェースエンドポイント:
//   - ゲートウェイエンドポイント（S3、DynamoDB専用）:
//       ルートテーブルにエントリを追加する方式
//       無料で利用可能
//       VPC内の全サブネットから自動的に利用できる
//   - インターフェースエンドポイント（PrivateLink）:
//       サブネット内にENI（ネットワークインターフェース）を作成する方式
//       時間あたり＋データ転送量の料金が発生
//       セキュリティグループで制御可能
//       SSM、CloudWatch、ECR等の多くのAWSサービスに対応
// ============================================================================

export class VpcDesignStack extends cdk.Stack {
  // 他のスタックからVPCを参照できるようにパブリックプロパティとして公開する
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================================================
    // VPC本体の作成
    // ========================================================================
    // CIDR 10.0.0.0/16 は約65,536個のIPアドレスを提供する。
    // 企業の本番環境では十分な範囲だが、VPCピアリングやTransit Gateway
    // を使う場合はCIDRが重複しないように注意が必要。
    this.vpc = new ec2.Vpc(this, 'MainVpc', {
      // 【IPアドレス範囲】
      // /16 = 65,536 IPs。サブネットに分割して使う。
      // 各サブネットは /24（256 IPs）や /20（4,096 IPs）に分割される。
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),

      // 【アベイラビリティゾーン数】
      // 2 AZs = 高可用性の最低ライン。本番環境では3 AZsが推奨。
      // AZはデータセンターの物理的な障害ドメイン。
      maxAzs: 2,

      // 【NATゲートウェイ数】
      // AZごとに1つ配置して、AZ障害時の可用性を確保する。
      // 開発環境では 1 に減らしてコスト削減できる（月$45/個の節約）。
      natGateways: 2,

      // 【サブネット構成 — 3層設計】
      subnetConfiguration: [
        {
          // パブリックサブネット: ALBとNATゲートウェイの配置場所
          // インターネットゲートウェイへのルートが自動設定される
          subnetType: ec2.SubnetType.PUBLIC,
          name: 'Public',
          cidrMask: 24, // 各AZに /24 = 256 IPs
        },
        {
          // プライベートサブネット: アプリケーション層
          // NATゲートウェイ経由でインターネットにアクセス可能
          // 外部パッケージのダウンロード、外部APIの呼び出しに必要
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          name: 'Private',
          cidrMask: 24,
        },
        {
          // アイソレートサブネット: データベース層
          // インターネットへの接続なし — 最も安全な配置場所
          // RDS、ElastiCache、Redshift等のデータストアに最適
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          name: 'Isolated',
          cidrMask: 24,
        },
      ],
    });

    // ========================================================================
    // VPC Flow Logs — ネットワーク通信の監視
    // ========================================================================
    // VPC Flow Logsは、VPC内のネットワークインターフェースを通過する
    // IPトラフィックの情報をキャプチャする機能です。
    // セキュリティ分析、ネットワークトラブルシューティング、
    // コンプライアンス監査に不可欠です。
    //
    // 【なぜ14日保持か】
    // - セキュリティインシデントの調査には直近のログが必要
    // - 長期保存はS3に転送してコスト最適化する（別途設定）
    // - CloudWatch Logsの保存コストは比較的高いため、保持期間を制限する

    const flowLogGroup = new logs.LogGroup(this, 'VpcFlowLogGroup', {
      logGroupName: `/vpc/flow-logs/${this.vpc.vpcId}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 開発環境用。本番では RETAIN を推奨
    });

    const flowLogRole = new iam.Role(this, 'VpcFlowLogRole', {
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    this.vpc.addFlowLog('FlowLogToCloudWatch', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup, flowLogRole),
      // ALL = 許可・拒否の両方のトラフィックを記録
      // REJECT のみにすると、拒否されたトラフィックだけ記録（コスト削減）
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    // ========================================================================
    // VPCゲートウェイエンドポイント — S3へのプライベートアクセス
    // ========================================================================
    // 【ゲートウェイエンドポイントの仕組み】
    // ルートテーブルにプレフィックスリスト（S3のIP範囲）へのルートを追加する。
    // トラフィックはAWSの内部ネットワークを経由するため、
    // インターネットを通過せず、NATゲートウェイの料金も発生しない。
    //
    // 【なぜ無料なのか】
    // ゲートウェイエンドポイントはルートテーブルの設定変更のみで実現される。
    // ENI（ネットワークインターフェース）を作成しないため、コストがかからない。
    // S3とDynamDBのみが対応している（AWSの戦略的な判断）。
    const s3Endpoint = this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      // 全サブネットタイプからS3にアクセスできるようにする
      subnets: [
        { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    // ========================================================================
    // VPCインターフェースエンドポイント — SSMへのプライベートアクセス
    // ========================================================================
    // 【インターフェースエンドポイント（PrivateLink）の仕組み】
    // 指定したサブネットにENI（Elastic Network Interface）を作成し、
    // プライベートIPアドレスを割り当てる。DNSが自動的に解決されるため、
    // アプリケーションのコード変更なしでプライベート通信に切り替わる。
    //
    // 【SSMエンドポイントが必要な理由】
    // SSM（Systems Manager）を使うと、SSH不要でEC2にアクセスできる。
    // ただし、SSMエージェントがSSMサービスに通信する必要がある。
    // プライベートサブネットのEC2からSSMを使う場合、以下の3つの
    // エンドポイントが必要：
    //   - ssm: SSM APIへのアクセス
    //   - ssmmessages: Session Manager用
    //   - ec2messages: Run Command用
    //
    // 【コストに注意】
    // インターフェースエンドポイントは AZ あたり約 $7.2/月 + データ転送料。
    // 3つのSSMエンドポイント × 2 AZ = 約 $43.2/月 の固定コスト。
    // 必要なエンドポイントのみ作成すること。

    const ssmEndpoint = this.vpc.addInterfaceEndpoint('SsmEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      // プライベートサブネットにのみENIを作成する
      // （アイソレートサブネットからも利用したい場合はそちらにも追加）
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      // プライベートDNSを有効にすると、ssm.<region>.amazonaws.com への
      // リクエストが自動的にエンドポイントのプライベートIPに解決される
      privateDnsEnabled: true,
    });

    // SSM Session Manager用のエンドポイント
    const ssmMessagesEndpoint = this.vpc.addInterfaceEndpoint('SsmMessagesEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // SSM Run Command用のエンドポイント
    const ec2MessagesEndpoint = this.vpc.addInterfaceEndpoint('Ec2MessagesEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // ========================================================================
    // CfnOutputs — スタック間の値の受け渡しとデバッグ
    // ========================================================================
    // CfnOutputはCloudFormationの出力値。他のスタックからの参照や、
    // デプロイ後の確認に使用する。

    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: 'NetworkingVpcId',
    });

    // パブリックサブネットID一覧
    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: this.vpc.publicSubnets.map(s => s.subnetId).join(','),
      description: 'パブリックサブネットのID一覧（ALB、NATゲートウェイ配置用）',
      exportName: 'NetworkingPublicSubnetIds',
    });

    // プライベートサブネットID一覧
    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: this.vpc.privateSubnets.map(s => s.subnetId).join(','),
      description: 'プライベートサブネットのID一覧（アプリケーション配置用）',
      exportName: 'NetworkingPrivateSubnetIds',
    });

    // アイソレートサブネットID一覧
    new cdk.CfnOutput(this, 'IsolatedSubnetIds', {
      value: this.vpc.isolatedSubnets.map(s => s.subnetId).join(','),
      description: 'アイソレートサブネットのID一覧（データベース配置用）',
      exportName: 'NetworkingIsolatedSubnetIds',
    });

    // VPCエンドポイントID
    new cdk.CfnOutput(this, 'S3EndpointId', {
      value: s3Endpoint.vpcEndpointId,
      description: 'S3ゲートウェイエンドポイントのID（無料、ルートテーブル方式）',
    });

    new cdk.CfnOutput(this, 'SsmEndpointId', {
      value: ssmEndpoint.vpcEndpointId,
      description: 'SSMインターフェースエンドポイントのID（PrivateLink、ENI方式）',
    });
  }
}
