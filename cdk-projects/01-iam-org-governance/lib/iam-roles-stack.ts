import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * =============================================================================
 * IAM ロール・ポリシー スタック
 * =============================================================================
 *
 * ■ なぜIAMロールが重要なのか？
 *   IAMはAWSの全サービスへのアクセスを制御する「門番」です。
 *   適切に設計されたIAMポリシーは、セキュリティ侵害の影響範囲を
 *   最小限に抑えます。
 *
 * ■ IAMポリシー評価フロー（重要！）
 *   AWSがAPIリクエストを受け取ると、以下の順序で評価します：
 *
 *   1. 明示的なDeny → あれば即座に拒否（最優先）
 *   2. SCP（組織ポリシー） → Denyがあれば拒否
 *   3. リソースベースポリシー → Allowがあれば許可（一部例外）
 *   4. 権限境界（Permission Boundary） → 許可されていなければ拒否
 *   5. セッションポリシー → 許可されていなければ拒否
 *   6. アイデンティティベースポリシー → Allowがあれば許可
 *   7. デフォルト → 暗黙的な拒否
 *
 *   つまり、どれだけ広い権限を付与しても、権限境界やSCPで
 *   制限されていれば、その範囲を超えることはできません。
 *
 * ■ なぜ一時的な認証情報（STS）がアクセスキーより安全なのか？
 *   - アクセスキーは永続的 → 漏洩すると無期限に悪用される
 *   - STSトークンは有効期限付き → 最大12時間で自動失効
 *   - AssumeRoleは監査証跡を残す → CloudTrailで誰がいつ使ったか追跡可能
 *   - 条件付きアクセス → MFA、IPアドレス、時間帯などで制限可能
 *   - ローテーション不要 → 一時的なので定期的な鍵交換が不要
 */
