import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

// ============================================================================
// Route 53 フェイルオーバースタック — DNS設計
// ============================================================================
//
// 【プライベートホストゾーンとは】
// VPC内でのみ有効なDNSゾーン。インターネットからは解決できない。
// マイクロサービス間の通信に内部DNSを使うことで：
//   - IPアドレスのハードコーディングを避けられる
//   - サービスの移動（別のEC2やECS）が容易になる
//   - 環境（dev/staging/prod）ごとに同じDNS名で異なるリソースを参照できる
//
// 【加重ルーティング（Weighted Routing）】
// 同じDNS名に対する複数のレコードに重みを設定し、
// トラフィックを比率で分散する。主な用途:
//   - カナリアデプロイ: 新バージョンに10%、旧バージョンに90%
//   - A/Bテスト: バリエーションAに50%、Bに50%
//   - 段階的な移行: 旧システムから新システムへ徐々にトラフィックを移行
//
// 【ヘルスチェックの役割】
// Route 53のヘルスチェックは、エンドポイントの健全性を監視する。
// 異常と判定されたエンドポイントへのDNS解決を停止し、
// 正常なエンドポイントにのみトラフィックを送る。
// これにより、アプリケーションレベルのフェイルオーバーを実現できる。
// ============================================================================

export interface Route53FailoverStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class Route53FailoverStack extends cdk.Stack {
  public readonly hostedZone: route53.PrivateHostedZone;

  constructor(scope: Construct, id: string, props: Route53FailoverStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    // ========================================================================
    // プライベートホストゾーンの作成
    // ========================================================================
    // 【internal.example.com を内部ドメインとして使用】
    // VPC内のリソース間通信に使用する内部DNS。
    // 例: api.internal.example.com → プライベートサブネットのALB
    //     db.internal.example.com  → RDSエンドポイント
    //     cache.internal.example.com → ElastiCacheエンドポイント
    this.hostedZone = new route53.PrivateHostedZone(this, 'InternalZone', {
      zoneName: 'internal.example.com',
      vpc, // このVPCからのみDNS解決が可能
      comment: '内部サービスディスカバリ用のプライベートホストゾーン',
    });

    // ========================================================================
    // 加重ルーティング — 80/20 トラフィック分割
    // ========================================================================
    // 【ユースケース: カナリアデプロイ】
    // 新バージョンのアプリケーションに少量のトラフィック（20%）を送り、
    // 問題がないか確認してから全量を切り替える。
    // 異常が検知された場合は重みを0にして即座にロールバックできる。
    //
    // 【重みの仕組み】
    // weight: 80 と weight: 20 の場合、約80%のリクエストがprimaryに、
    // 約20%のリクエストがsecondaryに解決される。
    // 重みの合計値に対する比率でトラフィックが分配される。

    // プライマリレコード（80%のトラフィック）
    new route53.ARecord(this, 'PrimaryRecord', {
      zone: this.hostedZone,
      recordName: 'app',
      target: route53.RecordTarget.fromIpAddresses('10.0.1.100'),
      // 加重ルーティングの重み: 80（全体の80%）
      weight: 80,
      // setIdentifier は加重ルーティングで必須。
      // 同じレコード名の複数レコードを区別するための識別子。
      setIdentifier: 'primary',
      ttl: cdk.Duration.seconds(60),
      comment: 'プライマリエンドポイント — トラフィックの80%を受け取る',
    });

    // セカンダリレコード（20%のトラフィック）
    new route53.ARecord(this, 'SecondaryRecord', {
      zone: this.hostedZone,
      recordName: 'app',
      target: route53.RecordTarget.fromIpAddresses('10.0.2.100'),
      weight: 20,
      setIdentifier: 'secondary',
      ttl: cdk.Duration.seconds(60),
      comment: 'セカンダリエンドポイント — カナリアデプロイ用（トラフィックの20%）',
    });

    // ========================================================================
    // Route 53 ヘルスチェック
    // ========================================================================
    // 【ヘルスチェックの仕組み】
    // Route 53のヘルスチェッカー（世界中に分散配置）が定期的に
    // 指定したエンドポイントにリクエストを送信する。
    // 一定回数以上失敗すると「異常（Unhealthy）」と判定し、
    // そのレコードへのDNS解決を停止する。
    //
    // 注意: プライベートIPアドレスのヘルスチェックはRoute 53から
    // 直接アクセスできないため、CloudWatchアラームベースの
    // ヘルスチェックを使用する必要がある（ここではパブリックIPの例）。
    const healthCheck = new route53.CfnHealthCheck(this, 'PrimaryHealthCheck', {
      healthCheckConfig: {
        // HTTPヘルスチェック: 指定したパスにGETリクエストを送信
        type: 'HTTP',
        // ヘルスチェック対象のIPアドレスまたはFQDN
        // 本番環境ではALBのDNS名を指定する
        fullyQualifiedDomainName: 'example.com',
        port: 80,
        resourcePath: '/health',
        // チェック間隔: 30秒（標準）または10秒（高速、追加料金あり）
        requestInterval: 30,
        // 異常判定の閾値: 3回連続失敗で異常と判定
        failureThreshold: 3,
      },
      healthCheckTags: [
        {
          key: 'Name',
          value: 'PrimaryEndpointHealthCheck',
        },
      ],
    });

    // ========================================================================
    // CfnOutputs
    // ========================================================================
    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: 'プライベートホストゾーンのID',
      exportName: 'NetworkingHostedZoneId',
    });

    new cdk.CfnOutput(this, 'HostedZoneName', {
      value: this.hostedZone.zoneName,
      description: 'プライベートホストゾーンのドメイン名',
    });

    new cdk.CfnOutput(this, 'HealthCheckId', {
      value: healthCheck.attrHealthCheckId,
      description: 'Route 53ヘルスチェックのID',
    });
  }
}
