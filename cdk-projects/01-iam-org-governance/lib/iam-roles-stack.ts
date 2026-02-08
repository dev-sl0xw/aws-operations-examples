import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * =============================================================================
 * IAM ロール・ポリシー スタック
 * IAM Role・Policy 스택
 * =============================================================================
 *
 * ■ なぜIAMロールが重要なのか？
 * ■ 왜 IAM Role이 중요한가?
 *   IAMはAWSの全サービスへのアクセスを制御する「門番」です。
 *   IAM은 AWS 전체 서비스에 대한 접근을 제어하는 "문지기"입니다.
 *   適切に設計されたIAMポリシーは、セキュリティ侵害の影響範囲を
 *   적절히 설계된 IAM Policy는 보안 침해의 영향 범위를
 *   最小限に抑えます。
 *   최소한으로 억제합니다.
 *
 * ■ IAMポリシー評価フロー（重要！）
 * ■ IAM Policy 평가 흐름 (중요!)
 *   AWSがAPIリクエストを受け取ると、以下の順序で評価します：
 *   AWS가 API 요청을 수신하면 다음 순서로 평가합니다:
 *
 *   1. 明示的なDeny → あれば即座に拒否（最優先）
 *      명시적 Deny → 있으면 즉시 거부 (최우선)
 *   2. SCP（組織ポリシー） → Denyがあれば拒否
 *      SCP (조직 Policy) → Deny가 있으면 거부
 *   3. リソースベースポリシー → Allowがあれば許可（一部例外）
 *      Resource 기반 Policy → Allow가 있으면 허가 (일부 예외)
 *   4. 権限境界（Permission Boundary） → 許可されていなければ拒否
 *      Permission Boundary → 허가되지 않으면 거부
 *   5. セッションポリシー → 許可されていなければ拒否
 *      Session Policy → 허가되지 않으면 거부
 *   6. アイデンティティベースポリシー → Allowがあれば許可
 *      Identity 기반 Policy → Allow가 있으면 허가
 *   7. デフォルト → 暗黙的な拒否
 *      기본값 → 암묵적 거부
 *
 *   つまり、どれだけ広い権限を付与しても、権限境界やSCPで
 *   즉, 아무리 넓은 권한을 부여하더라도 Permission Boundary나 SCP로
 *   制限されていれば、その範囲を超えることはできません。
 *   제한되어 있으면 그 범위를 초과할 수 없습니다.
 *
 * ■ なぜ一時的な認証情報（STS）がアクセスキーより安全なのか？
 * ■ 왜 임시 자격 증명(STS)이 Access Key보다 안전한가?
 *   - アクセスキーは永続的 → 漏洩すると無期限に悪用される
 *     Access Key는 영구적 → 유출 시 무기한으로 악용됨
 *   - STSトークンは有効期限付き → 最大12時間で自動失効
 *     STS Token은 유효 기한 있음 → 최대 12시간으로 자동 만료
 *   - AssumeRoleは監査証跡を残す → CloudTrailで誰がいつ使ったか追跡可能
 *     AssumeRole은 감사 추적을 남김 → CloudTrail에서 누가 언제 사용했는지 추적 가능
 *   - 条件付きアクセス → MFA、IPアドレス、時間帯などで制限可能
 *     조건부 접근 → MFA, IP 주소, 시간대 등으로 제한 가능
 *   - ローテーション不要 → 一時的なので定期的な鍵交換が不要
 *     로테이션 불필요 → 임시적이므로 정기적인 키 교체가 불필요
 */