export class IamRolesStack extends cdk.Stack {
  /** 外部からロールARNを参照するためのプロパティ */
  public readonly adminRoleArn: string;
  public readonly developerRoleArn: string;
  public readonly cicdRoleArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // 1. 権限境界（Permission Boundary）ポリシー
    // =========================================================================
    /**
     * ■ なぜ権限境界が特権エスカレーションを防止するのか？
     *
     *   権限境界は「このロール/ユーザーが持てる最大権限」を定義します。
     *   たとえ管理者がフルアクセスポリシーを付与しても、
     *   権限境界で許可されていないアクションは実行できません。
     *
     *   例：開発者にIAMロール作成権限を付与する必要がある場合
     *   → 権限境界なし: 開発者が自分に管理者権限を付与可能（特権エスカレーション）
     *   → 権限境界あり: 作成されるロールも同じ境界に制限される
     *
     *   これは「委任された管理」を安全に実現する唯一の方法です。
     */
    const permissionBoundaryPolicy = new iam.ManagedPolicy(this, 'PermissionBoundary', {
      managedPolicyName: 'GovernancePermissionBoundary',
      description: 'Permission boundary to prevent privilege escalation and restrict to allowed regions',
      statements: [
        // 許可されたリージョンでのサービス利用を許可
        // なぜリージョン制限？ → データ主権要件（日本のデータは日本に保持）とコスト管理
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
        // ただし、特権エスカレーションにつながるアクションは明示的に拒否する
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
        // 権限境界の変更・削除を禁止することで、自分の制限を解除できなくする
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
        // これにより、すべての新規作成されるロールにも同じ境界が適用される
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
    // =========================================================================
    /**
     * ■ なぜ管理者にも権限境界を適用するのか？
     *
     *   「管理者だから何でもできる」は危険な考え方です。
     *   - 管理者アカウントが侵害された場合の被害を限定する
     *   - 日本リージョン以外での操作を防止（コンプライアンス要件）
     *   - 意図しない操作ミスからの保護
     *
     *   真の緊急事態には、ルートアカウント（MFA保護下）を使用します。
     *   日常運用で管理者権限が必要な場合はこのロールを使います。
     */
    const adminRole = new iam.Role(this, 'AdminRole', {
      roleName: 'GovernanceAdminRole',
      description: 'Admin role with permission boundary restricting to allowed regions',
      assumedBy: new iam.AccountPrincipal(this.account),
      permissionsBoundary: permissionBoundaryPolicy,
      maxSessionDuration: cdk.Duration.hours(4),
    });

    // 管理者には広い権限を付与するが、権限境界で実効権限は制限される
    adminRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')
    );

    // MFA必須条件を追加
    // なぜMFAを必須にするのか？ → パスワード漏洩だけでは管理者操作ができなくなる
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
    // =========================================================================
    /**
     * ■ 最小権限の原則（Principle of Least Privilege）
     *
     *   「必要な人に、必要な権限だけを、必要な期間だけ」付与する。
     *
     *   開発者に必要なサービス：
     *   - Lambda: サーバーレスアプリケーション開発
     *   - S3: ファイルストレージとアプリケーションデータ
     *   - DynamoDB: NoSQLデータベース
     *   - CloudWatch: ログ確認とモニタリング
     *
     *   開発者に不要なサービス（例）：
     *   - IAM: セキュリティ設定の変更（管理者の責務）
     *   - Organizations: 組織構造の変更
     *   - Config/CloudTrail: セキュリティ監視の無効化
     */
    const developerRole = new iam.Role(this, 'DeveloperRole', {
      roleName: 'GovernanceDeveloperRole',
      description: 'Developer role restricted to Lambda, S3, DynamoDB, CloudWatch',
      assumedBy: new iam.AccountPrincipal(this.account),
      permissionsBoundary: permissionBoundaryPolicy,
      maxSessionDuration: cdk.Duration.hours(8),
    });

    // 開発者ポリシー - サービスごとに必要な権限を精密に定義
    const developerPolicy = new iam.ManagedPolicy(this, 'DeveloperPolicy', {
      managedPolicyName: 'GovernanceDeveloperPolicy',
      description: 'Policy for developers: Lambda, S3, DynamoDB, CloudWatch only',
      statements: [
        // Lambda: サーバーレス関数の開発とデプロイ
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
        // なぜリソースを限定するのか？ → 任意のロールをPassRoleできると特権エスカレーションの原因になる
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
    // =========================================================================
    /**
     * ■ なぜOIDCフェデレーションがアクセスキーより優れているのか？
     *
     *   従来の方法: GitHub Secretsにアクセスキーを保存
     *   → 永続的な認証情報がGitHub側に保存される
     *   → キーのローテーション管理が必要
     *   → 漏洩リスクが恒常的に存在
     *
     *   OIDCフェデレーション: GitHubがAWSに直接認証
     *   → AWSに保存される認証情報はゼロ
     *   → GitHubのトークンは短命（ワークフロー実行中のみ有効）
     *   → 特定のリポジトリ/ブランチからのみアクセス可能
     *   → IAMが自動的にGitHubの身元を検証
     *
     *   仕組み:
     *   1. GitHub Actionsがワークフローを実行
     *   2. GitHubがOIDCトークンを発行（リポジトリ、ブランチ情報を含む）
     *   3. AWSのSTSがトークンを検証し、一時認証情報を発行
     *   4. CI/CDが一時認証情報でAWSリソースにアクセス
     *   5. ワークフロー終了後、認証情報は自動失効
     */
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      // GitHubのOIDCプロバイダーのサムプリント
      // これはGitHubの証明書チェーンのルートCA指紋
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    // GitHub Actions用のIAMロール
    const cicdRole = new iam.Role(this, 'CiCdRole', {
      roleName: 'GovernanceCiCdRole',
      description: 'CI/CD role for GitHub Actions using OIDC federation',
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          // 条件: 特定のGitHubリポジトリからのみアクセスを許可
          // これにより、他のリポジトリからのアクセスを完全にブロック
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
    cicdRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EcrAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'ecr:PutImage',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
        ],
        resources: ['*'],
      })
    );

    // SSMパラメータストアからの設定値読み取り
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
    // =========================================================================
    /**
     * ■ クロスアカウントアクセスパターン
     *
     *   マルチアカウント戦略では、セキュリティアカウントから
     *   他のアカウントのリソースを監査する必要があります。
     *
     *   External ID（外部ID）を使う理由:
     *   - 「混乱した代理」問題を防止
     *   - 第三者サービスが、意図しないアカウントにアクセスすることを防ぐ
     *   - 例: SaaS A が自分のAWSロールを経由して、別の顧客Bのアカウントにアクセスする攻撃
     *   - External IDはロール信頼ポリシーの条件として機能し、正しいIDを持つ呼び出し元のみ許可
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
