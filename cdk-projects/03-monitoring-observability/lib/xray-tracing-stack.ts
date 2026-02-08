import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

// =============================================================================
// X-Ray 分散トレーシングスタック
// X-Ray 분산 트레이싱 스택
// =============================================================================
// なぜ分散トレーシングが必要なのか？
// 왜 분산 트레이싱이 필요한가?
// モダンなアプリケーションは多くのマイクロサービスで構成されており、
// 모던 애플리케이션은 많은 마이크로서비스로 구성되어 있으며,
// 1つのリクエストが複数のサービスを横断します。
// 하나의 요청이 여러 서비스를 횡단합니다.
// 従来のログベースの監視では、サービス間のリクエストフローを
// 기존의 로그 기반 감시로는, 서비스 간의 요청 흐름을
// 追跡することが困難です。
// 추적하는 것이 어렵습니다.
//
// X-Ray は各リクエストにトレースIDを付与し、サービス間の呼び出しを
// X-Ray는 각 요청에 Trace ID를 부여하고, 서비스 간의 호출을
// 自動的に関連付けます。これにより：
// 자동으로 관련짓습니다. 이를 통해:
// - どのサービスがボトルネックになっているか
// - 어떤 서비스가 병목 지점이 되고 있는가
// - エラーがどのサービスで発生しているか
// - 오류가 어떤 서비스에서 발생하고 있는가
// - リクエストの全体的なレイテンシはどれくらいか
// - 요청의 전체적인 레이턴시는 얼마인가
// を視覚的に把握できます。
// 를 시각적으로 파악할 수 있습니다.
// =============================================================================