export class IamRolesStack extends cdk.Stack {
  /** 外部からロールARNを参照するためのプロパティ */
  /** 외부에서 Role ARN을 참조하기 위한 프로퍼티 */
  public readonly adminRoleArn: string;
  public readonly developerRoleArn: string;
  public readonly cicdRoleArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // 1. 権限境界（Permission Boundary）ポリシー
    // 1. Permission Boundary Policy
    // =========================================================================
    /**
     * ■ なぜ権限境界が特権エスカレーションを防止するのか？
     * ■ 왜 Permission Boundary가 권한 상승을 방지하는가?
     *
     *   権限境界は「このロール/ユーザーが持てる最大権限」を定義します。
     *   Permission Boundary는 "이 Role/User가 가질 수 있는 최대 권한"을 정의합니다.
     *   たとえ管理者がフルアクセスポリシーを付与しても、
     *   설령 관리자가 Full Access Policy를 부여하더라도,
     *   権限境界で許可されていないアクションは実行できません。
     *   Permission Boundary에서 허가되지 않은 Action은 실행할 수 없습니다.
     *
     *   例：開発者にIAMロール作成権限を付与する必要がある場合
     *   예: 개발자에게 IAM Role 생성 권한을 부여해야 하는 경우
     *   → 権限境界なし: 開発者が自分に管理者権限を付与可能（特権エスカレーション）
     *   → Permission Boundary 없음: 개발자가 스스로 관리자 권한 부여 가능 (권한 상승)
     *   → 権限境界あり: 作成されるロールも同じ境界に制限される
     *   → Permission Boundary 있음: 생성되는 Role도 동일한 경계로 제한됨
     *
     *   これは「委任された管理」を安全に実現する唯一の方法です。
     *   이것은 "위임된 관리"를 안전하게 실현하는 유일한 방법입니다.
     */
    const permissionBoundaryPolicy = new iam.ManagedPolicy(this, 'PermissionBoundary', {
      managedPolicyName: 'GovernancePermissionBoundary',
      description: 'Permission boundary to prevent privilege escalation and restrict to allowed regions',
      statements: [
        // 許可されたリージョンでのサービス利用を許可
        // 허가된 리전에서의 서비스 이용을 허가
        // なぜリージョン制限？ → データ主権要件（日本のデータは日本に保持）とコスト管理
        // 왜 리전 제한? → 데이터 주권 요건 (일본 데이터는 일본에 보관)과 비용 관리
        new iam.PolicyStatement({
          sid: 'AllowedRegionServices',
          effect: iam.Effect.ALLOW,
          actions: [
            's3:*',
            'lambda:*',
            'dynamodb:*',
            'logs:*',
            'cloudwatch:*',
            'sns:*',
            'sqs:*',
            'events:*',
            'states:*',
            'apigateway:*',
            'ecr:*',
            'ecs:*',
            'rds:*',
            'secretsmanager:*',
            'ssm:*',
            'kms:*',
          ],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'aws:RequestedRegion': ['ap-northeast-1', 'us-east-1'],
            },
          },
        }),

        // IAMはグローバルサービスなのでリージョン制限なしで許可
        // IAM은 글로벌 서비스이므로 리전 제한 없이 허가
        // ただし、特権エスカレーションにつながるアクションは明示的に拒否する
        // 단, 권한 상승으로 이어지는 Action은 명시적으로 거부한다
        new iam.PolicyStatement({
          sid: 'AllowIamReadAndLimitedWrite',
          effect: iam.Effect.ALLOW,
          actions: [
            'iam:Get*',
            'iam:List*',
            'iam:CreateRole',
            'iam:DeleteRole',
            'iam:TagRole',
            'iam:UntagRole',
            'iam:AttachRolePolicy',
            'iam:DetachRolePolicy',
            'iam:PutRolePolicy',
            'iam:DeleteRolePolicy',
            'iam:CreatePolicy',
            'iam:DeletePolicy',
            'iam:CreatePolicyVersion',
            'iam:DeletePolicyVersion',
            'iam:PassRole',
          ],
          resources: ['*'],
        }),

        // STSはグローバルサービス - AssumeRoleに必要
        // STS는 글로벌 서비스 - AssumeRole에 필요
        new iam.PolicyStatement({
          sid: 'AllowSts',
          effect: iam.Effect.ALLOW,
          actions: [
            'sts:AssumeRole',
            'sts:GetCallerIdentity',
            'sts:GetSessionToken',
          ],
          resources: ['*'],
        }),

        // ■ 特権エスカレーション防止の核心部分
        // ■ 권한 상승 방지의 핵심 부분
        // 権限境界の変更・削除を禁止することで、自分の制限を解除できなくする
        // Permission Boundary의 변경・삭제를 금지하여 자신의 제한을 해제할 수 없게 함
        new iam.PolicyStatement({
          sid: 'DenyPermissionBoundaryModification',
          effect: iam.Effect.DENY,
          actions: [
            'iam:DeleteRolePermissionsBoundary',
            'iam:DeleteUserPermissionsBoundary',
            'iam:SetDefaultPolicyVersion',
          ],
          resources: ['*'],
        }),

        // 権限境界ポリシー自体の変更を禁止
        // Permission Boundary Policy 자체의 변경을 금지
        new iam.PolicyStatement({
          sid: 'DenyBoundaryPolicyModification',
          effect: iam.Effect.DENY,
          actions: [
            'iam:CreatePolicyVersion',
            'iam:DeletePolicy',
            'iam:DeletePolicyVersion',
          ],
          resources: [
            `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:policy/GovernancePermissionBoundary`,
          ],
        }),

        // 権限境界なしのロール/ユーザー作成を禁止
        // Permission Boundary 없이 Role/User 생성을 금지
        // これにより、すべての新規作成されるロールにも同じ境界が適用される
        // 이를 통해 모든 새로 생성되는 Role에도 동일한 경계가 적용됨
        new iam.PolicyStatement({
          sid: 'DenyCreatingWithoutBoundary',
          effect: iam.Effect.DENY,
          actions: [
            'iam:CreateUser',
            'iam:CreateRole',
          ],
          resources: ['*'],
          conditions: {
            StringNotEquals: {
              'iam:PermissionsBoundary': `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:policy/GovernancePermissionBoundary`,
            },
          },
        }),
      ],
    });

    // =========================================================================
    // 2. 管理者ロール（Admin Role）
    // 2. 관리자 Role (Admin Role)
    // =========================================================================
    /**
     * ■ なぜ管理者にも権限境界を適用するのか？
     * ■ 왜 관리자에게도 Permission Boundary를 적용하는가?
     *
     *   「管理者だから何でもできる」は危険な考え方です。
     *   "관리자이니까 뭐든 할 수 있다"는 위험한 사고방식입니다.
     *   - 管理者アカウントが侵害された場合の被害を限定する
     *     관리자 계정이 침해당했을 경우 피해를 한정
     *   - 日本リージョン以外での操作を防止（コンプライアンス要件）
     *     일본 리전 이외에서의 작업을 방지 (컴플라이언스 요건)
     *   - 意図しない操作ミスからの保護
     *     의도하지 않은 작업 실수로부터 보호
     *
     *   真の緊急事態には、ルートアカウント（MFA保護下）を使用します。
     *   진정한 긴급 상황에는 Root 계정 (MFA 보호 하)을 사용합니다.
     *   日常運用で管理者権限が必要な場合はこのロールを使います。
     *   일상 운영에서 관리자 권한이 필요한 경우 이 Role을 사용합니다.
     */
    const adminRole = new iam.Role(this, 'AdminRole', {
      roleName: 'GovernanceAdminRole',
      description: 'Admin role with permission boundary restricting to allowed regions',
      assumedBy: new iam.AccountPrincipal(this.account),
      permissionsBoundary: permissionBoundaryPolicy,
      maxSessionDuration: cdk.Duration.hours(4),
    });

    // 管理者には広い権限を付与するが、権限境界で実効権限は制限される
    // 관리자에게 넓은 권한을 부여하지만, Permission Boundary로 실효 권한은 제한됨
    adminRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')
    );

    // MFA必須条件を追加
    // MFA 필수 조건을 추가
    // なぜMFAを必須にするのか？ → パスワード漏洩だけでは管理者操作ができなくなる
    // 왜 MFA를 필수로 하는가? → 비밀번호 유출만으로는 관리자 작업을 할 수 없게 됨
    adminRole.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        sid: 'RequireMfaForAdmin',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['sts:AssumeRole'],
        conditions: {
          BoolIfExists: {
            'aws:MultiFactorAuthPresent': 'false',
          },
        },
      })
    );

    // =========================================================================
    // 3. 開発者ロール（Developer Role）
    // 3. 개발자 Role (Developer Role)
    // =========================================================================
    /**
     * ■ 最小権限の原則（Principle of Least Privilege）
     * ■ 최소 권한 원칙 (Principle of Least Privilege)
     *
     *   「必要な人に、必要な権限だけを、必要な期間だけ」付与する。
     *   "필요한 사람에게, 필요한 권한만, 필요한 기간만" 부여한다.
     *
     *   開発者に必要なサービス：
     *   개발자에게 필요한 서비스:
     *   - Lambda: サーバーレスアプリケーション開発
     *     Lambda: Serverless 애플리케이션 개발
     *   - S3: ファイルストレージとアプリケーションデータ
     *     S3: 파일 스토리지와 애플리케이션 데이터
     *   - DynamoDB: NoSQLデータベース
     *     DynamoDB: NoSQL 데이터베이스
     *   - CloudWatch: ログ確認とモニタリング
     *     CloudWatch: 로그 확인과 모니터링
     *
     *   開発者に不要なサービス（例）：
     *   개발자에게 불필요한 서비스 (예):
     *   - IAM: セキュリティ設定の変更（管理者の責務）
     *     IAM: 보안 설정 변경 (관리자의 책임)
     *   - Organizations: 組織構造の変更
     *     Organizations: 조직 구조의 변경
     *   - Config/CloudTrail: セキュリティ監視の無効化
     *     Config/CloudTrail: 보안 모니터링의 비활성화
     */
    const developerRole = new iam.Role(this, 'DeveloperRole', {
      roleName: 'GovernanceDeveloperRole',
      description: 'Developer role restricted to Lambda, S3, DynamoDB, CloudWatch',
      assumedBy: new iam.AccountPrincipal(this.account),
      permissionsBoundary: permissionBoundaryPolicy,
      maxSessionDuration: cdk.Duration.hours(8),
    });

    // 開発者ポリシー - サービスごとに必要な権限を精密に定義
    // 개발자 Policy - 서비스별로 필요한 권한을 정밀하게 정의
    const developerPolicy = new iam.ManagedPolicy(this, 'DeveloperPolicy', {
      managedPolicyName: 'GovernanceDeveloperPolicy',
      description: 'Policy for developers: Lambda, S3, DynamoDB, CloudWatch only',
      statements: [
        // Lambda: サーバーレス関数の開発とデプロイ
        // Lambda: Serverless 함수의 개발과 배포
        new iam.PolicyStatement({
          sid: 'LambdaFullAccess',
          effect: iam.Effect.ALLOW,
          actions: [
            'lambda:CreateFunction',
            'lambda:UpdateFunctionCode',
            'lambda:UpdateFunctionConfiguration',
            'lambda:InvokeFunction',
            'lambda:GetFunction',
            'lambda:ListFunctions',
            'lambda:DeleteFunction',
            'lambda:GetFunctionConfiguration',
            'lambda:ListVersionsByFunction',
            'lambda:CreateAlias',
            'lambda:DeleteAlias',
            'lambda:GetAlias',
            'lambda:ListAliases',
            'lambda:PublishVersion',
            'lambda:AddPermission',
            'lambda:RemovePermission',
            'lambda:GetPolicy',
            'lambda:TagResource',
            'lambda:UntagResource',
            'lambda:ListTags',
          ],
          resources: [
            `arn:aws:lambda:${this.region}:${this.account}:function:*`,
            `arn:aws:lambda:${this.region}:${this.account}:layer:*`,
          ],
        }),

        // S3: オブジェクトストレージの読み書き
        // S3: Object Storage 읽기/쓰기
        new iam.PolicyStatement({
          sid: 'S3Access',
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:ListBucket',
            's3:GetBucketLocation',
            's3:GetBucketPolicy',
            's3:CreateBucket',
            's3:PutBucketTagging',
            's3:GetBucketTagging',
            's3:PutEncryptionConfiguration',
            's3:GetEncryptionConfiguration',
            's3:PutBucketVersioning',
            's3:GetBucketVersioning',
          ],
          resources: [
            'arn:aws:s3:::*',
            'arn:aws:s3:::*/*',
          ],
        }),

        // DynamoDB: NoSQLデータベース操作
        // DynamoDB: NoSQL 데이터베이스 작업
        new iam.PolicyStatement({
          sid: 'DynamoDBAccess',
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:CreateTable',
            'dynamodb:DeleteTable',
            'dynamodb:DescribeTable',
            'dynamodb:ListTables',
            'dynamodb:UpdateTable',
            'dynamodb:TagResource',
            'dynamodb:UntagResource',
            'dynamodb:ListTagsOfResource',
          ],
          resources: [
            `arn:aws:dynamodb:${this.region}:${this.account}:table/*`,
          ],
        }),

        // CloudWatch: ログ確認とメトリクス監視
        // CloudWatch: 로그 확인과 Metrics 모니터링
        new iam.PolicyStatement({
          sid: 'CloudWatchAccess',
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:GetLogEvents',
            'logs:DescribeLogGroups',
            'logs:DescribeLogStreams',
            'logs:FilterLogEvents',
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'logs:TagResource',
            'cloudwatch:GetMetricData',
            'cloudwatch:GetMetricStatistics',
            'cloudwatch:ListMetrics',
            'cloudwatch:DescribeAlarms',
            'cloudwatch:PutMetricAlarm',
            'cloudwatch:PutMetricData',
          ],
          resources: ['*'],
        }),

        // IAM PassRole: Lambda実行ロールの引き渡しのみ許可
        // IAM PassRole: Lambda 실행 Role의 전달만 허가
        // なぜリソースを限定するのか？ → 任意のロールをPassRoleできると特権エスカレーションの原因になる
        // 왜 리소스를 한정하는가? → 임의의 Role을 PassRole할 수 있으면 권한 상승의 원인이 됨
        new iam.PolicyStatement({
          sid: 'PassRoleForLambda',
          effect: iam.Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: [
            `arn:aws:iam::${this.account}:role/lambda-*`,
          ],
          conditions: {
            StringEquals: {
              'iam:PassedToService': 'lambda.amazonaws.com',
            },
          },
        }),
      ],
    });

    developerRole.addManagedPolicy(developerPolicy);

    // =========================================================================
    // 4. CI/CD ロール（GitHub Actions OIDC）
    // 4. CI/CD Role (GitHub Actions OIDC)
    // =========================================================================
    /**
     * ■ なぜOIDCフェデレーションがアクセスキーより優れているのか？
     * ■ 왜 OIDC Federation이 Access Key보다 우수한가?
     *
     *   従来の方法: GitHub Secretsにアクセスキーを保存
     *   기존 방법: GitHub Secrets에 Access Key를 저장
     *   → 永続的な認証情報がGitHub側に保存される
     *   → 영구적인 자격 증명이 GitHub 측에 저장됨
     *   → キーのローテーション管理が必要
     *   → 키 로테이션 관리가 필요
     *   → 漏洩リスクが恒常的に存在
     *   → 유출 리스크가 상시 존재
     *
     *   OIDCフェデレーション: GitHubがAWSに直接認証
     *   OIDC Federation: GitHub이 AWS에 직접 인증
     *   → AWSに保存される認証情報はゼロ
     *   → AWS에 저장되는 자격 증명은 제로
     *   → GitHubのトークンは短命（ワークフロー実行中のみ有効）
     *   → GitHub Token은 단명 (Workflow 실행 중에만 유효)
     *   → 特定のリポジトリ/ブランチからのみアクセス可能
     *   → 특정 Repository/Branch에서만 접근 가능
     *   → IAMが自動的にGitHubの身元を検証
     *   → IAM이 자동으로 GitHub의 신원을 검증
     *
     *   仕組み:
     *   구조:
     *   1. GitHub Actionsがワークフローを実行
     *      GitHub Actions가 Workflow를 실행
     *   2. GitHubがOIDCトークンを発行（リポジトリ、ブランチ情報を含む）
     *      GitHub이 OIDC Token을 발행 (Repository, Branch 정보 포함)
     *   3. AWSのSTSがトークンを検証し、一時認証情報を発行
     *      AWS의 STS가 Token을 검증하고 임시 자격 증명을 발행
     *   4. CI/CDが一時認証情報でAWSリソースにアクセス
     *      CI/CD가 임시 자격 증명으로 AWS 리소스에 접근
     *   5. ワークフロー終了後、認証情報は自動失効
     *      Workflow 종료 후 자격 증명은 자동 만료
     */
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      // GitHubのOIDCプロバイダーのサムプリント
      // GitHub의 OIDC Provider Thumbprint
      // これはGitHubの証明書チェーンのルートCA指紋
      // 이것은 GitHub 인증서 체인의 Root CA 지문
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    // GitHub Actions用のIAMロール
    // GitHub Actions용 IAM Role
    const cicdRole = new iam.Role(this, 'CiCdRole', {
      roleName: 'GovernanceCiCdRole',
      description: 'CI/CD role for GitHub Actions using OIDC federation',
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          // 条件: 特定のGitHubリポジトリからのみアクセスを許可
          // 조건: 특정 GitHub Repository에서만 접근을 허가
          // これにより、他のリポジトリからのアクセスを完全にブロック
          // 이를 통해 다른 Repository에서의 접근을 완전히 차단
          StringLike: {
            'token.actions.githubusercontent.com:sub': 'repo:your-org/your-repo:*',
          },
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
        }
      ),
      permissionsBoundary: permissionBoundaryPolicy,
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // CI/CDに必要な権限: CDKデプロイとCloudFormation操作
    // CI/CD에 필요한 권한: CDK 배포와 CloudFormation 작업
    cicdRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudFormationAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudformation:CreateStack',
          'cloudformation:UpdateStack',
          'cloudformation:DeleteStack',
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:GetTemplate',
          'cloudformation:ValidateTemplate',
          'cloudformation:CreateChangeSet',
          'cloudformation:DeleteChangeSet',
          'cloudformation:DescribeChangeSet',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:ListStacks',
        ],
        resources: [
          `arn:aws:cloudformation:${this.region}:${this.account}:stack/*`,
        ],
      })
    );

    // CDKブートストラップリソースへのアクセス
    // CDK Bootstrap 리소스에 대한 접근
    cicdRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CdkBootstrapAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:ListBucket',
          's3:GetBucketLocation',
        ],
        resources: [
          `arn:aws:s3:::cdk-*-assets-${this.account}-${this.region}`,
          `arn:aws:s3:::cdk-*-assets-${this.account}-${this.region}/*`,
        ],
      })
    );

    // ECRへのイメージプッシュ（コンテナデプロイ用）
    // ECR에 이미지 Push (컨테이너 배포용)
    // GetAuthorizationToken はリソースレベルの権限をサポートしないため resources: ['*'] が必要
    // GetAuthorizationToken은 리소스 레벨 권한을 지원하지 않으므로 resources: ['*']가 필요
    cicdRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EcrAuthToken',
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:GetAuthorizationToken',
        ],
        resources: ['*'],
      })
    );

    // その他のECRアクションはリポジトリスコープに限定
    // 기타 ECR Action은 Repository 범위로 한정
    cicdRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EcrRepositoryAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'ecr:PutImage',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
        ],
        resources: [`arn:aws:ecr:${this.region}:${this.account}:repository/*`],
      })
    );

    // SSMパラメータストアからの設定値読み取り
    // SSM Parameter Store에서 설정값 읽기
    cicdRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SsmParameterReadOnly',
        effect: iam.Effect.ALLOW,
        actions: [
          'ssm:GetParameter',
          'ssm:GetParameters',
          'ssm:GetParametersByPath',
        ],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/governance/*`,
        ],
      })
    );

    // =========================================================================
    // 5. クロスアカウントアクセスロール
    // 5. Cross Account Access Role
    // =========================================================================
    /**
     * ■ クロスアカウントアクセスパターン
     * ■ Cross Account Access 패턴
     *
     *   マルチアカウント戦略では、セキュリティアカウントから
     *   Multi Account 전략에서는 보안 계정에서
     *   他のアカウントのリソースを監査する必要があります。
     *   다른 계정의 리소스를 감사할 필요가 있습니다.
     *
     *   External ID（外部ID）を使う理由:
     *   External ID (외부 ID)를 사용하는 이유:
     *   - 「混乱した代理」問題を防止
     *     "혼란된 대리인" 문제를 방지
     *   - 第三者サービスが、意図しないアカウントにアクセスすることを防ぐ
     *     제3자 서비스가 의도하지 않은 계정에 접근하는 것을 방지
     *   - 例: SaaS A が自分のAWSロールを経由して、別の顧客Bのアカウントにアクセスする攻撃
     *     예: SaaS A가 자신의 AWS Role을 경유하여 다른 고객 B의 계정에 접근하는 공격
     *   - External IDはロール信頼ポリシーの条件として機能し、正しいIDを持つ呼び出し元のみ許可
     *     External ID는 Role Trust Policy의 조건으로 기능하며, 올바른 ID를 가진 호출자만 허가
     */
    const trustedAccountId = '987654321098'; // 信頼するアカウントID（例）
    const externalId = 'governance-cross-account-2024'; // 共有する外部ID

    const crossAccountRole = new iam.Role(this, 'CrossAccountAuditRole', {
      roleName: 'GovernanceCrossAccountAuditRole',
      description: 'Read-only cross-account role for security auditing',
      assumedBy: new iam.AccountPrincipal(trustedAccountId),
      externalIds: [externalId],
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // 監査には読み取り専用アクセスで十分
    crossAccountRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('SecurityAudit')
    );
    crossAccountRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess')
    );

    // =========================================================================
    // 6. CfnOutputs - スタック間参照とドキュメント
    // =========================================================================
    this.adminRoleArn = adminRole.roleArn;
    this.developerRoleArn = developerRole.roleArn;
    this.cicdRoleArn = cicdRole.roleArn;

    new cdk.CfnOutput(this, 'AdminRoleArnOutput', {
      value: adminRole.roleArn,
      description: 'ARN of the admin role with permission boundary',
      exportName: 'GovernanceAdminRoleArn',
    });

    new cdk.CfnOutput(this, 'DeveloperRoleArnOutput', {
      value: developerRole.roleArn,
      description: 'ARN of the developer role (Lambda, S3, DynamoDB, CloudWatch)',
      exportName: 'GovernanceDeveloperRoleArn',
    });

    new cdk.CfnOutput(this, 'CiCdRoleArnOutput', {
      value: cicdRole.roleArn,
      description: 'ARN of the CI/CD role for GitHub Actions OIDC',
      exportName: 'GovernanceCiCdRoleArn',
    });

    new cdk.CfnOutput(this, 'CrossAccountAuditRoleArnOutput', {
      value: crossAccountRole.roleArn,
      description: 'ARN of the cross-account audit role',
      exportName: 'GovernanceCrossAccountAuditRoleArn',
    });

    new cdk.CfnOutput(this, 'PermissionBoundaryArnOutput', {
      value: permissionBoundaryPolicy.managedPolicyArn,
      description: 'ARN of the permission boundary policy',
      exportName: 'GovernancePermissionBoundaryArn',
    });

    new cdk.CfnOutput(this, 'GitHubOidcProviderArnOutput', {
      value: githubOidcProvider.openIdConnectProviderArn,
      description: 'ARN of the GitHub OIDC provider',
      exportName: 'GovernanceGitHubOidcProviderArn',
    });
  }
}
