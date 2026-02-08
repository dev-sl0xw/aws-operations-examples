import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

// ============================================================================
// VPC設計スタック — ネットワークの基盤
// VPC 설계 스택 — 네트워크의 기반
// ============================================================================
//
// 【なぜVPCが必要か】
// 【왜 VPC가 필요한가】
// VPC（Virtual Private Cloud）は、AWS上に作る自分専用の仮想ネットワークです。
// VPC(Virtual Private Cloud)는, AWS 위에 만드는 자신 전용의 가상 네트워크입니다.
// インターネットから隔離された安全な環境で、アプリケーションやデータベースを
// 인터넷으로부터 격리된 안전한 환경에서, 애플리케이션이나 데이터베이스를
// 配置できます。CIDRブロックでIPアドレスの範囲を定義し、サブネットで
// 배치할 수 있습니다. CIDR 블록으로 IP 주소 범위를 정의하고, 서브넷으로
// ネットワークをさらに分割して、セキュリティと通信制御を実現します。
// 네트워크를 더 분할하여, 보안과 통신 제어를 실현합니다.
//
// 【サブネット設計の考え方 — 3層アーキテクチャ】
// 【서브넷 설계의 사고방식 — 3계층 아키텍처】
//
// パブリックサブネット（PUBLIC）:
// 퍼블릭 서브넷 (PUBLIC):
//   - インターネットゲートウェイ（IGW）へのルートを持つサブネット
//   - 인터넷 게이트웨이(IGW)로의 라우트를 가지는 서브넷
//   - ALB（ロードバランサー）やNATゲートウェイを配置する
//   - ALB(로드 밸런서)나 NAT 게이트웨이를 배치한다
//   - 直接インターネットからアクセスできるため、最小限のリソースのみ置く
//   - 직접 인터넷에서 액세스할 수 있기 때문에, 최소한의 리소스만 배치한다
//   - EC2を直接置くのはセキュリティ上推奨されない
//   - EC2를 직접 배치하는 것은 보안상 권장되지 않는다
//
// プライベートサブネット（PRIVATE_WITH_EGRESS）:
// 프라이빗 서브넷 (PRIVATE_WITH_EGRESS):
//   - インターネットへの「出口」はあるが、外部からの「入口」はない
//   - 인터넷으로의 "출구"는 있지만, 외부에서의 "입구"는 없다
//   - NATゲートウェイ経由でインターネットにアクセスする（パッチ取得、API呼び出し等）
//   - NAT 게이트웨이 경유로 인터넷에 액세스한다 (패치 취득, API 호출 등)
//   - アプリケーションサーバー（EC2、ECS、Lambda）を配置する主要な場所
//   - 애플리케이션 서버(EC2, ECS, Lambda)를 배치하는 주요 장소
//   - 外部からの直接アクセスはALB経由でのみ許可する
//   - 외부에서의 직접 액세스는 ALB 경유로만 허가한다
//
// アイソレートサブネット（PRIVATE_ISOLATED）:
// 아이솔레이트 서브넷 (PRIVATE_ISOLATED):
//   - インターネットへの接続が一切ないサブネット
//   - 인터넷으로의 연결이 일절 없는 서브넷
//   - RDS、ElastiCache等のデータストアを配置する
//   - RDS, ElastiCache 등의 데이터 스토어를 배치한다
//   - 最も高いセキュリティレベル — データの外部流出リスクを最小化
//   - 가장 높은 보안 레벨 — 데이터의 외부 유출 리스크를 최소화
//   - VPCエンドポイント経由でのみAWSサービスにアクセス可能
//   - VPC 엔드포인트 경유로만 AWS 서비스에 액세스 가능
//
// 【なぜAZごとにNATゲートウェイが必要か】
// 【왜 AZ마다 NAT 게이트웨이가 필요한가】
// NATゲートウェイを1つだけ配置すると、そのAZに障害が発生した場合、
// NAT 게이트웨이를 1개만 배치하면, 해당 AZ에 장애가 발생한 경우,
// 他のAZのプライベートサブネットからもインターネットに出られなくなります。
// 다른 AZ의 프라이빗 서브넷에서도 인터넷에 나갈 수 없게 됩니다.
// 高可用性を確保するには、各AZに1つずつNATゲートウェイを配置します。
// 고가용성을 확보하려면, 각 AZ에 1개씩 NAT 게이트웨이를 배치합니다.
// ただし、NATゲートウェイは月額約$45/個のコストがかかるため、
// 다만, NAT 게이트웨이는 월 약 $45/개의 비용이 발생하므로,
// 開発環境ではnatGateways: 1 でコスト削減することもあります。
// 개발 환경에서는 natGateways: 1로 비용 절감하는 경우도 있습니다.
//
// 【VPCエンドポイントとは】
// 【VPC 엔드포인트란】
// 通常、VPC内からAWSサービス（S3、DynamoDB等）にアクセスするには
// 통상, VPC 내에서 AWS 서비스(S3, DynamoDB 등)에 액세스하려면
// インターネット経由で通信します。VPCエンドポイントを使うと、
// 인터넷 경유로 통신합니다. VPC 엔드포인트를 사용하면,
// AWS内部ネットワークを通じて直接アクセスでき、以下のメリットがあります：
// AWS 내부 네트워크를 통해 직접 액세스할 수 있으며, 다음과 같은 이점이 있습니다:
//   - セキュリティ向上: データがインターネットを通過しない
//   - 보안 향상: 데이터가 인터넷을 통과하지 않는다
//   - レイテンシ低減: AWS内部ネットワークは高速
//   - 레이턴시 저감: AWS 내부 네트워크는 고속
//   - コスト削減: NAT Gatewayのデータ処理料金を回避
//   - 비용 절감: NAT Gateway의 데이터 처리 요금을 회피
//
// ゲートウェイエンドポイント vs インターフェースエンドポイント:
// 게이트웨이 엔드포인트 vs 인터페이스 엔드포인트:
//   - ゲートウェイエンドポイント（S3、DynamoDB専用）:
//   - 게이트웨이 엔드포인트 (S3, DynamoDB 전용):
//       ルートテーブルにエントリを追加する方式
//       라우트 테이블에 엔트리를 추가하는 방식
//       無料で利用可能
//       무료로 이용 가능
//       VPC内の全サブネットから自動的に利用できる
//       VPC 내의 모든 서브넷에서 자동으로 이용할 수 있다
//   - インターフェースエンドポイント（PrivateLink）:
//   - 인터페이스 엔드포인트 (PrivateLink):
//       サブネット内にENI（ネットワークインターフェース）を作成する方式
//       서브넷 내에 ENI(네트워크 인터페이스)를 생성하는 방식
//       時間あたり＋データ転送量の料金が発生
//       시간당 + 데이터 전송량의 요금이 발생
//       セキュリティグループで制御可能
//       보안 그룹으로 제어 가능
//       SSM、CloudWatch、ECR等の多くのAWSサービスに対応
//       SSM, CloudWatch, ECR 등의 많은 AWS 서비스에 대응
// ============================================================================

