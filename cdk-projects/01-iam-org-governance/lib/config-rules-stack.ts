import * as cdk from 'aws-cdk-lib';
import * as config from 'aws-cdk-lib/aws-config';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * =============================================================================
 * AWS Config ルール スタック
 * =============================================================================
 *
 * AWS Config は AWS リソースの構成変更を継続的に記録し、望ましい構成からの
 * 逸脱を自動的に検出するサービスです。
 *
 * なぜ継続的コンプライアンス監視が重要なのか？
 *
 *   1. 構成ドリフトの検知:
 *      手動変更やスクリプトの誤りにより、リソースが意図しない状態に変わることが
 *      あります。Config はこれを自動的に検知し、アラートを発行します。
 *
 *   2. 監査証跡の確保:
 *      「いつ、誰が、何を変更したか」の完全な履歴を保持します。
 *      コンプライアンス監査（SOC 2、PCI DSS、ISO 27001 等）で必須の要件です。
 *
 *   3. 自動修復（Auto-Remediation）:
 *      違反を検知するだけでなく、SSM Automation と連携して自動修復が可能です。
 *      例：S3 バケットがパブリックになったら、自動的にブロックパブリックアクセスを有効化
 *
 * マネージドルール vs カスタムルール:
 *
 *   マネージドルール（AWS 提供）:
 *   - 150+ の事前定義されたルール
 *   - 設定のみで利用可能（コーディング不要）
 *   - AWS のベストプラクティスに基づく
 *   - 例：s3-bucket-public-read-prohibited, encrypted-volumes
 *
 *   カスタムルール（Lambda ベース）:
 *   - 組織固有のポリシーを実装可能
 *   - Lambda 関数で評価ロジックを記述
 *   - 柔軟性が高いが、開発・メンテナンスコストがかかる
 *   - 例：必須タグの存在チェック、命名規則の検証
 *
 * 自動修復（Auto-Remediation）の仕組み:
 *
 *   Config ルール違反が検知されると、SSM Automation ドキュメントが
 *   自動的に実行されます。修復の流れ：
 *
 *   1. Config がリソースの構成変更を検知
 *   2. Config ルールが変更を評価し、NON_COMPLIANT と判定
 *   3. 修復アクション（SSM Automation）が自動的にトリガーされる
 *   4. Automation ドキュメントが修復操作を実行
 *   5. Config が再評価し、COMPLIANT になったことを確認
 *
 *   注意：自動修復は強力ですが、意図しない変更を引き起こす可能性があるため、
 *   本番環境では手動承認ステップを追加することを検討してください。
 */
