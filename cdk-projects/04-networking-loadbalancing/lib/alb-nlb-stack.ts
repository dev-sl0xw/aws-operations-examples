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
// ============================================================================
// ALB・NLB 스택 — 로드 밸런서 설계
// ============================================================================
//
// 【ALB（Application Load Balancer）— L7 로드 밸런서】
// ALB는 OSI 참조 모델의 레이어 7（애플리케이션 계층）에서 동작합니다.
// HTTP 요청의 내용（경로, 헤더, 호스트명 등）을 이해하여
// 요청을 적절한 타겟으로 라우팅할 수 있습니다.
//
// 주요 용도:
//   - 경로 기반 라우팅: /api/* → API 서버 그룹, /web/* → Web 서버 그룹
//   - 호스트 기반 라우팅: api.example.com → API, www.example.com → Web
//   - HTTPS 종단（SSL/TLS Termination）
//   - WebSocket, HTTP/2 지원
//
// 【NLB（Network Load Balancer）— L4 로드 밸런서】
// NLB는 레이어 4（트랜스포트 계층）에서 동작합니다.
// TCP/UDP 레벨에서 패킷을 전달하므로 매우 높은 성능을 발휘합니다.
//
// 주요 용도:
//   - 초저지연이 필요한 경우（금융 거래 시스템 등）
//   - TCP/UDP 프로토콜 로드 밸런싱
//   - 고정 IP 주소가 필요한 경우
//   - 초당 수백만 요청 처리
//
// 【헬스 체크의 중요성】
// 헬스 체크는 타겟（EC2 인스턴스 등）이 정상적으로 동작하고 있는지
// 주기적으로 확인하는 메커니즘입니다. 비정상 타겟은 자동으로 라우팅 대상에서
// 제외되어 새로운 요청이 전달되지 않습니다.
//
// 적절한 헬스 체크 설정 포인트:
//   - interval: 체크 간격（너무 짧으면 EC2에 부하, 너무 길면 장애 감지 지연）
//   - healthyThresholdCount: 정상 판정에 필요한 연속 성공 횟수
//   - unhealthyThresholdCount: 비정상 판정에 필요한 연속 실패 횟수
//   - path: 애플리케이션의 깊은 부분까지 확인하는 경로를 지정
//           （DB 연결 확인도 포함한 /health/deep 등이 이상적）
// ============================================================================

