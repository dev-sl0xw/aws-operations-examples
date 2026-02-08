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
/**
 * =============================================================================
 * AWS Config 규칙 스택
 * =============================================================================
 *
 * AWS Config는 AWS 리소스의 구성 변경을 지속적으로 기록하고, 원하는 구성에서
 * 벗어나는 것을 자동으로 감지하는 서비스입니다.
 *
 * 왜 지속적 컴플라이언스 모니터링이 중요한가?
 *
 *   1. 구성 드리프트 감지:
 *      수동 변경이나 스크립트 오류로 인해 리소스가 의도하지 않은 상태로 변경될 수
 *      있습니다. Config는 이를 자동으로 감지하고 알림을 발행합니다.
 *
 *   2. 감사 추적 확보:
 *      "언제, 누가, 무엇을 변경했는가"의 완전한 이력을 보유합니다.
 *      컴플라이언스 감사(SOC 2, PCI DSS, ISO 27001 등)에서 필수 요건입니다.
 *
 *   3. 자동 복구(Auto-Remediation):
 *      위반을 감지할 뿐만 아니라, SSM Automation과 연계하여 자동 복구가 가능합니다.
 *      예: S3 버킷이 퍼블릭이 되면, 자동으로 Block Public Access를 활성화
 *
 * 관리형 규칙 vs 사용자 정의 규칙:
 *
 *   관리형 규칙(AWS 제공):
 *   - 150개 이상의 사전 정의된 규칙
 *   - 설정만으로 이용 가능(코딩 불필요)
 *   - AWS 모범 사례에 기반
 *   - 예: s3-bucket-public-read-prohibited, encrypted-volumes
 *
 *   사용자 정의 규칙(Lambda 기반):
 *   - 조직 고유의 정책을 구현 가능
 *   - Lambda 함수로 평가 로직을 작성
 *   - 유연성이 높지만, 개발 및 유지보수 비용이 발생
 *   - 예: 필수 태그 존재 확인, 네이밍 규칙 검증
 *
 * 자동 복구(Auto-Remediation)의 구조:
 *
 *   Config 규칙 위반이 감지되면, SSM Automation 문서가
 *   자동으로 실행됩니다. 복구 흐름:
 *
 *   1. Config가 리소스의 구성 변경을 감지
 *   2. Config 규칙이 변경을 평가하고, NON_COMPLIANT로 판정
 *   3. 복구 액션(SSM Automation)이 자동으로 트리거됨
 *   4. Automation 문서가 복구 작업을 실행
 *   5. Config가 재평가하여, COMPLIANT가 되었음을 확인
 *
 *   주의: 자동 복구는 강력하지만, 의도하지 않은 변경을 일으킬 가능성이 있으므로,
 *   프로덕션 환경에서는 수동 승인 단계를 추가하는 것을 검토해주세요.
 */