export class XRayTracingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // Lambda 実行ロールの作成（X-Ray 書き込み権限付き）
    // Lambda 실행 역할 생성 (X-Ray 쓰기 권한 포함)
    // =========================================================================
    // なぜ X-Ray 書き込み権限が必要なのか？
    // 왜 X-Ray 쓰기 권한이 필요한가?
    // Lambda 関数が X-Ray にトレースデータを送信するためには、
    // Lambda 함수가 X-Ray에 트레이스 데이터를 전송하려면,
    // xray:PutTraceSegments と xray:PutTelemetryRecords の権限が必要です。
    // xray:PutTraceSegments와 xray:PutTelemetryRecords 권한이 필요합니다.
    // AWS マネージドポリシー AWSXRayDaemonWriteAccess を使用することで、
    // AWS 관리형 정책 AWSXRayDaemonWriteAccess를 사용함으로써,
    // 必要最小限の権限を簡潔に付与できます。
    // 필요 최소한의 권한을 간결하게 부여할 수 있습니다.
    const lambdaRole = new iam.Role(this, 'TracedLambdaRole', {
      roleName: 'xray-traced-lambda-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'X-Rayトレーシングが有効なLambda関数の実行ロール',
    });

    // 基本的な Lambda 実行権限（CloudWatch Logs への書き込み）
    // 기본적인 Lambda 실행 권한 (CloudWatch Logs로의 쓰기)
    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // X-Ray デーモン書き込み権限
    // X-Ray 데몬 쓰기 권한
    // なぜ AWSXRayDaemonWriteAccess なのか？
    // 왜 AWSXRayDaemonWriteAccess인가?
    // このマネージドポリシーには、X-Ray へのトレースデータ送信に
    // 이 관리형 정책에는, X-Ray로의 트레이스 데이터 전송에
    // 必要な最小限の権限（PutTraceSegments, PutTelemetryRecords,
    // 필요한 최소한의 권한(PutTraceSegments, PutTelemetryRecords,
    // GetSamplingRules, GetSamplingTargets, GetSamplingStatisticSummaries）
    // GetSamplingRules, GetSamplingTargets, GetSamplingStatisticSummaries)이
    // が含まれています。カスタムポリシーよりも保守が容易です。
    // 포함되어 있습니다. 커스텀 정책보다 유지보수가 용이합니다.
    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess')
    );

    // =========================================================================
    // Lambda 関数のロググループ
    // Lambda 함수의 로그 그룹
    // =========================================================================
    const tracedFunctionLogGroup = new logs.LogGroup(this, 'TracedFunctionLogGroup', {
      logGroupName: '/aws/lambda/xray-traced-function',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // =========================================================================
    // X-Ray トレーシング有効な Lambda 関数の作成
    // X-Ray 트레이싱이 활성화된 Lambda 함수 생성
    // =========================================================================
    // なぜ Lambda で X-Ray を有効にするのか？
    // 왜 Lambda에서 X-Ray를 활성화하는가?
    // Lambda で X-Ray アクティブトレーシングを有効にすると、
    // Lambda에서 X-Ray 액티브 트레이싱을 활성화하면,
    // Lambda のコールドスタート時間、実行時間、初期化時間が
    // Lambda의 콜드 스타트 시간, 실행 시간, 초기화 시간이
    // 自動的にトレースされます。
    // 자동으로 트레이스됩니다.
    // さらに、AWS SDK の呼び出し（DynamoDB, S3 など）も
    // 또한, AWS SDK의 호출(DynamoDB, S3 등)도
    // 自動的にサブセグメントとして記録されます。
    // 자동으로 서브 세그먼트로 기록됩니다.
    //
    // 環境変数の説明：
    // 환경 변수 설명:
    // - AWS_XRAY_TRACING_NAME: X-Ray コンソールでのサービス表示名
    // - AWS_XRAY_TRACING_NAME: X-Ray 콘솔에서의 서비스 표시명
    // - AWS_XRAY_DAEMON_ADDRESS: X-Ray デーモンのアドレス（Lambda では自動設定）
    // - AWS_XRAY_DAEMON_ADDRESS: X-Ray 데몬의 주소 (Lambda에서는 자동 설정)
    // - AWS_XRAY_CONTEXT_MISSING: トレースコンテキストがない場合の動作
    // - AWS_XRAY_CONTEXT_MISSING: 트레이스 컨텍스트가 없는 경우의 동작
    //   LOG_ERROR にすることで、トレースなしのテスト実行時にエラーにならない
    //   LOG_ERROR로 설정함으로써, 트레이스 없이 테스트 실행 시 오류가 발생하지 않음
    const tracedFunction = new lambda.Function(this, 'XRayTracedFunction', {
      functionName: 'xray-traced-function',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      // X-Ray アクティブトレーシングを有効化
      // X-Ray 액티브 트레이싱을 활성화
      // Active（アクティブ）: Lambda 自身がサンプリング判断を行い、トレースを開始
      // Active(액티브): Lambda 자신이 샘플링 판단을 수행하고, 트레이스를 시작
      // PassThrough（パススルー）: 上流サービスのトレース判断に従う
      // PassThrough(패스스루): 상류 서비스의 트레이스 판단을 따름
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        // X-Ray のサンプリング設定
        // X-Ray의 샘플링 설정
        // なぜサンプリングするのか？
        // 왜 샘플링하는가?
        // 全てのリクエストをトレースするとコストとパフォーマンスの影響が大きいため、
        // 모든 요청을 트레이스하면 비용과 성능에 미치는 영향이 크기 때문에,
        // サンプリングにより一定割合のリクエストのみをトレースします。
        // 샘플링을 통해 일정 비율의 요청만 트레이스합니다.
        // 本番環境では低いサンプリングレートで十分な統計データが得られます。
        // 프로덕션 환경에서는 낮은 샘플링 레이트로 충분한 통계 데이터를 얻을 수 있습니다.
        AWS_XRAY_TRACING_NAME: 'MonitoringExampleService',
        AWS_XRAY_CONTEXT_MISSING: 'LOG_ERROR',
        POWERTOOLS_SERVICE_NAME: 'monitoring-example',
        LOG_LEVEL: 'INFO',
      },
      code: lambda.Code.fromInline(`
        // X-Ray トレーシング対応 Lambda ハンドラー
        // X-Ray 트레이싱 대응 Lambda 핸들러
        // このハンドラーは API Gateway からのリクエストを処理し、
        // 이 핸들러는 API Gateway에서의 요청을 처리하며,
        // X-Ray によってトレースデータが自動的に収集されます。
        // X-Ray에 의해 트레이스 데이터가 자동으로 수집됩니다.
        //
        // X-Ray SDK を使用すると、カスタムサブセグメントを追加して
        // X-Ray SDK를 사용하면, 커스텀 서브 세그먼트를 추가하여
        // 特定の処理のパフォーマンスを詳細に計測できます。
        // 특정 처리의 성능을 상세하게 측정할 수 있습니다.
        // ここではインラインコードのためSDKは使用していませんが、
        // 여기에서는 인라인 코드이기 때문에 SDK는 사용하고 있지 않지만,
        // 実際のプロジェクトでは aws-xray-sdk-node パッケージを
        // 실제 프로젝트에서는 aws-xray-sdk-node 패키지를
        // インストールして使用することを推奨します。
        // 설치하여 사용하는 것을 권장합니다.

        exports.handler = async (event) => {
          const startTime = Date.now();

          // リクエスト情報のログ出力（構造化ログ）
          // 요청 정보의 로그 출력 (구조화 로그)
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
          // 시뮬레이션된 비즈니스 로직
          // 実際のアプリケーションでは、ここでDynamoDBクエリや
          // 실제 애플리케이션에서는, 여기서 DynamoDB 쿼리나
          // 外部API呼び出しなどが行われます。
          // 외부 API 호출 등이 수행됩니다.
          // X-Ray SDK を使えば、これらの呼び出しが
          // X-Ray SDK를 사용하면, 이러한 호출이
          // 自動的にサブセグメントとして記録されます。
          // 자동으로 서브 세그먼트로 기록됩니다.
          const processingTime = Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, processingTime));

          const response = {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              // X-Ray トレースIDをレスポンスヘッダーに含めることで、
              // X-Ray Trace ID를 응답 헤더에 포함함으로써,
              // フロントエンドからもトレースを追跡可能にします。
              // 프론트엔드에서도 트레이스를 추적 가능하게 합니다.
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
          // 응답 정보의 로그 출력
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
    // API Gateway REST API 생성 (X-Ray 트레이싱 활성화)
    // =========================================================================
    // なぜ API Gateway で X-Ray を有効にするのか？
    // 왜 API Gateway에서 X-Ray를 활성화하는가?
    // API Gateway は多くの場合、リクエストの最初のエントリーポイントです。
    // API Gateway는 많은 경우, 요청의 첫 번째 엔트리 포인트입니다.
    // ここで X-Ray を有効にすることで、API Gateway → Lambda → その他サービス
    // 여기서 X-Ray를 활성화함으로써, API Gateway → Lambda → 기타 서비스
    // という完全なリクエストフローをトレースできます。
    // 라는 완전한 요청 흐름을 트레이스할 수 있습니다.
    //
    // API Gateway のトレースにより以下が記録されます：
    // API Gateway의 트레이스를 통해 다음이 기록됩니다:
    // - API Gateway でのレイテンシ（認証、スロットリング、統合レイテンシ）
    // - API Gateway에서의 레이턴시 (인증, 스로틀링, 통합 레이턴시)
    // - バックエンド統合（Lambda 呼び出し）のレイテンシ
    // - 백엔드 통합 (Lambda 호출)의 레이턴시
    // - レスポンスのステータスコード分布
    // - 응답의 상태 코드 분포
    const api = new apigateway.RestApi(this, 'TracedApiGateway', {
      restApiName: 'xray-traced-api',
      description: 'X-Rayトレーシングが有効なAPI Gateway REST API。API GatewayからLambdaへのリクエストフローを可視化します。',
      deployOptions: {
        // X-Ray トレーシングを有効化
        // X-Ray 트레이싱을 활성화
        tracingEnabled: true,
        // ステージ名
        // 스테이지명
        stageName: 'prod',
        // アクセスログの設定
        // 액세스 로그 설정
        // なぜアクセスログも有効にするのか？
        // 왜 액세스 로그도 활성화하는가?
        // X-Ray トレースはサンプリングされるため、全てのリクエストが
        // X-Ray 트레이스는 샘플링되기 때문에, 모든 요청이
        // 記録されるわけではありません。アクセスログと併用することで、
        // 기록되는 것은 아닙니다. 액세스 로그와 병용함으로써,
        // トレースされなかったリクエストの情報も確認できます。
        // 트레이스되지 않은 요청의 정보도 확인할 수 있습니다.
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
    });

    // Lambda 統合の設定
    // Lambda 통합 설정
    // なぜプロキシ統合を使うのか？
    // 왜 프록시 통합을 사용하는가?
    // プロキシ統合（proxy: true）を使うと、API Gateway はリクエストを
    // 프록시 통합(proxy: true)을 사용하면, API Gateway는 요청을
    // そのまま Lambda に転送し、Lambda のレスポンスをそのままクライアントに返します。
    // 그대로 Lambda에 전달하고, Lambda의 응답을 그대로 클라이언트에 반환합니다.
    // マッピングテンプレートの設定が不要で、Lambda 側でリクエスト/レスポンスを
    // 매핑 템플릿 설정이 불필요하며, Lambda 측에서 요청/응답을
    // 完全に制御できます。
    // 완전히 제어할 수 있습니다.
    const lambdaIntegration = new apigateway.LambdaIntegration(tracedFunction, {
      proxy: true,
    });

    // ルートパス（/）に GET メソッドを追加
    // 루트 경로(/)에 GET 메서드를 추가
    api.root.addMethod('GET', lambdaIntegration);

    // /health パスにヘルスチェックエンドポイントを追加
    // /health 경로에 헬스 체크 엔드포인트를 추가
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', lambdaIntegration);

    // /trace パスにトレーステスト用エンドポイントを追加
    // /trace 경로에 트레이스 테스트용 엔드포인트를 추가
    const traceResource = api.root.addResource('trace');
    traceResource.addMethod('GET', lambdaIntegration);
    traceResource.addMethod('POST', lambdaIntegration);

    // =========================================================================
    // CfnOutputs（スタック出力）
    // CfnOutputs (스택 출력)
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
