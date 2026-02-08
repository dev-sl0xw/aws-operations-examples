import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

// =============================================================================
// X-Ray 分散トレーシングスタック
// =============================================================================
// なぜ分散トレーシングが必要なのか？
// モダンなアプリケーションは多くのマイクロサービスで構成されており、
// 1つのリクエストが複数のサービスを横断します。
// 従来のログベースの監視では、サービス間のリクエストフローを
// 追跡することが困難です。
//
// X-Ray は各リクエストにトレースIDを付与し、サービス間の呼び出しを
// 自動的に関連付けます。これにより：
// - どのサービスがボトルネックになっているか
// - エラーがどのサービスで発生しているか
// - リクエストの全体的なレイテンシはどれくらいか
// を視覚的に把握できます。
// =============================================================================

export class XRayTracingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // Lambda 実行ロールの作成（X-Ray 書き込み権限付き）
    // =========================================================================
    // なぜ X-Ray 書き込み権限が必要なのか？
    // Lambda 関数が X-Ray にトレースデータを送信するためには、
    // xray:PutTraceSegments と xray:PutTelemetryRecords の権限が必要です。
    // AWS マネージドポリシー AWSXRayDaemonWriteAccess を使用することで、
    // 必要最小限の権限を簡潔に付与できます。
    const lambdaRole = new iam.Role(this, 'TracedLambdaRole', {
      roleName: 'xray-traced-lambda-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'X-Rayトレーシングが有効なLambda関数の実行ロール',
    });

    // 基本的な Lambda 実行権限（CloudWatch Logs への書き込み）
    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // X-Ray デーモン書き込み権限
    // なぜ AWSXRayDaemonWriteAccess なのか？
    // このマネージドポリシーには、X-Ray へのトレースデータ送信に
    // 必要な最小限の権限（PutTraceSegments, PutTelemetryRecords,
    // GetSamplingRules, GetSamplingTargets, GetSamplingStatisticSummaries）
    // が含まれています。カスタムポリシーよりも保守が容易です。
    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess')
    );

    // =========================================================================
    // Lambda 関数のロググループ
    // =========================================================================
    const tracedFunctionLogGroup = new logs.LogGroup(this, 'TracedFunctionLogGroup', {
      logGroupName: '/aws/lambda/xray-traced-function',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // =========================================================================
    // X-Ray トレーシング有効な Lambda 関数の作成
    // =========================================================================
    // なぜ Lambda で X-Ray を有効にするのか？
    // Lambda で X-Ray アクティブトレーシングを有効にすると、
    // Lambda のコールドスタート時間、実行時間、初期化時間が
    // 自動的にトレースされます。
    // さらに、AWS SDK の呼び出し（DynamoDB, S3 など）も
    // 自動的にサブセグメントとして記録されます。
    //
    // 環境変数の説明：
    // - AWS_XRAY_TRACING_NAME: X-Ray コンソールでのサービス表示名
    // - AWS_XRAY_DAEMON_ADDRESS: X-Ray デーモンのアドレス（Lambda では自動設定）
    // - AWS_XRAY_CONTEXT_MISSING: トレースコンテキストがない場合の動作
    //   LOG_ERROR にすることで、トレースなしのテスト実行時にエラーにならない
    const tracedFunction = new lambda.Function(this, 'XRayTracedFunction', {
      functionName: 'xray-traced-function',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      // X-Ray アクティブトレーシングを有効化
      // Active（アクティブ）: Lambda 自身がサンプリング判断を行い、トレースを開始
      // PassThrough（パススルー）: 上流サービスのトレース判断に従う
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        // X-Ray のサンプリング設定
        // なぜサンプリングするのか？
        // 全てのリクエストをトレースするとコストとパフォーマンスの影響が大きいため、
        // サンプリングにより一定割合のリクエストのみをトレースします。
        // 本番環境では低いサンプリングレートで十分な統計データが得られます。
        AWS_XRAY_TRACING_NAME: 'MonitoringExampleService',
        AWS_XRAY_CONTEXT_MISSING: 'LOG_ERROR',
        POWERTOOLS_SERVICE_NAME: 'monitoring-example',
        LOG_LEVEL: 'INFO',
      },
      code: lambda.Code.fromInline(`
        // X-Ray トレーシング対応 Lambda ハンドラー
        // このハンドラーは API Gateway からのリクエストを処理し、
        // X-Ray によってトレースデータが自動的に収集されます。
        //
        // X-Ray SDK を使用すると、カスタムサブセグメントを追加して
        // 特定の処理のパフォーマンスを詳細に計測できます。
        // ここではインラインコードのためSDKは使用していませんが、
        // 実際のプロジェクトでは aws-xray-sdk-node パッケージを
        // インストールして使用することを推奨します。

        exports.handler = async (event) => {
          const startTime = Date.now();

          // リクエスト情報のログ出力（構造化ログ）
          console.log(JSON.stringify({
            level: 'INFO',
            message: 'Processing request',
            requestId: event.requestContext?.requestId || 'unknown',
            httpMethod: event.httpMethod || 'unknown',
            path: event.path || '/',
            traceId: process.env._X_AMZN_TRACE_ID || 'no-trace',
            timestamp: new Date().toISOString(),
          }));

          // シミュレートされたビジネスロジック
          // 実際のアプリケーションでは、ここでDynamoDBクエリや
          // 外部API呼び出しなどが行われます。
          // X-Ray SDK を使えば、これらの呼び出しが
          // 自動的にサブセグメントとして記録されます。
          const processingTime = Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, processingTime));

          const response = {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              // X-Ray トレースIDをレスポンスヘッダーに含めることで、
              // フロントエンドからもトレースを追跡可能にします。
              'X-Amzn-Trace-Id': process.env._X_AMZN_TRACE_ID || '',
            },
            body: JSON.stringify({
              message: 'Request processed successfully with X-Ray tracing',
              processingTimeMs: Math.round(Date.now() - startTime),
              traceId: process.env._X_AMZN_TRACE_ID || 'no-trace',
              service: process.env.POWERTOOLS_SERVICE_NAME || 'unknown',
              timestamp: new Date().toISOString(),
            }),
          };

          // レスポンス情報のログ出力
          console.log(JSON.stringify({
            level: 'INFO',
            message: 'Request completed',
            statusCode: response.statusCode,
            processingTimeMs: Math.round(Date.now() - startTime),
            timestamp: new Date().toISOString(),
          }));

          return response;
        };
      `),
    });

    tracedFunction.node.addDependency(tracedFunctionLogGroup);

    // =========================================================================
    // API Gateway REST API の作成（X-Ray トレーシング有効）
    // =========================================================================
    // なぜ API Gateway で X-Ray を有効にするのか？
    // API Gateway は多くの場合、リクエストの最初のエントリーポイントです。
    // ここで X-Ray を有効にすることで、API Gateway → Lambda → その他サービス
    // という完全なリクエストフローをトレースできます。
    //
    // API Gateway のトレースにより以下が記録されます：
    // - API Gateway でのレイテンシ（認証、スロットリング、統合レイテンシ）
    // - バックエンド統合（Lambda 呼び出し）のレイテンシ
    // - レスポンスのステータスコード分布
    const api = new apigateway.RestApi(this, 'TracedApiGateway', {
      restApiName: 'xray-traced-api',
      description: 'X-Rayトレーシングが有効なAPI Gateway REST API。API GatewayからLambdaへのリクエストフローを可視化します。',
      deployOptions: {
        // X-Ray トレーシングを有効化
        tracingEnabled: true,
        // ステージ名
        stageName: 'prod',
        // アクセスログの設定
        // なぜアクセスログも有効にするのか？
        // X-Ray トレースはサンプリングされるため、全てのリクエストが
        // 記録されるわけではありません。アクセスログと併用することで、
        // トレースされなかったリクエストの情報も確認できます。
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
    });

    // Lambda 統合の設定
    // なぜプロキシ統合を使うのか？
    // プロキシ統合（proxy: true）を使うと、API Gateway はリクエストを
    // そのまま Lambda に転送し、Lambda のレスポンスをそのままクライアントに返します。
    // マッピングテンプレートの設定が不要で、Lambda 側でリクエスト/レスポンスを
    // 完全に制御できます。
    const lambdaIntegration = new apigateway.LambdaIntegration(tracedFunction, {
      proxy: true,
    });

    // ルートパス（/）に GET メソッドを追加
    api.root.addMethod('GET', lambdaIntegration);

    // /health パスにヘルスチェックエンドポイントを追加
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', lambdaIntegration);

    // /trace パスにトレーステスト用エンドポイントを追加
    const traceResource = api.root.addResource('trace');
    traceResource.addMethod('GET', lambdaIntegration);
    traceResource.addMethod('POST', lambdaIntegration);

    // =========================================================================
    // CfnOutputs（スタック出力）
    // =========================================================================
    new cdk.CfnOutput(this, 'ApiEndpointUrl', {
      value: api.url,
      description: 'API Gateway endpoint URL with X-Ray tracing enabled',
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: api.restApiId,
      description: 'API Gateway REST API ID',
    });

    new cdk.CfnOutput(this, 'TracedFunctionName', {
      value: tracedFunction.functionName,
      description: 'Lambda function name with X-Ray active tracing',
    });

    new cdk.CfnOutput(this, 'TracedFunctionArn', {
      value: tracedFunction.functionArn,
      description: 'Lambda function ARN with X-Ray active tracing',
    });

    new cdk.CfnOutput(this, 'LambdaRoleArn', {
      value: lambdaRole.roleArn,
      description: 'IAM Role ARN for the traced Lambda function with X-Ray permissions',
    });
  }
}