export class ConfigRulesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // 1. AWS Config の基盤設定
    // =========================================================================
    // 1. AWS Config 기반 설정
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
    /**
     * Config 기록 데이터 저장용 S3 버킷
     *
     * AWS Config는 리소스의 구성 변경 이력과 구성 스냅샷을
     * S3 버킷에 전달합니다. 이 데이터는 다음 용도로 사용됩니다:
     * - 컴플라이언스 감사 증적
     * - Athena를 통한 쿼리 분석
     * - 장기 보관 및 아카이브
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
    // Config 서비스가 버킷에 접근하기 위한 정책
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
    /**
     * Config Recorder용 IAM 역할
     *
     * Configuration Recorder가 AWS 리소스의 구성 정보를 읽고,
     * S3 버킷에 전달하기 위해 필요한 권한을 부여합니다.
     * AWS 관리형 정책 AWS_ConfigRole이
     * 모든 AWS 리소스의 읽기 권한을 포괄적으로 제공합니다.
     */
    const configRole = new iam.Role(this, 'ConfigRecorderRole', {
      assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWS_ConfigRole'),
      ],
    });

    // S3 バケットへの書き込み権限を付与
    // S3 버킷에 대한 쓰기 권한 부여
    configBucket.grantWrite(configRole);

    /**
     * Configuration Recorder
     *
     * 全てのリソースタイプの構成変更を記録します。
     * 注意：Config Recorder はリージョンごとに1つだけ作成できます。
     * 既存のレコーダーがある場合はエラーになるため、
     * 本番環境では事前確認が必要です。
     */
    /**
     * Configuration Recorder
     *
     * 모든 리소스 타입의 구성 변경을 기록합니다.
     * 주의: Config Recorder는 리전당 하나만 생성할 수 있습니다.
     * 기존 레코더가 있는 경우 에러가 발생하므로,
     * 프로덕션 환경에서는 사전 확인이 필요합니다.
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
    /**
     * Delivery Channel
     *
     * Config가 기록한 데이터를 S3 버킷에 전달하는 채널입니다.
     * 전달 빈도는 아래에서 선택 가능:
     * - One_Hour: 1시간마다 스냅샷 전달
     * - Three_Hours: 3시간마다
     * - Six_Hours: 6시간마다 (기본값)
     * - Twelve_Hours: 12시간마다
     * - TwentyFour_Hours: 24시간마다
     *
     * 구성 변경 알림은 전달 빈도와 관계없이 실시간으로 이루어집니다.
     */
    const deliveryChannel = new config.CfnDeliveryChannel(this, 'ConfigDeliveryChannel', {
      s3BucketName: configBucket.bucketName,
      configSnapshotDeliveryProperties: {
        deliveryFrequency: 'Six_Hours',
      },
    });

    // Delivery Channel は Recorder に依存
    // Delivery Channel은 Recorder에 의존
    deliveryChannel.addDependency(configRecorder);

    // =========================================================================
    // 2. マネージドルール: AWS が提供する事前定義ルール
    // =========================================================================
    // 2. 관리형 규칙: AWS가 제공하는 사전 정의 규칙
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
     * 왜 관리형 규칙부터 시작해야 하는가?
     *
     * - AWS 보안 팀이 유지 및 업데이트하므로, 항상 최신 위협에 대응
     * - 설정만으로 이용 가능하며, Lambda 함수 개발/운영이 불필요
     * - CIS Benchmark, PCI DSS 등 표준 프레임워크에 준거한 규칙이 풍부
     * - 비용 효율이 높음 (Lambda 실행 비용이 발생하지 않음)
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
    /**
     * 규칙 1: S3 버킷의 퍼블릭 읽기 금지
     *
     * S3 버킷의 퍼블릭 액세스는 데이터 유출의 가장 일반적인 원인 중 하나입니다.
     * Capital One의 데이터 유출(2019년, 1억 명 이상의 개인정보 유출)은
     * 설정 실수로 인한 S3 퍼블릭 액세스가 원인이었습니다.
     *
     * 이 규칙은 S3 버킷이 퍼블릭 읽기를 허용하고 있지 않은지를
     * 지속적으로 모니터링합니다.
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
    /**
     * 규칙 2: 루트 계정 액세스 키 확인
     *
     * 루트 계정의 액세스 키가 존재하는 경우 NON_COMPLIANT가 됩니다.
     * 루트 계정은 모든 리소스에 무제한 액세스 권한을 가지므로,
     * 액세스 키가 유출되면 치명적인 피해가 발생합니다.
     *
     * 모범 사례:
     * - 루트 계정의 액세스 키는 삭제한다
     * - 일상 작업에 루트 계정을 사용하지 않는다
     * - 루트 계정에 MFA를 설정한다
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
    /**
     * 규칙 3: EBS 볼륨 암호화 확인
     *
     * 암호화되지 않은 EBS 볼륨은 물리적 디스크 도난이나
     * 스냅샷의 무단 공유로 인한 데이터 유출 위험이 있습니다.
     *
     * EBS 기본 암호화를 활성화하면 새 볼륨은
     * 자동으로 암호화되지만, 기존 볼륨은 대상이 아닙니다.
     * 이 규칙으로 기존의 미암호화 볼륨도 탐지할 수 있습니다.
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
    // 3. 사용자 정의 규칙: 필수 태그 존재 확인
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
    /**
     * 왜 사용자 정의 규칙이 필요한가?
     *
     * 관리형 규칙은 범용적인 모범 사례를 커버하지만,
     * 조직 고유의 정책(예: 특정 태깅 규칙, 네이밍 규칙,
     * 커스텀 보안 요건)에는 대응할 수 없습니다.
     *
     * 사용자 정의 규칙의 구조:
     * 1. Config가 리소스의 구성 변경을 감지
     * 2. Lambda 함수가 호출되어 evaluation 로직을 실행
     * 3. Lambda가 PutEvaluations API로 COMPLIANT/NON_COMPLIANT를 보고
     * 4. Config가 컴플라이언스 대시보드를 업데이트
     *
     * 이 사용자 정의 규칙은 모든 리소스에 필수 태그(Environment, Owner)가
     * 부여되어 있는지 확인합니다.
     *
     * 왜 태그가 중요한가?
     * - 비용 배분: 어떤 팀이 무엇에 얼마를 쓰고 있는지 추적
     * - 액세스 제어: 태그 기반 IAM 정책으로 권한을 동적으로 관리
     * - 자동화: 태그에 기반한 라이프사이클 관리(예: 심야 자동 중지)
     * - 인시던트 대응: 문제 발생 시 리소스 소유자를 즉시 파악
     */

    // カスタムルール評価用の Lambda 関数
    // 사용자 정의 규칙 평가용 Lambda 함수
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
# 필수 태그 목록
# 조직의 태깅 정책에 맞게 변경해주세요
REQUIRED_TAGS = ['Environment', 'Owner']