export class VpcDesignStack extends cdk.Stack {
  // 他のスタックからVPCを参照できるようにパブリックプロパティとして公開する
  // 다른 스택에서 VPC를 참조할 수 있도록 퍼블릭 프로퍼티로 공개한다
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================================================
    // VPC本体の作成
    // VPC 본체 생성
    // ========================================================================
    // CIDR 10.0.0.0/16 は約65,536個のIPアドレスを提供する。
    // CIDR 10.0.0.0/16은 약 65,536개의 IP 주소를 제공한다.
    // 企業の本番環境では十分な範囲だが、VPCピアリングやTransit Gateway
    // 기업의 프로덕션 환경에서는 충분한 범위이지만, VPC 피어링이나 Transit Gateway
    // を使う場合はCIDRが重複しないように注意が必要。
    // 를 사용하는 경우 CIDR이 중복되지 않도록 주의가 필요하다.
    this.vpc = new ec2.Vpc(this, 'MainVpc', {
      // 【IPアドレス範囲】
      // 【IP 주소 범위】
      // /16 = 65,536 IPs。サブネットに分割して使う。
      // /16 = 65,536 IPs. 서브넷으로 분할하여 사용한다.
      // 各サブネットは /24（256 IPs）や /20（4,096 IPs）に分割される。
      // 각 서브넷은 /24(256 IPs)나 /20(4,096 IPs)으로 분할된다.
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),

      // 【アベイラビリティゾーン数】
      // 【가용 영역 수】
      // 2 AZs = 高可用性の最低ライン。本番環境では3 AZsが推奨。
      // 2 AZs = 고가용성의 최소 라인. 프로덕션 환경에서는 3 AZs가 권장.
      // AZはデータセンターの物理的な障害ドメイン。
      // AZ는 데이터 센터의 물리적인 장애 도메인.
      maxAzs: 2,

      // 【NATゲートウェイ数】
      // 【NAT 게이트웨이 수】
      // AZごとに1つ配置して、AZ障害時の可用性を確保する。
      // AZ마다 1개 배치하여, AZ 장애 시의 가용성을 확보한다.
      // 開発環境では 1 に減らしてコスト削減できる（月$45/個の節約）。
      // 개발 환경에서는 1로 줄여 비용 절감할 수 있다 (월 $45/개 절약).
      natGateways: 2,

      // 【サブネット構成 — 3層設計】
      // 【서브넷 구성 — 3계층 설계】
      subnetConfiguration: [
        {
          // パブリックサブネット: ALBとNATゲートウェイの配置場所
          // 퍼블릭 서브넷: ALB와 NAT 게이트웨이의 배치 장소
          // インターネットゲートウェイへのルートが自動設定される
          // 인터넷 게이트웨이로의 라우트가 자동 설정된다
          subnetType: ec2.SubnetType.PUBLIC,
          name: 'Public',
          cidrMask: 24, // 各AZに /24 = 256 IPs
        },
        {
          // プライベートサブネット: アプリケーション層
          // 프라이빗 서브넷: 애플리케이션 계층
          // NATゲートウェイ経由でインターネットにアクセス可能
          // NAT 게이트웨이 경유로 인터넷에 액세스 가능
          // 外部パッケージのダウンロード、外部APIの呼び出しに必要
          // 외부 패키지 다운로드, 외부 API 호출에 필요
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          name: 'Private',
          cidrMask: 24,
        },
        {
          // アイソレートサブネット: データベース層
          // 아이솔레이트 서브넷: 데이터베이스 계층
          // インターネットへの接続なし — 最も安全な配置場所
          // 인터넷으로의 연결 없음 — 가장 안전한 배치 장소
          // RDS、ElastiCache、Redshift等のデータストアに最適
          // RDS, ElastiCache, Redshift 등의 데이터 스토어에 최적
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          name: 'Isolated',
          cidrMask: 24,
        },
      ],
    });

    // ========================================================================
    // VPC Flow Logs — ネットワーク通信の監視
    // VPC Flow Logs — 네트워크 통신의 감시
    // ========================================================================
    // VPC Flow Logsは、VPC内のネットワークインターフェースを通過する
    // VPC Flow Logs는, VPC 내의 네트워크 인터페이스를 통과하는
    // IPトラフィックの情報をキャプチャする機能です。
    // IP 트래픽의 정보를 캡처하는 기능입니다.
    // セキュリティ分析、ネットワークトラブルシューティング、
    // 보안 분석, 네트워크 트러블슈팅,
    // コンプライアンス監査に不可欠です。
    // 컴플라이언스 감사에 필수적입니다.
    //
    // 【なぜ14日保持か】
    // 【왜 14일 보존인가】
    // - セキュリティインシデントの調査には直近のログが必要
    // - 보안 인시던트 조사에는 최근 로그가 필요
    // - 長期保存はS3に転送してコスト最適化する（別途設定）
    // - 장기 보존은 S3로 전송하여 비용 최적화한다 (별도 설정)
    // - CloudWatch Logsの保存コストは比較的高いため、保持期間を制限する
    // - CloudWatch Logs의 보존 비용은 비교적 높기 때문에, 보존 기간을 제한한다

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
      // ALL = 허가・거부 양쪽의 트래픽을 기록
      // REJECT のみにすると、拒否されたトラフィックだけ記録（コスト削減）
      // REJECT만으로 하면, 거부된 트래픽만 기록 (비용 절감)
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    // ========================================================================
    // VPCゲートウェイエンドポイント — S3へのプライベートアクセス
    // VPC 게이트웨이 엔드포인트 — S3로의 프라이빗 액세스
    // ========================================================================
    // 【ゲートウェイエンドポイントの仕組み】
    // 【게이트웨이 엔드포인트의 구조】
    // ルートテーブルにプレフィックスリスト（S3のIP範囲）へのルートを追加する。
    // 라우트 테이블에 프리픽스 리스트(S3의 IP 범위)로의 라우트를 추가한다.
    // トラフィックはAWSの内部ネットワークを経由するため、
    // 트래픽은 AWS의 내부 네트워크를 경유하기 때문에,
    // インターネットを通過せず、NATゲートウェイの料金も発生しない。
    // 인터넷을 통과하지 않으며, NAT 게이트웨이의 요금도 발생하지 않는다.
    //
    // 【なぜ無料なのか】
    // 【왜 무료인가】
    // ゲートウェイエンドポイントはルートテーブルの設定変更のみで実現される。
    // 게이트웨이 엔드포인트는 라우트 테이블의 설정 변경만으로 실현된다.
    // ENI（ネットワークインターフェース）を作成しないため、コストがかからない。
    // ENI(네트워크 인터페이스)를 생성하지 않기 때문에, 비용이 들지 않는다.
    // S3とDynamDBのみが対応している（AWSの戦略的な判断）。
    // S3와 DynamoDB만 대응하고 있다 (AWS의 전략적 판단).
    const s3Endpoint = this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      // 全サブネットタイプからS3にアクセスできるようにする
      // 모든 서브넷 타입에서 S3에 액세스할 수 있도록 한다
      subnets: [
        { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    // ========================================================================
    // VPCインターフェースエンドポイント — SSMへのプライベートアクセス
    // VPC 인터페이스 엔드포인트 — SSM으로의 프라이빗 액세스
    // ========================================================================
    // 【インターフェースエンドポイント（PrivateLink）の仕組み】
    // 【인터페이스 엔드포인트(PrivateLink)의 구조】
    // 指定したサブネットにENI（Elastic Network Interface）を作成し、
    // 지정한 서브넷에 ENI(Elastic Network Interface)를 생성하고,
    // プライベートIPアドレスを割り当てる。DNSが自動的に解決されるため、
    // 프라이빗 IP 주소를 할당한다. DNS가 자동으로 해결되기 때문에,
    // アプリケーションのコード変更なしでプライベート通信に切り替わる。
    // 애플리케이션의 코드 변경 없이 프라이빗 통신으로 전환된다.
    //
    // 【SSMエンドポイントが必要な理由】
    // 【SSM 엔드포인트가 필요한 이유】
    // SSM（Systems Manager）を使うと、SSH不要でEC2にアクセスできる。
    // SSM(Systems Manager)을 사용하면, SSH 없이 EC2에 액세스할 수 있다.
    // ただし、SSMエージェントがSSMサービスに通信する必要がある。
    // 다만, SSM 에이전트가 SSM 서비스에 통신할 필요가 있다.
    // プライベートサブネットのEC2からSSMを使う場合、以下の3つの
    // 프라이빗 서브넷의 EC2에서 SSM을 사용하는 경우, 다음 3개의
    // エンドポイントが必要：
    // 엔드포인트가 필요:
    //   - ssm: SSM APIへのアクセス
    //   - ssm: SSM API로의 액세스
    //   - ssmmessages: Session Manager用
    //   - ssmmessages: Session Manager용
    //   - ec2messages: Run Command用
    //   - ec2messages: Run Command용
    //
    // 【コストに注意】
    // 【비용에 주의】
    // インターフェースエンドポイントは AZ あたり約 $7.2/月 + データ転送料。
    // 인터페이스 엔드포인트는 AZ당 약 $7.2/월 + 데이터 전송 요금.
    // 3つのSSMエンドポイント × 2 AZ = 約 $43.2/月 の固定コスト。
    // 3개의 SSM 엔드포인트 x 2 AZ = 약 $43.2/월의 고정 비용.
    // 必要なエンドポイントのみ作成すること。
    // 필요한 엔드포인트만 생성할 것.

    const ssmEndpoint = this.vpc.addInterfaceEndpoint('SsmEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      // プライベートサブネットにのみENIを作成する
      // 프라이빗 서브넷에만 ENI를 생성한다
      // （アイソレートサブネットからも利用したい場合はそちらにも追加）
      // (아이솔레이트 서브넷에서도 이용하고 싶은 경우에는 그쪽에도 추가)
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      // プライベートDNSを有効にすると、ssm.<region>.amazonaws.com への
      // 프라이빗 DNS를 활성화하면, ssm.<region>.amazonaws.com으로의
      // リクエストが自動的にエンドポイントのプライベートIPに解決される
      // 요청이 자동으로 엔드포인트의 프라이빗 IP로 해결된다
      privateDnsEnabled: true,
    });

    // SSM Session Manager用のエンドポイント
    // SSM Session Manager용 엔드포인트
    const ssmMessagesEndpoint = this.vpc.addInterfaceEndpoint('SsmMessagesEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // SSM Run Command用のエンドポイント
    // SSM Run Command용 엔드포인트
    const ec2MessagesEndpoint = this.vpc.addInterfaceEndpoint('Ec2MessagesEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // ========================================================================
    // CfnOutputs — スタック間の値の受け渡しとデバッグ
    // CfnOutputs — 스택 간의 값 전달과 디버깅
    // ========================================================================
    // CfnOutputはCloudFormationの出力値。他のスタックからの参照や、
    // CfnOutput은 CloudFormation의 출력값. 다른 스택에서의 참조나,
    // デプロイ後の確認に使用する。
    // 배포 후의 확인에 사용한다.

    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: 'NetworkingVpcId',
    });

    // パブリックサブネットID一覧
    // 퍼블릭 서브넷 ID 목록
    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: this.vpc.publicSubnets.map(s => s.subnetId).join(','),
      description: 'パブリックサブネットのID一覧（ALB、NATゲートウェイ配置用）',
      exportName: 'NetworkingPublicSubnetIds',
    });

    // プライベートサブネットID一覧
    // 프라이빗 서브넷 ID 목록
    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: this.vpc.privateSubnets.map(s => s.subnetId).join(','),
      description: 'プライベートサブネットのID一覧（アプリケーション配置用）',
      exportName: 'NetworkingPrivateSubnetIds',
    });

    // アイソレートサブネットID一覧
    // 아이솔레이트 서브넷 ID 목록
    new cdk.CfnOutput(this, 'IsolatedSubnetIds', {
      value: this.vpc.isolatedSubnets.map(s => s.subnetId).join(','),
      description: 'アイソレートサブネットのID一覧（データベース配置用）',
      exportName: 'NetworkingIsolatedSubnetIds',
    });

    // VPCエンドポイントID
    // VPC 엔드포인트 ID
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