// 他のスタック（特にAutoScalingスタック）にVPCとターゲットグループを渡すためのインターフェース
// 다른 스택（특히 AutoScaling 스택）에 VPC와 타겟 그룹을 전달하기 위한 인터페이스
export interface AlbNlbStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class AlbNlbStack extends cdk.Stack {
  // AutoScalingスタックからターゲットグループを参照するために公開
  // AutoScaling 스택에서 타겟 그룹을 참조하기 위해 공개
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
    // ========================================================================
    // ALB（Application Load Balancer） 생성
    // ========================================================================
    // 【퍼블릭 서브넷에 배치하는 이유】
    // ALB는 인터넷으로부터의 요청을 수신하므로
    // 퍼블릭 서브넷에 배치해야 합니다.
    // 내부 ALB（internal: true）의 경우 프라이빗 서브넷에 배치합니다.
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'AppAlb', {
      vpc,
      internetFacing: true, // インターネット向け（パブリック）
      // 인터넷 대면（퍼블릭）
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      // ALBは最低2つのAZに配置する必要がある（高可用性のため）
      // ALB는 최소 2개의 AZ에 배치해야 합니다（고가용성을 위해）
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
    // ========================================================================
    // HTTPS 리다이렉트（포트 80 → 443）
    // ========================================================================
    // 【왜 리다이렉트가 필요한가】
    // 사용자가 HTTP（포트 80）로 접속한 경우 자동으로 HTTPS（포트 443）로
    // 리다이렉트하여 통신 암호화를 강제합니다.
    // 이는 보안 베스트 프랙티스이며 많은 규제 요건에서도 요구됩니다.
    //
    // 주의: 프로덕션 환경에서는 ACM 인증서를 사용한 HTTPS 리스너도 필요합니다.
    // 여기서는 HTTP 리스너만 데모로 생성합니다.
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
    // ========================================================================
    // HTTP 리스너（포트 80）— 경로 기반 라우팅 데모
    // ========================================================================
    // 【기본 액션】
    // 어떤 라우팅 규칙에도 매칭되지 않는 요청에 대한 응답을 정의합니다.
    // 고정 응답을 반환하여 잘못된 요청에 적절히 응답합니다.
    const httpListener = this.alb.addListener('HttpListener', {
      port: 80,
      open: true, // 0.0.0.0/0 からのアクセスを許可
      // 0.0.0.0/0에서의 접근을 허용
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
    // ========================================================================
    // 타겟 그룹 생성
    // ========================================================================
    // 【타겟 그룹이란】
    // 로드 밸런서가 요청을 전달하는 대상 그룹입니다.
    // EC2 인스턴스, ECS 태스크, Lambda 함수 등을 등록할 수 있습니다.
    // 헬스 체크 설정도 여기서 수행합니다.
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
      // 【헬스 체크 설정】
      // healthyHttpCodes: '200' — HTTP 상태 200만 정상으로 간주
      // interval: 30초마다 체크（기본값）
      // healthyThresholdCount: 2회 연속 성공으로 정상 판정
      // unhealthyThresholdCount: 3회 연속 실패로 비정상 판정
      // timeout: 5초 이내에 응답이 없으면 실패
      // path: /health — 애플리케이션 헬스 체크용 엔드포인트
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
    // ========================================================================
    // 경로 기반 라우팅 규칙
    // ========================================================================
    // 【경로 기반 라우팅 사용법】
    // URL 경로를 기반으로 요청을 다른 타겟 그룹으로 분배합니다.
    // 마이크로서비스 아키텍처에서 특히 유효합니다:
    //   - /api/*    → API 서비스의 타겟 그룹
    //   - /admin/*  → 관리 화면의 타겟 그룹
    //   - /static/* → S3로의 리다이렉트
    //
    // 우선순위（priority）가 낮은 숫자일수록 먼저 평가됩니다.

    // ルール1: /api/* パスへのリクエストをAPIターゲットグループに転送
    // 규칙 1: /api/* 경로로의 요청을 API 타겟 그룹으로 전달
    httpListener.addAction('ApiRoute', {
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/api/*']),
      ],
      action: elbv2.ListenerAction.forward([this.albTargetGroup]),
    });

    // ルール2: /health パスへのリクエストに固定200レスポンスを返す
    // ALB自体のヘルスチェック用。外部監視ツールからの確認に使用する。
    // 규칙 2: /health 경로로의 요청에 고정 200 응답을 반환
    // ALB 자체의 헬스 체크용. 외부 모니터링 도구에서의 확인에 사용합니다.
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
    // ========================================================================
    // NLB（Network Load Balancer） 생성
    // ========================================================================
    // 【NLB를 사용하는 경우】
    // - TCP/UDP 레벨의 로드 밸런싱이 필요한 경우
    // - 초저지연（ALB보다 빠른）이 요구되는 경우
    // - 고정 IP 주소가 필요한 경우（방화벽 화이트리스트용）
    // - gRPC, MQTT 등 기타 TCP 프로토콜을 사용하는 경우
    //
    // 【ALB와 NLB 선택 기준】
    // ALB 선택: HTTP/HTTPS 트래픽, 경로 기반 라우팅, WebSocket
    // NLB 선택: TCP/UDP, 초저지연, 고정 IP, 매우 높은 처리량
    const nlb = new elbv2.NetworkLoadBalancer(this, 'AppNlb', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      // crossZoneEnabled: true にすると、AZ間の負荷分散が均等になる
      // ただし、AZ間のデータ転送料金が発生する点に注意
      // crossZoneEnabled: true로 설정하면 AZ 간 부하 분산이 균등해집니다
      // 단, AZ 간 데이터 전송 요금이 발생하는 점에 주의
      crossZoneEnabled: true,
    });

    // NLBターゲットグループ（TCP）
    // NLB 타겟 그룹（TCP）
    const nlbTargetGroup = new elbv2.NetworkTargetGroup(this, 'TcpTargetGroup', {
      vpc,
      port: 443,
      protocol: elbv2.Protocol.TCP,
      targetType: elbv2.TargetType.INSTANCE,
      // NLBのヘルスチェックはTCPレベル（ポートが開いているかの確認）
      // HTTPヘルスチェックも設定可能だが、TCPのほうが軽量
      // NLB의 헬스 체크는 TCP 레벨（포트가 열려 있는지 확인）
      // HTTP 헬스 체크도 설정 가능하지만 TCP가 더 경량
      healthCheck: {
        protocol: elbv2.Protocol.TCP,
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 3,
        unhealthyThresholdCount: 3,
      },
    });

    // NLBリスナー（ポート443、TCP）
    // NLB 리스너（포트 443, TCP）
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
      // ALB의 DNS 이름（HTTP 접근용）
      exportName: 'NetworkingAlbDnsName',
    });

    new cdk.CfnOutput(this, 'AlbArn', {
      value: this.alb.loadBalancerArn,
      description: 'ALBのARN',
      // ALB의 ARN
    });

    new cdk.CfnOutput(this, 'NlbDnsName', {
      value: nlb.loadBalancerDnsName,
      description: 'NLBのDNS名（TCPアクセス用）',
      // NLB의 DNS 이름（TCP 접근용）
      exportName: 'NetworkingNlbDnsName',
    });
  }
}
