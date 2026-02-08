import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { IamRolesStack } from '../lib/iam-roles-stack';
import { OrgScpStack } from '../lib/org-scp-stack';
import { ConfigRulesStack } from '../lib/config-rules-stack';

/**
 * =============================================================================
 * IAM・Organizations・Config ガバナンス テストスイート
 * =============================================================================
 *
 * CDK アプリケーションのインフラストラクチャテストです。
 * aws-cdk-lib/assertions を使用して、合成された CloudFormation テンプレートを
 * 検証します。
 *
 * テストの目的：
 * - スタックが正しく合成されることを確認
 * - 期待されるリソースが作成されることを確認
 * - セキュリティ上重要な設定（権限境界、暗号化等）が漏れなく適用されていることを確認
 */

// =============================================================================
// IamRolesStack のテスト
// =============================================================================
describe('IamRolesStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new IamRolesStack(app, 'TestIamRolesStack');
    template = Template.fromStack(stack);
  });

  test('creates IAM roles with expected names', () => {
    // AdminRole が作成されていることを確認
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'GovernanceAdminRole',
    });

    // DeveloperRole が作成されていることを確認
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'GovernanceDeveloperRole',
    });

    // CI/CD Role が作成されていることを確認
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'GovernanceCiCdRole',
    });
  });

  test('creates permission boundary managed policy', () => {
    template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
      ManagedPolicyName: 'GovernancePermissionBoundary',
    });
  });

  test('admin role has permission boundary attached', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'GovernanceAdminRole',
      PermissionsBoundary: Match.anyValue(),
    });
  });

  test('developer role has permission boundary attached', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'GovernanceDeveloperRole',
      PermissionsBoundary: Match.anyValue(),
    });
  });

  test('creates GitHub OIDC provider', () => {
    template.hasResourceProperties('Custom::AWSCDKOpenIdConnectProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIDList: ['sts.amazonaws.com'],
    });
  });

  test('creates cross-account audit role', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'GovernanceCrossAccountAuditRole',
    });
  });

  test('creates developer managed policy with expected name', () => {
    template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
      ManagedPolicyName: 'GovernanceDeveloperPolicy',
    });
  });

  test('CI/CD role has scoped ECR permissions with separate auth token policy', () => {
    // GetAuthorizationToken はリソースレベル権限非対応のためワイルカード必須
    // CDK は単一アクションを文字列として出力するため string でマッチ
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'EcrAuthToken',
            Effect: 'Allow',
            Action: 'ecr:GetAuthorizationToken',
            Resource: '*',
          }),
        ]),
      },
    });

    // リポジトリ操作はアカウントスコープに限定されていること（Fn::JoinでARN構築）
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'EcrRepositoryAccess',
            Effect: 'Allow',
            Resource: {
              'Fn::Join': Match.arrayWith([
                Match.arrayWith([
                  'arn:aws:ecr:',
                ]),
              ]),
            },
          }),
        ]),
      },
    });
  });

  test('outputs role ARNs', () => {
    template.hasOutput('AdminRoleArnOutput', {});
    template.hasOutput('DeveloperRoleArnOutput', {});
    template.hasOutput('CiCdRoleArnOutput', {});
    template.hasOutput('CrossAccountAuditRoleArnOutput', {});
    template.hasOutput('PermissionBoundaryArnOutput', {});
  });
});

// =============================================================================
// OrgScpStack のテスト
// =============================================================================
describe('OrgScpStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new OrgScpStack(app, 'TestOrgScpStack');
    template = Template.fromStack(stack);
  });

  test('stack synthesizes without errors', () => {
    // OrgScpStack は CfnOutput のみを持つ（SCP ポリシードキュメントを出力）
    // エラーなく合成されることを確認
    expect(template.toJSON()).toBeDefined();
  });

  test('outputs region restriction SCP policy document', () => {
    template.hasOutput('RegionRestrictionScpOutput', {});
  });

  test('outputs security services protection SCP policy document', () => {
    template.hasOutput('SecurityServicesProtectionScpOutput', {});
  });

  test('outputs deny IAM user creation SCP policy document', () => {
    template.hasOutput('DenyIamUserCreationScpOutput', {});
  });

  test('outputs additional guardrails SCP policy document', () => {
    template.hasOutput('AdditionalGuardrailsScpOutput', {});
  });
});