config_client = boto3.client('config')

def handler(event, context):
    """
    AWS Config カスタムルールの評価関数
    AWS Config 사용자 정의 규칙 평가 함수

    この関数は Config から呼び出され、リソースに必須タグが
    付いているかどうかを評価します。
    이 함수는 Config에서 호출되며, 리소스에 필수 태그가
    부여되어 있는지 평가합니다.

    イベント構造:
    이벤트 구조:
    - invokingEvent: リソースの構成情報（JSON文字列）
    - invokingEvent: 리소스의 구성 정보 (JSON 문자열)
    - resultToken: 評価結果を報告するためのトークン
    - resultToken: 평가 결과를 보고하기 위한 토큰
    - ruleParameters: ルールのカスタムパラメータ（オプション）
    - ruleParameters: 규칙의 커스텀 파라미터 (옵션)

    評価結果:
    평가 결과:
    - COMPLIANT: 全ての必須タグが存在する
    - COMPLIANT: 모든 필수 태그가 존재
    - NON_COMPLIANT: 1つ以上の必須タグが欠落している
    - NON_COMPLIANT: 하나 이상의 필수 태그가 누락
    - NOT_APPLICABLE: タグをサポートしないリソースタイプ
    - NOT_APPLICABLE: 태그를 지원하지 않는 리소스 타입
    """
    # エラーハンドラからも参照できるよう関数スコープで初期化
    # 에러 핸들러에서도 참조할 수 있도록 함수 스코프에서 초기화
    resource_type = 'AWS::::Account'
    resource_id = 'UNKNOWN'
    result_token = event.get('resultToken', '')
    timestamp = '2024-01-01T00:00:00.000Z'

    try:
        invoking_event = json.loads(event['invokingEvent'])
        result_token = event['resultToken']

        # 構成アイテムからリソース情報を取得
        # 구성 항목에서 리소스 정보를 취득
        configuration_item = invoking_event.get('configurationItem', {})
        resource_type = configuration_item.get('resourceType', '')
        resource_id = configuration_item.get('resourceId', '')
        timestamp = configuration_item.get('configurationItemCaptureTime', timestamp)

        # リソースが削除された場合は評価対象外
        # 리소스가 삭제된 경우 평가 대상 외
        if configuration_item.get('configurationItemStatus') == 'ResourceDeleted':
            compliance_type = 'NOT_APPLICABLE'
            annotation = 'Resource has been deleted.'
        else:
            # リソースのタグを取得
            # 리소스의 태그를 취득
            tags = configuration_item.get('tags', {})

            if tags is None:
                tags = {}

            # 必須タグの存在チェック
            # 필수 태그 존재 확인
            missing_tags = [tag for tag in REQUIRED_TAGS if tag not in tags]

            if not missing_tags:
                compliance_type = 'COMPLIANT'
                annotation = 'All required tags are present.'
            else:
                compliance_type = 'NON_COMPLIANT'
                annotation = f'Missing required tags: {", ".join(missing_tags)}'

        # 評価結果を Config に報告
        # 평가 결과를 Config에 보고
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
        # 関数スコープで初期化した変数を使用するため安全に参照できる
        # 에러 발생 시 NOT_APPLICABLE로 보고하고, 평가를 중단하지 않음
        # 함수 스코프에서 초기화한 변수를 사용하므로 안전하게 참조 가능
        try:
            config_client.put_evaluations(
                Evaluations=[{
                    'ComplianceResourceType': resource_type,
                    'ComplianceResourceId': resource_id,
                    'ComplianceType': 'NOT_APPLICABLE',
                    'Annotation': f'Error during evaluation: {str(e)[:200]}',
                    'OrderingTimestamp': timestamp,
                }],
                ResultToken=result_token,
            )
        except Exception as inner_e:
            print(f'Failed to report evaluation error: {inner_e}')
        raise RuntimeError(f'Config rule evaluation failed: {e}') from e
