import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * =============================================================================
 * Organizations SCP（サービスコントロールポリシー）スタック
 * =============================================================================
 *
 * ■ SCPとは何か？ なぜ重要なのか？
 *
 *   SCP（Service Control Policy）は、AWS Organizations内のアカウントに対する
 *   「ガードレール」です。これは権限の「付与」ではなく「上限の設定」です。
 *
 *   重要な概念:
 *   - SCPは権限を「付与しない」 → IAMポリシーが権限を付与する
 *   - SCPは権限の「最大範囲」を制限する → フィルターとして機能
 *   - SCPはルートアカウントにも適用される → IAMポリシーでは不可能
 *   - SCPは管理アカウントには適用されない → 管理アカウントは特別な保護が必要
 *
 *   例え話:
 *   IAMポリシー = 「従業員に渡す鍵」（特定のドアを開ける権限）
 *   SCP = 「ビルのフロアアクセス制限」（そもそもそのフロアに行けない）
 *
 * ■ Deny-list戦略 vs Allow-list戦略
 *
 *   Deny-list（このスタックで採用）:
 *   - デフォルトで全サービスを許可し、特定のアクションを明示的に拒否
 *   - メリット: 新しいAWSサービスが自動的に利用可能、管理が容易
 *   - デメリット: 「禁止し忘れ」のリスク、予期しないサービス利用の可能性
 *   - 適用場面: ほとんどのサービスを使いたいが、危険な操作だけを禁止したい場合
 *
 *   Allow-list:
 *   - デフォルトで全サービスを拒否し、必要なサービスのみ明示的に許可
 *   - メリット: 最も安全、予期しないサービス利用を完全に防止
 *   - デメリット: 新サービス利用時に毎回SCP更新が必要、運用負荷が高い
 *   - 適用場面: 金融・医療など厳格な規制産業
 *
 *   実務的推奨: Deny-listをベースにし、最も重要な制限をSCPで、
 *   細かい制御はIAMポリシーで行う「ハイブリッド」アプローチ。
 *
 * ■ 注意事項
 *   このスタックは Organizations API を直接呼び出しません。
 *   Organizations の操作には管理アカウントでのセットアップが必要です。
 *   ここではポリシードキュメントの定義と出力に焦点を当て、
 *   実際のデプロイはOrganizations管理アカウントで行うことを想定しています。
 */