// =============================================================================
// ConfigRulesStack のテスト
// =============================================================================
describe('ConfigRulesStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new ConfigRulesStack(app, 'TestConfigRulesStack');
    template = Template.fromStack(stack);
  });

  test('creates AWS Config recorder', () => {
    template.hasResourceProperties('AWS::Config::ConfigurationRecorder', {
      RecordingGroup: {
        AllSupported: true,
        IncludeGlobalResourceTypes: true,
      },
    });
  });

  test('creates Config delivery channel with S3 bucket', () => {
    template.hasResourceProperties('AWS::Config::DeliveryChannel', {
      ConfigSnapshotDeliveryProperties: {
        DeliveryFrequency: 'Six_Hours',
      },
    });
  });

  test('creates S3 bucket for Config delivery with encryption and public access blocked', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('creates managed Config rule for S3 public read prohibited', () => {
    template.hasResourceProperties('AWS::Config::ConfigRule', {
      ConfigRuleName: 'S3BucketPublicReadProhibited',
      Source: {
        SourceIdentifier: 'S3_BUCKET_PUBLIC_READ_PROHIBITED',
      },
    });
  });

  test('creates managed Config rule for IAM root access key check', () => {
    template.hasResourceProperties('AWS::Config::ConfigRule', {
      ConfigRuleName: 'IamRootAccessKeyCheck',
      Source: {
        SourceIdentifier: 'IAM_ROOT_ACCESS_KEY_CHECK',
      },
    });
  });

  test('creates managed Config rule for encrypted volumes', () => {
    template.hasResourceProperties('AWS::Config::ConfigRule', {
      ConfigRuleName: 'EncryptedVolumes',
      Source: {
        SourceIdentifier: 'ENCRYPTED_VOLUMES',
      },
    });
  });

  test('creates custom Config rule for required tags check', () => {
    template.hasResourceProperties('AWS::Config::ConfigRule', {
      ConfigRuleName: 'RequiredTagsCheck',
      Source: {
        Owner: 'CUSTOM_LAMBDA',
      },
    });
  });

  test('creates Lambda function for custom rule evaluation', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'config-required-tags-checker',
      Runtime: 'python3.12',
      Timeout: 60,
    });
  });

  test('creates remediation configuration for S3 public access rule', () => {
    template.hasResourceProperties('AWS::Config::RemediationConfiguration', {
      ConfigRuleName: Match.anyValue(),
      TargetType: 'SSM_DOCUMENT',
      TargetId: 'AWS-DisableS3BucketPublicReadWrite',
      Automatic: true,
    });
  });

  test('Config Lambda includes error handling', () => {
    const resources = template.toJSON().Resources;
    const lambdaFn = Object.values(resources).find(
      (r: any) => r.Type === 'AWS::Lambda::Function' &&
                   r.Properties.FunctionName === 'config-required-tags-checker'
    ) as any;
    expect(lambdaFn).toBeDefined();
    const code = lambdaFn.Properties.Code.ZipFile;
    expect(code).toContain('try:');
    expect(code).toContain('except Exception as e:');
    expect(code).toContain('NOT_APPLICABLE');
  });

  test('outputs Config rule names', () => {
    template.hasOutput('S3PublicReadRuleNameOutput', {});
    template.hasOutput('RootAccessKeyRuleNameOutput', {});
    template.hasOutput('EncryptedVolumesRuleNameOutput', {});
    template.hasOutput('RequiredTagsRuleNameOutput', {});
    template.hasOutput('ConfigBucketNameOutput', {});
  });
});