export class ConfigRulesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // 1. AWS Config の基盤設定
    // =========================================================================

    /**
     * Config 記録データの保存先 S3 バケット
     *
     * AWS Config は、リソースの構成変更履歴と構成スナップショットを
     * S3 バケットに配信します。このデータは以下の用途で使われます：
     * - コンプライアンス監査の証跡
     * - Athena によるクエリ分析
     * - 長期保存とアーカイブ
     */
    const configBucket = new s3.Bucket(this, 'ConfigDeliveryBucket', {
      // WARNING: Use RemovalPolicy.RETAIN in production
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
    });

    // Config サービスがバケットにアクセスするためのポリシー
    configBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AWSConfigBucketPermissionsCheck',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('config.amazonaws.com')],
        actions: ['s3:GetBucketAcl'],
        resources: [configBucket.bucketArn],
      })
    );

    configBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AWSConfigBucketDelivery',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('config.amazonaws.com')],
        actions: ['s3:PutObject'],
        resources: [`${configBucket.bucketArn}/AWSLogs/${cdk.Aws.ACCOUNT_ID}/Config/*`],
        conditions: {
          StringEquals: {
            's3:x-amz-acl': 'bucket-owner-full-control',
          },
        },
      })
    );

    /**
     * Config Recorder 用の IAM ロール
     *
     * Configuration Recorder が AWS リソースの構成情報を読み取り、
     * S3 バケットに配信するために必要な権限を付与します。
     * AWS マネージドポリシー AWS_ConfigRole が、
     * 全 AWS リソースの読み取り権限を包括的に提供します。
     */
    const configRole = new iam.Role(this, 'ConfigRecorderRole', {
      assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWS_ConfigRole'),
      ],
    });

    // S3 バケットへの書き込み権限を付与
    configBucket.grantWrite(configRole);

    /**
     * Configuration Recorder
     *
     * 全てのリソースタイプの構成変更を記録します。
     * 注意：Config Recorder はリージョンごとに1つだけ作成できます。
     * 既存のレコーダーがある場合はエラーになるため、
     * 本番環境では事前確認が必要です。
     */
    const configRecorder = new config.CfnConfigurationRecorder(this, 'ConfigRecorder', {
      roleArn: configRole.roleArn,
      recordingGroup: {
        allSupported: true,
        includeGlobalResourceTypes: true,
      },
    });

    /**
     * Delivery Channel
     *
     * Config が記録したデータを S3 バケットに配信するチャネルです。
     * 配信頻度は以下から選択可能：
     * - One_Hour: 1時間ごとにスナップショットを配信
     * - Three_Hours: 3時間ごと
     * - Six_Hours: 6時間ごと（デフォルト）
     * - Twelve_Hours: 12時間ごと
     * - TwentyFour_Hours: 24時間ごと
     *
     * 構成変更の通知は、配信頻度に関係なくリアルタイムで行われます。
     */
    const deliveryChannel = new config.CfnDeliveryChannel(this, 'ConfigDeliveryChannel', {
      s3BucketName: configBucket.bucketName,
      configSnapshotDeliveryProperties: {
        deliveryFrequency: 'Six_Hours',
      },
    });

    // Delivery Channel は Recorder に依存
    deliveryChannel.addDependency(configRecorder);

    // =========================================================================
    // 2. マネージドルール: AWS が提供する事前定義ルール
    // =========================================================================
    /**
     * なぜマネージドルールから始めるべきなのか？
     *
     * - AWS セキュリティチームが維持・更新するため、常に最新の脅威に対応
     * - 設定のみで利用可能で、Lambda 関数の開発・運用が不要
     * - CIS Benchmark、PCI DSS 等の標準フレームワークに準拠したルールが豊富
     * - コスト効率が高い（Lambda 実行コストが発生しない）
     */

    /**
     * ルール 1: S3 バケットのパブリック読み取り禁止
     *
     * S3 バケットのパブリックアクセスは、データ漏洩の最も一般的な原因の一つです。
     * Capital One のデータ漏洩（2019年、1億人以上の個人情報流出）は、
     * 設定ミスによる S3 パブリックアクセスが原因でした。
     *
     * このルールは、S3 バケットがパブリック読み取りを許可していないかを
     * 継続的に監視します。
     */
    const s3PublicReadRule = new config.ManagedRule(this, 'S3BucketPublicReadProhibited', {
      identifier: 'S3_BUCKET_PUBLIC_READ_PROHIBITED',
      configRuleName: 'S3BucketPublicReadProhibited',
      description: 'Checks that S3 buckets do not allow public read access. A NON_COMPLIANT result means the bucket policy or ACL allows public read.',
    });
    s3PublicReadRule.node.addDependency(configRecorder);

    /**
     * ルール 2: ルートアカウントのアクセスキーチェック
     *
     * ルートアカウントのアクセスキーが存在する場合、NON_COMPLIANT になります。
     * ルートアカウントは全てのリソースに無制限のアクセス権を持つため、
     * アクセスキーが漏洩すると壊滅的な被害が発生します。
     *
     * ベストプラクティス：
     * - ルートアカウントのアクセスキーは削除する
     * - 日常作業にはルートアカウントを使用しない
     * - ルートアカウントには MFA を設定する
     */
    const rootAccessKeyRule = new config.ManagedRule(this, 'IamRootAccessKeyCheck', {
      identifier: 'IAM_ROOT_ACCESS_KEY_CHECK',
      configRuleName: 'IamRootAccessKeyCheck',
      description: 'Checks whether the root user access key exists. The rule is NON_COMPLIANT if the root user has access keys configured.',
    });
    rootAccessKeyRule.node.addDependency(configRecorder);

    /**
     * ルール 3: EBS ボリュームの暗号化チェック
     *
     * 暗号化されていない EBS ボリュームは、物理的なディスクの盗難や
     * スナップショットの不正共有によるデータ漏洩のリスクがあります。
     *
     * EBS デフォルト暗号化を有効にすることで、新規ボリュームは
     * 自動的に暗号化されますが、既存ボリュームは対象外です。
     * このルールで既存の未暗号化ボリュームも検出できます。
     */
    const encryptedVolumesRule = new config.ManagedRule(this, 'EncryptedVolumes', {
      identifier: 'ENCRYPTED_VOLUMES',
      configRuleName: 'EncryptedVolumes',
      description: 'Checks whether EBS volumes that are in an attached state are encrypted. The rule is NON_COMPLIANT if an attached EBS volume is unencrypted.',
    });
    encryptedVolumesRule.node.addDependency(configRecorder);

    // =========================================================================
    // 3. カスタムルール: 必須タグの存在チェック
    // =========================================================================
    /**
     * なぜカスタムルールが必要なのか？
     *
     * マネージドルールは汎用的なベストプラクティスをカバーしますが、
     * 組織固有のポリシー（例：特定のタグ付けルール、命名規則、
     * カスタムセキュリティ要件）には対応できません。
     *
     * カスタムルールの仕組み：
     * 1. Config がリソースの構成変更を検知
     * 2. Lambda 関数が呼び出され、evaluation ロジックを実行
     * 3. Lambda が PutEvaluations API で COMPLIANT/NON_COMPLIANT を報告
     * 4. Config がコンプライアンスダッシュボードを更新
     *
     * このカスタムルールは、全リソースに必須タグ（Environment, Owner）が
     * 付けられているかをチェックします。
     *
     * なぜタグが重要なのか？
     * - コスト配分：どのチームが何にいくらかかっているか追跡
     * - アクセス制御：タグベースの IAM ポリシーで権限を動的に管理
     * - 自動化：タグに基づくライフサイクル管理（例：深夜の自動停止）
     * - インシデント対応：問題発生時にリソースの所有者を即座に特定
     */

    // カスタムルール評価用の Lambda 関数
    const tagCheckFunction = new lambda.Function(this, 'RequiredTagsChecker', {
      functionName: 'config-required-tags-checker',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(60),
      description: 'Custom Config rule evaluator: checks for required tags (Environment, Owner) on AWS resources',
      code: lambda.Code.fromInline(`
import json
import boto3

# 必須タグのリスト
# 組織のタグ付けポリシーに合わせて変更してください
REQUIRED_TAGS = ['Environment', 'Owner']

config_client = boto3.client('config')

def handler(event, context):
    """
    AWS Config カスタムルールの評価関数

    この関数は Config から呼び出され、リソースに必須タグが
    付いているかどうかを評価します。

    イベント構造:
    - invokingEvent: リソースの構成情報（JSON文字列）
    - resultToken: 評価結果を報告するためのトークン
    - ruleParameters: ルールのカスタムパラメータ（オプション）

    評価結果:
    - COMPLIANT: 全ての必須タグが存在する
    - NON_COMPLIANT: 1つ以上の必須タグが欠落している
    - NOT_APPLICABLE: タグをサポートしないリソースタイプ
    """
    try:
        invoking_event = json.loads(event['invokingEvent'])
        result_token = event['resultToken']

        # 構成アイテムからリソース情報を取得
        configuration_item = invoking_event.get('configurationItem', {})
        resource_type = configuration_item.get('resourceType', '')
        resource_id = configuration_item.get('resourceId', '')

        # リソースが削除された場合は評価対象外
        if configuration_item.get('configurationItemStatus') == 'ResourceDeleted':
            compliance_type = 'NOT_APPLICABLE'
            annotation = 'Resource has been deleted.'
        else:
            # リソースのタグを取得
            tags = configuration_item.get('tags', {})

            if tags is None:
                tags = {}

            # 必須タグの存在チェック
            missing_tags = [tag for tag in REQUIRED_TAGS if tag not in tags]

            if not missing_tags:
                compliance_type = 'COMPLIANT'
                annotation = 'All required tags are present.'
            else:
                compliance_type = 'NON_COMPLIANT'
                annotation = f'Missing required tags: {", ".join(missing_tags)}'

        # 評価結果を Config に報告
        evaluation = {
            'ComplianceResourceType': resource_type,
            'ComplianceResourceId': resource_id,
            'ComplianceType': compliance_type,
            'Annotation': annotation,
            'OrderingTimestamp': configuration_item.get(
                'configurationItemCaptureTime',
                '2024-01-01T00:00:00.000Z'
            ),
        }

        config_client.put_evaluations(
            Evaluations=[evaluation],
            ResultToken=result_token,
        )

        return {
            'statusCode': 200,
            'body': json.dumps({
                'resourceId': resource_id,
                'complianceType': compliance_type,
                'annotation': annotation,
            }),
        }
    except Exception as e:
        print(f'Error evaluating Config rule: {e}')
        # エラー発生時は NOT_APPLICABLE として報告し、評価を中断しない
        try:
            config_client.put_evaluations(
                Evaluations=[{
                    'ComplianceResourceType': configuration_item.get('resourceType', 'AWS::::Account') if 'configuration_item' in dir() else 'AWS::::Account',
                    'ComplianceResourceId': configuration_item.get('resourceId', 'UNKNOWN') if 'configuration_item' in dir() else 'UNKNOWN',
                    'ComplianceType': 'NOT_APPLICABLE',
                    'Annotation': f'Error during evaluation: {str(e)[:200]}',
                    'OrderingTimestamp': configuration_item.get('configurationItemCaptureTime', '2024-01-01T00:00:00.000Z') if 'configuration_item' in dir() else '2024-01-01T00:00:00.000Z',
                }],
                ResultToken=event.get('resultToken', ''),
            )
        except Exception as inner_e:
            print(f'Failed to report evaluation error: {inner_e}')
        raise RuntimeError(f'Config rule evaluation failed: {e}') from e
`),
    });

    // Config サービスが Lambda を呼び出すための権限
    tagCheckFunction.addPermission('ConfigInvokePermission', {
      principal: new iam.ServicePrincipal('config.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });

    // Lambda が Config に評価結果を書き込むための権限
    tagCheckFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['config:PutEvaluations'],
        resources: ['*'],
      })
    );

    // カスタム Config ルールの定義
    const requiredTagsRule = new config.CustomRule(this, 'RequiredTagsRule', {
      configRuleName: 'RequiredTagsCheck',
      description: 'Checks that all resources have the required tags: Environment and Owner. Resources missing these tags are marked NON_COMPLIANT.',
      lambdaFunction: tagCheckFunction,
      // ConfigurationChanges: リソースが作成・変更・削除されたときに評価
      // PeriodicExecution を追加すると、定期的にも評価可能
      configurationChanges: true,
    });
    requiredTagsRule.node.addDependency(configRecorder);

    // =========================================================================
    // 4. 自動修復: S3 パブリックアクセスルールの違反を自動修復
    // =========================================================================
    /**
     * SSM Automation による自動修復の仕組み
     *
     * Config ルール違反 -> SSM Automation ドキュメント実行 -> リソース修復
     *
     * ここでは AWSConfigRemediation-ConfigureS3BucketPublicAccessBlock
     * という AWS 提供の Automation ドキュメントを使用して、
     * S3 バケットのパブリックアクセスを自動的にブロックします。
     *
     * 自動修復の注意点：
     * - 自動修復は便利ですが、意図的にパブリックにしているバケット
     *  （静的ウェブサイトホスティング等）にも適用される可能性がある
     * - 本番環境では、対象リソースのスコープを限定するか、
     *   手動承認ステップを追加することを推奨
     * - 修復アクションの実行には適切な IAM 権限が必要
     */

    // 自動修復用の IAM ロール
    const remediationRole = new iam.Role(this, 'ConfigRemediationRole', {
      assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
      description: 'Role for SSM Automation to remediate Config rule violations',
    });

    remediationRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:PutBucketPublicAccessBlock',
          's3:GetBucketPublicAccessBlock',
        ],
        resources: ['arn:aws:s3:::*'],
      })
    );

    // S3 パブリックアクセスルールに対する自動修復設定
    new config.CfnRemediationConfiguration(this, 'S3PublicAccessRemediation', {
      configRuleName: s3PublicReadRule.configRuleName,
      targetType: 'SSM_DOCUMENT',
      // AWS 提供の修復ドキュメント: S3 Block Public Access を有効化
      targetId: 'AWS-DisableS3BucketPublicReadWrite',
      // 自動修復を有効化
      // false にすると手動トリガーのみになる
      automatic: true,
      // 最大自動修復試行回数
      maximumAutomaticAttempts: 3,
      // 再試行間隔（秒）
      retryAttemptSeconds: 60,
      parameters: {
        S3BucketName: {
          ResourceValue: {
            Value: 'RESOURCE_ID',
          },
        },
        AutomationAssumeRole: {
          StaticValue: {
            Values: [remediationRole.roleArn],
          },
        },
      },
    });

    // =========================================================================
    // 5. CfnOutputs
    // =========================================================================
    new cdk.CfnOutput(this, 'S3PublicReadRuleNameOutput', {
      value: s3PublicReadRule.configRuleName,
      description: 'Config rule name for S3 public read prohibition check',
      exportName: 'ConfigS3PublicReadRuleName',
    });

    new cdk.CfnOutput(this, 'RootAccessKeyRuleNameOutput', {
      value: rootAccessKeyRule.configRuleName,
      description: 'Config rule name for IAM root access key check',
      exportName: 'ConfigRootAccessKeyRuleName',
    });

    new cdk.CfnOutput(this, 'EncryptedVolumesRuleNameOutput', {
      value: encryptedVolumesRule.configRuleName,
      description: 'Config rule name for EBS encrypted volumes check',
      exportName: 'ConfigEncryptedVolumesRuleName',
    });

    new cdk.CfnOutput(this, 'RequiredTagsRuleNameOutput', {
      value: requiredTagsRule.configRuleName,
      description: 'Config rule name for required tags check (custom rule)',
      exportName: 'ConfigRequiredTagsRuleName',
    });

    new cdk.CfnOutput(this, 'ConfigBucketNameOutput', {
      value: configBucket.bucketName,
      description: 'S3 bucket name for Config delivery',
      exportName: 'ConfigDeliveryBucketName',
    });
  }
}