export class OrgScpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // 1. リージョン制限 SCP
    // =========================================================================
    /**
     * ■ なぜリージョンを制限するのか？
     *
     *   - データレジデンシー要件: 日本の個人情報保護法やGDPRなどの規制により、
     *     データの保管場所を特定のリージョンに限定する必要がある
     *   - コスト管理: 未使用リージョンでリソースが作成されるとコスト漏れが発生
     *   - セキュリティ: 攻撃者が未監視のリージョンにリソースを作成するのを防止
     *     （暗号通貨マイニングなどの不正利用パターン）
     *   - 運用効率: 監視対象リージョンを限定し、アラートの精度を向上
     *
     *   例外サービス: IAM、STS、CloudFront、Route 53、Support、Billing
     *   これらはグローバルサービスなのでリージョン制限から除外する必要がある
     */
    const regionRestrictionPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyActionsOutsideAllowedRegions',
          Effect: 'Deny',
          NotAction: [
            // グローバルサービスはリージョン制限の対象外
            // これらを除外しないと、IAMロールの作成やRoute 53の操作が不可能になる
            'iam:*',
            'sts:*',
            'organizations:*',
            's3:GetBucketLocation',
            's3:ListAllMyBuckets',
            'cloudfront:*',
            'route53:*',
            'route53domains:*',
            'support:*',
            'health:*',
            'trustedadvisor:*',
            'billing:*',
            'budgets:*',
            'cur:*',            // Cost and Usage Reports
            'ce:*',             // Cost Explorer
            'tax:*',
            'waf:*',            // WAF (グローバル)
            'wafv2:*',
            'shield:*',
            'globalaccelerator:*',
          ],
          Resource: '*',
          Condition: {
            StringNotEquals: {
              'aws:RequestedRegion': [
                'ap-northeast-1',  // 東京
                'us-east-1',       // バージニア（CloudFront等のグローバルリソース用）
              ],
            },
          },
        },
      ],
    };

    // =========================================================================
    // 2. セキュリティサービス保護 SCP
    // =========================================================================
    /**
     * ■ なぜセキュリティサービスの無効化を禁止するのか？
     *
     *   攻撃者がAWSアカウントに侵入した場合、最初に行うのは
     *   セキュリティ監視の無効化です。これにより：
     *   - CloudTrail停止 → APIコールの記録が消える → 証跡を隠蔽
     *   - GuardDuty停止 → 脅威検知が止まる → 不審な行動が検出されない
     *   - Config停止 → 構成変更の記録が消える → 何が変更されたか不明
     *   - SecurityHub停止 → セキュリティアラートの集約が止まる
     *
     *   SCPでこれらのアクションを禁止することで、たとえ管理者権限が
     *   侵害されても、監視を無効化できないようにします。
     *   これは「Detection（検知）」層の保護であり、
     *   「Prevention（予防）」だけでは不十分な場合の安全策です。
     */
    const securityServicesProtectionPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyDisablingCloudTrail',
          Effect: 'Deny',
          Action: [
            'cloudtrail:StopLogging',
            'cloudtrail:DeleteTrail',
            'cloudtrail:UpdateTrail',
          ],
          Resource: '*',
        },
        {
          Sid: 'DenyDisablingGuardDuty',
          Effect: 'Deny',
          Action: [
            'guardduty:DeleteDetector',
            'guardduty:DisassociateFromMasterAccount',
            'guardduty:DisassociateMembers',
            'guardduty:StopMonitoringMembers',
            'guardduty:UpdateDetector',
          ],
          Resource: '*',
          // UpdateDetectorは設定変更が必要な場合があるため、
          // 無効化（Status=DISABLED）のみを拒否する条件を付けることも可能
        },
        {
          Sid: 'DenyDisablingConfig',
          Effect: 'Deny',
          Action: [
            'config:StopConfigurationRecorder',
            'config:DeleteConfigurationRecorder',
            'config:DeleteDeliveryChannel',
            'config:DeleteRetentionConfiguration',
          ],
          Resource: '*',
        },
        {
          Sid: 'DenyDisablingSecurityHub',
          Effect: 'Deny',
          Action: [
            'securityhub:DisableSecurityHub',
            'securityhub:DeleteMembers',
            'securityhub:DisassociateMembers',
          ],
          Resource: '*',
        },
        {
          Sid: 'DenyDeletingFlowLogs',
          Effect: 'Deny',
          Action: [
            'ec2:DeleteFlowLogs',
            'logs:DeleteLogGroup',
          ],
          Resource: '*',
          // 注意: 本番環境では、特定のログループのみ保護するように
          // リソースARNを限定することを推奨
        },
      ],
    };

    // =========================================================================
    // 3. IAMユーザー制限 SCP（SSO強制）
    // =========================================================================
    /**
     * ■ なぜIAMユーザーの作成を禁止してSSOを強制するのか？
     *
     *   IAMユーザーの問題点:
     *   - パスワードが永続的 → 漏洩リスクが恒常的に存在
     *   - アクセスキーが永続的 → コードやログに混入するリスク
     *   - MFA設定が各ユーザー任せ → 設定し忘れるリスク
     *   - ユーザー管理が分散 → アカウントごとにユーザーを管理する必要
     *   - 退職者対応が困難 → 全アカウントのIAMユーザーを個別に削除
     *
     *   SSO（IAM Identity Center）のメリット:
     *   - 認証の一元管理 → Active Directory/Okta/Azure ADと統合
     *   - 一時的な認証情報 → セッションベースでアクセス
     *   - MFA一元管理 → IdP側で強制可能
     *   - 退職者対応が容易 → IdPでアカウント無効化すれば全アクセスが停止
     *   - 監査が容易 → 誰がどのアカウントにいつアクセスしたか一元管理
     *
     *   このSCPはIAMユーザーの作成とコンソールパスワードの設定を
     *   禁止することで、SSOの使用を強制します。
     */
    const denyIamUserCreationPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyCreatingIamUsersWithConsoleAccess',
          Effect: 'Deny',
          Action: [
            'iam:CreateUser',
            'iam:CreateLoginProfile',
            'iam:UpdateLoginProfile',
            'iam:CreateAccessKey',
          ],
          Resource: '*',
          // 例外: 自動化パイプラインによるサービスアカウントの作成は
          // 特定の条件で許可することも検討可能
          // Condition: {
          //   StringNotLike: {
          //     'aws:PrincipalArn': 'arn:aws:iam::*:role/OrganizationAdminRole'
          //   }
          // }
        },
        {
          Sid: 'DenyCreatingAccessKeys',
          Effect: 'Deny',
          Action: [
            'iam:CreateAccessKey',
          ],
          Resource: '*',
          // アクセスキーの作成を禁止
          // サービスアカウントが必要な場合は、IAMロール + AssumeRole を使用
        },
      ],
    };

    // =========================================================================
    // 4. 追加のガードレール: 高リスクアクションの制限
    // =========================================================================
    /**
     * ■ その他の推奨SCP制限
     *
     *   以下は追加のガードレールとして検討すべき制限です：
     *   - S3バケットポリシーでのパブリックアクセス許可の禁止
     *   - RDSインスタンスのパブリックアクセス禁止
     *   - EC2インスタンスのIMDSv1使用禁止（SSRF攻撃対策）
     *   - ルートアカウントのアクションを制限
     */
    const additionalGuardrailsPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyS3PublicAccess',
          Effect: 'Deny',
          Action: [
            's3:PutBucketPublicAccessBlock',
          ],
          Resource: '*',
          Condition: {
            // Block Public Accessの無効化を禁止
            // つまり、パブリックアクセスのブロックを解除できない
            StringEquals: {
              's3:publicAccessBlockConfiguration/BlockPublicAcls': 'false',
            },
          },
        },
        {
          Sid: 'DenyRootAccountActions',
          Effect: 'Deny',
          Action: '*',
          Resource: '*',
          Condition: {
            StringLike: {
              'aws:PrincipalArn': 'arn:aws:iam::*:root',
            },
          },
        },
        {
          Sid: 'DenyLeavingOrganization',
          Effect: 'Deny',
          Action: [
            'organizations:LeaveOrganization',
          ],
          Resource: '*',
          // メンバーアカウントが組織を離脱することを防止
          // 離脱するとSCPが適用されなくなるため
        },
      ],
    };

    // =========================================================================
    // 5. OU（組織単位）構造の例（参考情報）
    // =========================================================================
    /**
     * ■ 推奨OU構造:
     *
     *   Root
     *   ├── Security OU          ← セキュリティ監査・ログ集約アカウント
     *   │   ├── Log Archive Account
     *   │   └── Security Tooling Account
     *   ├── Infrastructure OU    ← 共有インフラ（ネットワーク、DNS等）
     *   │   └── Network Account
     *   ├── Sandbox OU           ← 開発者実験用（制限緩め、自動削除あり）
     *   │   └── Developer Sandbox Accounts
     *   ├── Workloads OU         ← 本番ワークロード
     *   │   ├── Production OU
     *   │   │   └── Prod Accounts
     *   │   └── Non-Production OU
     *   │       ├── Dev Accounts
     *   │       └── Staging Accounts
     *   └── Suspended OU         ← 廃止予定アカウント（全アクション拒否）
     *
     *   各OUに適切なSCPを適用することで、階層的なガバナンスを実現します。
     *   例: Sandbox OUには緩めのSCP、Production OUには厳格なSCP
     */

    // =========================================================================
    // 6. CfnOutputs - ポリシードキュメントの出力
    // =========================================================================
    /**
     * ポリシードキュメントをCfnOutputとして出力します。
     * 実際のOrganizations環境では、これらのJSONをSCPとして適用してください。
     *
     * 適用方法:
     * aws organizations create-policy \
     *   --name "RegionRestriction" \
     *   --type SERVICE_CONTROL_POLICY \
     *   --content file://region-restriction-scp.json
     *
     * aws organizations attach-policy \
     *   --policy-id p-xxxx \
     *   --target-id ou-xxxx-xxxxxxxx
     */
    new cdk.CfnOutput(this, 'RegionRestrictionScpOutput', {
      value: JSON.stringify(regionRestrictionPolicy, null, 2),
      description: 'SCP policy document: Deny actions outside allowed regions (ap-northeast-1, us-east-1)',
    });

    new cdk.CfnOutput(this, 'SecurityServicesProtectionScpOutput', {
      value: JSON.stringify(securityServicesProtectionPolicy, null, 2),
      description: 'SCP policy document: Deny disabling CloudTrail, GuardDuty, Config, SecurityHub',
    });

    new cdk.CfnOutput(this, 'DenyIamUserCreationScpOutput', {
      value: JSON.stringify(denyIamUserCreationPolicy, null, 2),
      description: 'SCP policy document: Deny creating IAM users with console password (force SSO)',
    });

    new cdk.CfnOutput(this, 'AdditionalGuardrailsScpOutput', {
      value: JSON.stringify(additionalGuardrailsPolicy, null, 2),
      description: 'SCP policy document: Additional guardrails (deny S3 public access, root actions, leaving org)',
    });
  }
}