`),
    });

    // Config サービスが Lambda を呼び出すための権限
    // Config 서비스가 Lambda를 호출하기 위한 권한
    tagCheckFunction.addPermission('ConfigInvokePermission', {
      principal: new iam.ServicePrincipal('config.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });

    // Lambda が Config に評価結果を書き込むための権限
    // Lambda가 Config에 평가 결과를 기록하기 위한 권한
    tagCheckFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['config:PutEvaluations'],
        resources: ['*'],
      })
    );

    // カスタム Config ルールの定義
    // 사용자 정의 Config 규칙 정의
    const requiredTagsRule = new config.CustomRule(this, 'RequiredTagsRule', {
      configRuleName: 'RequiredTagsCheck',
      description: 'Checks that all resources have the required tags: Environment and Owner. Resources missing these tags are marked NON_COMPLIANT.',
      lambdaFunction: tagCheckFunction,
      // ConfigurationChanges: リソースが作成・変更・削除されたときに評価
      // PeriodicExecution を追加すると、定期的にも評価可能
      // ConfigurationChanges: 리소스가 생성/변경/삭제되었을 때 평가
      // PeriodicExecution을 추가하면 주기적으로도 평가 가능
      configurationChanges: true,
    });
    requiredTagsRule.node.addDependency(configRecorder);

    // =========================================================================
    // 4. 自動修復: S3 パブリックアクセスルールの違反を自動修復
    // =========================================================================
    // 4. 자동 복구: S3 퍼블릭 액세스 규칙 위반을 자동 복구
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
    /**
     * SSM Automation을 통한 자동 복구 구조
     *
     * Config 규칙 위반 -> SSM Automation 문서 실행 -> 리소스 복구
     *
     * 여기서는 AWSConfigRemediation-ConfigureS3BucketPublicAccessBlock
     * 이라는 AWS 제공 Automation 문서를 사용하여,
     * S3 버킷의 퍼블릭 액세스를 자동으로 차단합니다.
     *
     * 자동 복구 주의사항:
     * - 자동 복구는 편리하지만, 의도적으로 퍼블릭으로 설정한 버킷
     *   (정적 웹사이트 호스팅 등)에도 적용될 가능성이 있음
     * - 프로덕션 환경에서는 대상 리소스의 범위를 제한하거나,
     *   수동 승인 단계를 추가하는 것을 권장
     * - 복구 액션 실행에는 적절한 IAM 권한이 필요
     */

    // 自動修復用の IAM ロール
    // 자동 복구용 IAM 역할
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
    // S3 퍼블릭 액세스 규칙에 대한 자동 복구 설정
    new config.CfnRemediationConfiguration(this, 'S3PublicAccessRemediation', {
      configRuleName: s3PublicReadRule.configRuleName,
      targetType: 'SSM_DOCUMENT',
      // AWS 提供の修復ドキュメント: S3 Block Public Access を有効化
      // AWS 제공 복구 문서: S3 Block Public Access 활성화
      targetId: 'AWS-DisableS3BucketPublicReadWrite',
      // 自動修復を有効化
      // false にすると手動トリガーのみになる
      // 자동 복구 활성화
      // false로 설정하면 수동 트리거만 가능
      automatic: true,
      // 最大自動修復試行回数
      // 최대 자동 복구 시도 횟수
      maximumAutomaticAttempts: 3,
      // 再試行間隔（秒）
      // 재시도 간격 (초)
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
