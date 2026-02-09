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
/**
 * =============================================================================
 * Organizations SCP (서비스 컨트롤 정책) Stack
 * =============================================================================
 *
 * ■ SCP란 무엇인가? 왜 중요한가?
 *
 *   SCP (Service Control Policy)는 AWS Organizations 내의 계정에 대한
 *   "가드레일"입니다. 이것은 권한의 "부여"가 아니라 "상한 설정"입니다.
 *
 *   중요한 개념:
 *   - SCP는 권한을 "부여하지 않음" → IAM 정책이 권한을 부여
 *   - SCP는 권한의 "최대 범위"를 제한 → 필터로서 기능
 *   - SCP는 루트 계정에도 적용됨 → IAM 정책으로는 불가능
 *   - SCP는 관리 계정에는 적용되지 않음 → 관리 계정는 특별한 보호가 필요
 *
 *   비유:
 *   IAM 정책 = "직원에게 건네는 열쇠" (특정 문을 여는 권한)
 *   SCP = "빌딩의 층 접근 제한" (애초에 그 층에 갈 수 없음)
 *
 * ■ Deny-list 전략 vs Allow-list 전략
 *
 *   Deny-list (이 Stack에서 채용):
 *   - 디폴트로 전 서비스를 허가하고, 특정 액션을 명시적으로 거부
 *   - 장점: 새로운 AWS 서비스가 자동으로 이용 가능, 관리가 용이
 *   - 단점: "금지 누락"의 리스크, 예기치 않은 서비스 이용 가능성
 *   - 적용 장면: 대부분의 서비스를 사용하고 싶지만, 위험한 조작만 금지하고 싶은 경우
 *
 *   Allow-list:
 *   - 디폴트로 전 서비스를 거부하고, 필요한 서비스만 명시적으로 허가
 *   - 장점: 가장 안전, 예기치 않은 서비스 이용을 완전히 방지
 *   - 단점: 새 서비스 이용 시마다 SCP 갱신 필요, 운용 부하가 높음
 *   - 적용 장면: 금융·의료 등 엄격한 규제 산업
 *
 *   실무적 권장: Deny-list를 베이스로 하고, 가장 중요한 제한을 SCP로,
 *   세밀한 제어는 IAM 정책으로 수행하는 "하이브리드" 접근.
 *
 * ■ 주의사항
 *   이 Stack은 Organizations API를 직접 호출하지 않습니다.
 *   Organizations 조작에는 관리 계정에서의 셋업이 필요합니다.
 *   여기서는 정책 문서의 정의와 출력에 초점을 맞추고,
 *   실제 디플로이는 Organizations 관리 계정에서 수행하는 것을 상정합니다.
 */
export class OrgScpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // 1. リージョン制限 SCP
    // =========================================================================
    // 1. 리전 제한 SCP
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
    /**
     * ■ 왜 리전을 제한하는가?
     *
     *   - 데이터 레지던시 요건: 일본 개인정보보호법이나 GDPR 등의 규제에 의해,
     *     데이터 보관 장소를 특정 리전에 한정할 필요가 있음
     *   - 코스트 관리: 미사용 리전에서 리소스가 생성되면 코스트 누출이 발생
     *   - 보안: 공격자가 미감시 리전에 리소스를 생성하는 것을 방지
     *     (암호화폐 마이닝 등의 부정 이용 패턴)
     *   - 운용 효율: 감시 대상 리전을 한정하고, 알림의 정밀도를 향상
     *
     *   예외 서비스: IAM, STS, CloudFront, Route 53, Support, Billing
     *   이들은 글로벌 서비스이므로 리전 제한에서 제외할 필요가 있음
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
            // 글로벌 서비스는 리전 제한의 대상 외
            // 이들을 제외하지 않으면, IAM 역할 생성이나 Route 53 조작이 불가능해짐
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
    // 2. 보안 서비스 보호 SCP
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
    /**
     * ■ 왜 보안 서비스의 비활성화를 금지하는가?
     *
     *   공격자가 AWS 계정에 침입한 경우, 최초로 수행하는 것은
     *   보안 감시의 비활성화입니다. 이에 의해:
     *   - CloudTrail 중지 → API 호출 기록이 사라짐 → 증적을 은폐
     *   - GuardDuty 중지 → 위협 감지가 멈춤 → 의심스러운 행동이 감지되지 않음
     *   - Config 중지 → 구성 변경 기록이 사라짐 → 무엇이 변경되었는지 불명
     *   - SecurityHub 중지 → 보안 알림 집약이 멈춤
     *
     *   SCP로 이러한 액션을 금지함으로써, 설령 관리자 권한이
     *   침해되어도, 감시를 비활성화할 수 없도록 합니다.
     *   이것은 "Detection (감지)" 층의 보호이며,
     *   "Prevention (예방)"만으로는 불충분한 경우의 안전책입니다.
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
          // UpdateDetector는 설정 변경이 필요한 경우가 있으므로,
          // 비활성화 (Status=DISABLED)만을 거부하는 조건을 부여하는 것도 가능
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
          // 주의: 운영 환경에서는 특정 로그 그룹만 보호하도록
          // 리소스 ARN을 한정할 것을 권장
        },
      ],
    };

    // =========================================================================
    // 3. IAMユーザー制限 SCP（SSO強制）
    // =========================================================================
    // 3. IAM 사용자 제한 SCP (SSO 강제)
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
    /**
     * ■ 왜 IAM 사용자 생성을 금지하고 SSO를 강제하는가?
     *
     *   IAM 사용자의 문제점:
     *   - 패스워드가 영속적 → 유출 리스크가 항상 존재
     *   - 액세스 키가 영속적 → 코드나 로그에 혼입되는 리스크
     *   - MFA 설정이 각 사용자 임의 → 설정 누락 리스크
     *   - 사용자 관리가 분산 → 계정마다 사용자를 관리할 필요
     *   - 퇴직자 대응이 곤란 → 전 계정의 IAM 사용자를 개별 삭제
     *
     *   SSO (IAM Identity Center)의 장점:
     *   - 인증의 일원 관리 → Active Directory/Okta/Azure AD와 통합
     *   - 일시적인 인증 정보 → 세션 기반으로 액세스
     *   - MFA 일원 관리 → IdP 측에서 강제 가능
     *   - 퇴직자 대응이 용이 → IdP에서 계정 비활성화하면 전 액세스가 중지
     *   - 감사가 용이 → 누가 어떤 계정에 언제 액세스했는지 일원 관리
     *
     *   이 SCP는 IAM 사용자의 생성과 콘솔 패스워드 설정을
     *   금지함으로써, SSO 사용을 강제합니다.
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
          ],
          Resource: '*',
          // 例外: 自動化パイプラインによるサービスアカウントの作成は
          // 特定の条件で許可することも検討可能
          // 예외: 자동화 파이프라인에 의한 서비스 계정 생성은
          // 특정 조건에서 허가하는 것도 검토 가능
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
          // 액세스 키 생성을 금지
          // 서비스 계정가 필요한 경우는, IAM 역할 + AssumeRole을 사용
        },
      ],
    };

    // =========================================================================
    // 4. 追加のガードレール: 高リスクアクションの制限
    // =========================================================================
    // 4. 추가 가드레일: 고위험 액션의 제한
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
    /**
     * ■ 기타 권장 SCP 제한
     *
     *   다음은 추가 가드레일로서 검토해야 할 제한입니다:
     *   - S3 버킷 정책에서의 퍼블릭 액세스 허가 금지
     *   - RDS 인스턴스의 퍼블릭 액세스 금지
     *   - EC2 인스턴스의 IMDSv1 사용 금지 (SSRF 공격 대책)
     *   - 루트 계정의 액션을 제한
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
            // Block Public Access의 비활성화를 금지
            // 즉, 퍼블릭 액세스 차단을 해제할 수 없음
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
          // 멤버 계정가 조직을 이탈하는 것을 방지
          // 이탈하면 SCP가 적용되지 않게 되므로
        },
      ],
    };

    // =========================================================================
    // 5. OU（組織単位）構造の例（参考情報）
    // =========================================================================
    // 5. OU (조직 단위) 구조의 예 (참고 정보)
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
    /**
     * ■ 권장 OU 구조:
     *
     *   Root
     *   ├── Security OU          ← 보안 감사·로그 집약 계정
     *   │   ├── Log Archive Account
     *   │   └── Security Tooling Account
     *   ├── Infrastructure OU    ← 공유 인프라 (네트워크, DNS 등)
     *   │   └── Network Account
     *   ├── Sandbox OU           ← 개발자 실험용 (제한 완화, 자동 삭제 있음)
     *   │   └── Developer Sandbox Accounts
     *   ├── Workloads OU         ← 본번 워크로드
     *   │   ├── Production OU
     *   │   │   └── Prod Accounts
     *   │   └── Non-Production OU
     *   │       ├── Dev Accounts
     *   │       └── Staging Accounts
     *   └── Suspended OU         ← 폐지 예정 계정 (전 액션 거부)
     *
     *   각 OU에 적절한 SCP를 적용함으로써, 계층적 거버넌스를 실현합니다.
     *   예: Sandbox OU에는 완화된 SCP, Production OU에는 엄격한 SCP
     */

    // =========================================================================
    // 6. CfnOutputs - ポリシードキュメントの出力
    // =========================================================================
    // 6. CfnOutputs - 정책 문서의 출력
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
    /**
     * 정책 문서를 CfnOutput으로 출력합니다.
     * 실제 Organizations 환경에서는 이러한 JSON을 SCP로서 적용하십시오.
     *
     * 적용 방법:
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
