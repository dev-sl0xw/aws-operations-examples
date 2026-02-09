# 섹션03: Organizations & 컴플라이언스
> Well-Architected Pillars: Security, Operational Excellence
> Day: 1 | 난이도: 중급

## 개요

AWS Organizations는 여러 AWS 계정를 일원 관리하는 서비스이다. 기업이 성장함에 따라 단일 AWS 계정에서의 운영은 한계에 도달한다. 환경 분리(개발/프로덕션), 팀 간 권한 분리, 청구 일원화, 보안 가드레일 적용 등 조직적인 클라우드 운영에는 멀티 계정 전략이 불가결하다. Organizations는 이 전략의 기반을 제공한다.

AWS Config는 AWS 리소스의 구성 변경을 지속적으로 기록하고, 사전 정의된 규칙에 대한 준수 상황을 평가하는 서비스이다. "리소스가 현재 어떤 설정으로 되어 있는가" "언제 누가 어떻게 변경했는가" "규정된 설정 기준을 충족하고 있는가"를 상시 감시한다. 컴플라이언스 위반이 감지된 경우, Systems Manager Automation과 연계하여 자동 수정(remediation)을 실행할 수 있다.

Organizations, SCP, AWS Config의 세 가지를 조합하면 "Compliance as Code"(컴플라이언스의 코드화)가 실현된다. 수동 감사 작업이나 속인적인 보안 체크를 배제하고, 가드레일(방호 울타리)로서 자동으로 보안 기준을 유지하는 구조를 구축할 수 있다. 이것은 Operational Excellence의 "운영을 코드화한다" 원칙 그 자체이다.

## 핵심 개념

### AWS Organizations의 계층 구조

**정의:** AWS Organizations는 루트 계정(관리 계정)를 정점으로 하여, OU (Organizational Unit)에 의한 트리 구조로 멤버 계정를 계층적으로 관리한다.

**계층 구조의 예:**

```
Organization Root (관리 계정)
├── OU: Security
│   ├── Account: Log Archive (전체 계정의 로그 집약)
│   └── Account: Security Tooling (GuardDuty, Security Hub 등)
├── OU: Infrastructure
│   ├── Account: Shared Services (Active Directory, DNS 등)
│   └── Account: Network Hub (Transit Gateway, VPN)
├── OU: Workloads
│   ├── OU: Production
│   │   ├── Account: App-A-Prod
│   │   └── Account: App-B-Prod
│   └── OU: Non-Production
│       ├── Account: App-A-Dev
│       └── Account: App-B-Dev
└── OU: Sandbox
    └── Account: Sandbox-01 (실험용)
```

**주요 기능:**

| 기능 | 설명 |
|------|------|
| **통합 청구 (Consolidated Billing)** | 전체 계정의 청구를 관리 계정로 통합. 볼륨 디스카운트의 혜택 |
| **SCP (Service Control Policies)** | OU/계정 단위로 권한의 상한을 설정 |
| **CloudFormation StackSets** | 여러 계정 및 리전에 일괄 배포 |
| **Tag Policies** | 태그 명명 규칙을 조직 전체에 강제 |
| **Backup Policies** | 백업 전략을 조직 전체에서 통일 |
| **AI Opt-out Policies** | AWS의 AI 서비스가 데이터를 학습에 사용하는 것을 옵트아웃 |

---

### SCP (Service Control Policies)

**정의:** SCP는 Organizations의 기능이며, OU(조직 단위) 또는 멤버 계정에 대해 사용 가능한 AWS 서비스와 액션의 상한을 설정하는 정책이다. SCP는 권한을 부여하지 않는다 -- 어디까지나 상한(가드레일)을 설정할 뿐이며, 실제 접근에는 IAM 정책이 필요하다.

**SCP의 중요한 성질:**

1. **관리 계정에는 적용되지 않는다:** 관리 계정에 SCP를 연결해도 효과가 없다. 이것이 관리 계정에서 워크로드를 실행해서는 안 되는 이유 중 하나.
2. **상속된다:** 상위 OU에 연결된 SCP는 하위 OU 및 하위 계정에 자동으로 상속된다.
3. **교집합으로 평가된다:** 여러 SCP가 적용되는 경우, 허용되는 조작은 그것들의 교집합 부분만.

**Deny-list 전략 vs Allow-list 전략:**

| 전략 | 기본 SCP | 커스텀 SCP | 특징 |
|------|-------------|-------------|------|
| **Deny-list (권장)** | `FullAWSAccess`를 유지 | 금지하고 싶은 액션을 명시적으로 Deny | 유연. 새 서비스도 자동으로 이용 가능 |
| **Allow-list** | `FullAWSAccess`를 삭제 | 허용할 액션만을 명시적으로 Allow | 엄격. 새 서비스는 명시적으로 허용 필요 |

**Deny-list SCP의 예:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyLeaveOrganization",
      "Effect": "Deny",
      "Action": "organizations:LeaveOrganization",
      "Resource": "*"
    },
    {
      "Sid": "DenyDisableCloudTrail",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyUnapprovedRegions",
      "Effect": "Deny",
      "NotAction": [
        "iam:*",
        "sts:*",
        "organizations:*",
        "support:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": [
            "ap-northeast-1",
            "us-east-1"
          ]
        }
      }
    }
  ]
}
```

**소크라테스식 심화:**
> Q: "SCP란 무엇인가? IAM 정책만으로는 부족한가?"
> A: IAM 정책은 개별 사용자나 역할에 대해 권한을 설정하지만, 계정 전체의 가드레일로서는 기능하지 않는다. 예를 들어 계정 관리자가 IAM 정책을 자유롭게 변경할 수 있는 환경에서는, 관리자가 자기 자신에게 AdministratorAccess를 부여하여 무엇이든 할 수 있게 된다. SCP는 개별 IAM 정책의 상위에 위치하여, "이 계정에서는 어떤 IAM 정책을 설정해도 이 조작만은 절대로 할 수 없다"라는 하드 리밋을 설정한다.
> Q: "SCP가 관리 계정에 적용되지 않는 이유는?"
> A: 관리 계정에 SCP가 적용되면 조직 전체의 락아웃이 발생할 위험이 있다. 관리 계정는 Organizations의 관리 조작을 수행하는 특권 계정이며, 만일의 설정 실수로부터의 복구에 필요하다. 그래서 관리 계정에서는 워크로드를 실행하지 않고 관리 목적으로만 사용해야 한다.

**현실 세계의 비유 (비IT 대상):**
> "건물의 소방법과 같은 것. 각 임차인(계정)은 방을 마음대로 장식할 수 있지만(IAM 정책), 비상구는 막을 수 없습니다(SCP 가드레일). 소방법은 건물 전체에 적용되며, 개별 임차인의 의향과 관계없이 준수가 필요합니다. 다만 건물 소유주(관리 계정)는 소방법 적용 대상 외 -- 그래서 건물 소유주의 방에는 특별한 주의가 필요합니다"

---

### OU (Organizational Unit)

**정의:** OU는 Organizations 내에서 계정를 그룹화하는 논리적 컨테이너. 최대 5계층까지 중첩 가능. OU에 SCP를 연결하여 하위의 전체 계정에 정책을 일괄 적용할 수 있다.

**소크라테스식 심화:**
> Q: "왜 OU 구조가 중요한가? 전체 계정를 플랫하게 나열하면 안 되는가?"
> A: 플랫 구조에서는 계정별로 개별적으로 SCP를 관리해야 하며, 계정 수가 증가하면 스케일하지 않는다. OU 구조를 사용하면 "프로덕션 환경 OU"에 연결한 SCP가 하위의 전체 프로덕션 계정에 자동 적용된다. 100개의 프로덕션 계정가 있어도 SCP 관리는 1곳에서 충분하다.
> Q: "OU 구조를 설계할 때의 지침은?"
> A: 주로 2가지 접근법이 있다. (1) 환경별 (Development, Staging, Production) -- 보안 수준이 다른 워크로드를 분리. (2) 팀/프로젝트별 -- 조직 구조에 맞춘 분리. 대부분의 경우 양쪽을 조합한 다계층 구조가 채택된다.

**현실 세계의 비유 (비IT 대상):**
> "회사의 조직도와 같은 것. 경영진(root) 아래에 부서(OU)가 있고, 부서 아래에 팀(계정)이 있습니다. 부서 규칙은 자동으로 팀 전체에 적용됩니다. 인사부의 규칙(예: 근태 관리 방법)은 인사부의 전체 팀에 적용되며, 엔지니어링 부서에는 영향을 미치지 않습니다"

---

### AWS Config

**정의:** AWS Config는 AWS 리소스의 구성 변경을 지속적으로 기록하고, 설정 규칙에 대한 컴플라이언스를 평가하는 서비스. "리소스의 현재 구성" "구성 변경의 이력" "규칙에 대한 준수/비준수 상태"를 제공한다.

**AWS Config의 3가지 기둥:**

1. **구성 기록 (Configuration Recording)**
   - 리소스의 구성 변경을 감지하고, 구성 아이템 (Configuration Item)으로 S3에 저장
   - 구성 아이템에는 리소스 유형, ID, 설정값, 관련 리소스, 변경 일시가 포함

2. **규칙 평가 (Rules Evaluation)**
   - 관리형 규칙: AWS가 사전 정의한 일반적인 규칙 (예: `s3-bucket-public-read-prohibited`)
   - 커스텀 규칙: Lambda 함수로 독자적인 컴플라이언스 로직을 구현
   - 적합 팩 (Conformance Packs): 여러 규칙을 패키지화한 것 (예: CIS Benchmarks)

3. **수정 (Remediation)**
   - 비준수 리소스에 대해 SSM Automation 문서를 자동 실행
   - 예: 퍼블릭 접근 가능한 S3 버킷 감지 → 자동으로 퍼블릭 접근을 차단

**관리형 규칙의 예:**

| 규칙명 | 확인 내용 |
|---------|-------------|
| `s3-bucket-public-read-prohibited` | S3 버킷이 퍼블릭 읽기 가능하지 않은가 |
| `encrypted-volumes` | EBS 볼륨이 암호화되어 있는가 |
| `root-account-mfa-enabled` | 루트 계정에 MFA가 활성화되어 있는가 |
| `required-tags` | 지정한 태그가 리소스에 부여되어 있는가 |
| `rds-instance-public-access-check` | RDS가 퍼블릭 접근 가능하지 않은가 |
| `iam-password-policy` | IAM 비밀번호 정책이 기준을 충족하는가 |
| `cloudtrail-enabled` | CloudTrail이 활성화되어 있는가 |

**커스텀 규칙의 구성:**

```python
# Lambda 함수로 커스텀 규칙을 구현
import json
import boto3

def lambda_handler(event, context):
    config = boto3.client('config')

    # 평가 대상의 리소스 구성을 취득
    configuration_item = json.loads(event['invokingEvent'])['configurationItem']

    # 커스텀 로직으로 컴플라이언스를 평가
    if configuration_item['resourceType'] == 'AWS::EC2::Instance':
        instance_type = configuration_item['configuration']['instanceType']

        # 금지된 인스턴스 유형 확인
        prohibited_types = ['p3.2xlarge', 'p3.8xlarge', 'p4d.24xlarge']
        if instance_type in prohibited_types:
            compliance_type = 'NON_COMPLIANT'
            annotation = f'Prohibited instance type: {instance_type}'
        else:
            compliance_type = 'COMPLIANT'
            annotation = 'Instance type is allowed'

    # 평가 결과를 Config에 보고
    config.put_evaluations(
        Evaluations=[{
            'ComplianceResourceType': configuration_item['resourceType'],
            'ComplianceResourceId': configuration_item['resourceId'],
            'ComplianceType': compliance_type,
            'Annotation': annotation,
            'OrderingTimestamp': configuration_item['configurationItemCaptureTime']
        }],
        ResultToken=event['resultToken']
    )
```

**소크라테스식 심화:**
> Q: "AWS Config란 무엇인가? CloudTrail과의 차이는?"
> A: CloudTrail은 "누가 언제 어떤 API를 호출했는가"라는 활동 로그를 기록한다. AWS Config는 "리소스의 구성이 지금 어떻게 되어 있는가, 언제 어떻게 변경되었는가, 규칙에 준수하고 있는가"를 기록한다. 예를 들어 보안 그룹의 인바운드 규칙에 0.0.0.0/0이 추가된 경우, CloudTrail은 "AuthorizeSecurityGroupIngress가 호출되었다"고 기록하고, Config는 "이 보안 그룹의 인바운드 규칙이 변경되어 퍼블릭 접근 규칙이 비준수가 되었다"고 기록한다.
> Q: "Config의 자동 수정은 만능인가?"
> A: 자동 수정은 강력하지만 주의가 필요하다. (1) 수정 액션이 다른 리소스에 영향을 줄 가능성이 있다. (2) 수정이 실패한 경우의 에스컬레이션 경로가 필요하다. (3) 프로덕션 환경에서는 자동 수정을 신중하게 적용하고, 먼저 알림만부터 시작하는 것이 권장된다.

**현실 세계의 비유 (비IT 대상):**
> "건물의 정기 점검과 같은 것. 소방 설비(보안 설정)가 기준에 맞는지 항상 체크하고, 부적합하면 자동으로 수정(remediation)할 수 있습니다. 점검원(Config 규칙)은 정해진 체크리스트에 따르며, 소화기의 유효 기한 만료(비준수 리소스)를 발견하면 자동으로 교체 수배(SSM Automation)합니다"

---

### Config Aggregator

**정의:** AWS Config Aggregator는 여러 AWS 계정 및 리전으로부터 Config의 구성 데이터와 컴플라이언스 결과를 집약하는 리소스. 조직 전체의 컴플라이언스 상황을 일원적으로 파악할 수 있다.

**2가지 어그리게이터 소스:**

| 소스 유형 | 설명 |
|-------------|------|
| **Organizations** | 조직 내의 전체 계정 및 전 리전으로부터 자동 집약 |
| **개별 계정** | 지정한 계정 ID와 리전으로부터 집약 (조직 외 계정도 가능) |

**구성:**

```
집약 계정 (Aggregator Account)
  ├── Config Aggregator
  │     ├── 소스: Organization (전체 멤버 계정)
  │     └── 리전: 전 리전
  │
  ├── 집약 뷰: 전체 계정의 비준수 리소스 목록
  └── 대시보드: 컴플라이언스 요약
```

---

### Conformance Packs (적합 팩)

**정의:** AWS Config Conformance Packs는 여러 Config 규칙과 수정 액션을 패키지화한 것. 업계 표준의 컴플라이언스 프레임워크(CIS Benchmarks, PCI DSS, NIST 등)에 대응하는 템플릿이 AWS에서 제공되고 있다.

**주요 AWS 제공 템플릿:**

| 팩 이름 | 내용 |
|---------|------|
| CIS AWS Foundations Benchmark | CIS가 정의한 AWS 보안 베스트 프랙티스 |
| AWS Operational Best Practices for PCI DSS | PCI DSS 준수를 위한 규칙 세트 |
| AWS Operational Best Practices for NIST 800-53 | NIST 800-53 프레임워크 준수 |

---

### Compliance as Code

**정의:** 컴플라이언스 요건을 코드로 정의 및 관리하고, 자동으로 평가 및 수정하는 접근법. 수동 감사 프로세스를 코드화하여 지속적인 컴플라이언스 유지를 실현한다.

**실현 요소:**

```
Compliance as Code 스택
┌───────────────────────────────────────┐
│  SCP: 계정 수준의 가드레일          │  ← 예방적 제어
├───────────────────────────────────────┤
│  Service Catalog: 승인된 구성만 제공    │  ← 예방적 제어
├───────────────────────────────────────┤
│  AWS Config Rules: 구성의 컴플라이언스  │  ← 검지적 제어
├───────────────────────────────────────┤
│  SSM Automation: 비준수 리소스의 자동 수정│  ← 시정적 제어
├───────────────────────────────────────┤
│  Config Aggregator: 조직 전체의 가시화  │  ← 가시화
└───────────────────────────────────────┘
```

**예방적 제어 (Preventive Controls):** 위반이 발생하기 전에 차단
- SCP: 금지된 액션을 차단
- Service Catalog: 승인된 구성만을 프로비저닝 가능하게 함

**검지적 제어 (Detective Controls):** 위반이 발생한 후에 감지
- AWS Config Rules: 비준수 리소스를 감지
- GuardDuty: 위협을 감지

**시정적 제어 (Corrective Controls):** 감지된 위반을 수정
- SSM Automation: 자동 수정 액션을 실행

## 아키텍처 패턴

### 패턴1: 랜딩 존 (Landing Zone)

```
Management Account
  ├── AWS Control Tower (자동 설정)
  │     ├── Mandatory OU: Security
  │     │     ├── Log Archive Account
  │     │     └── Audit Account
  │     ├── Registered OUs
  │     │     ├── OU: Production
  │     │     └── OU: Development
  │     └── Guardrails (SCPs + Config Rules)
  │
  ├── AWS Organizations
  ├── AWS IAM Identity Center (SSO)
  ├── CloudTrail (전체 계정)
  └── Config (전체 계정)
```

AWS Control Tower는 베스트 프랙티스에 기반한 멀티 계정 환경을 자동 설정한다. 필수 가드레일(SCP + Config Rules)이 자동으로 적용된다.

### 패턴2: 보안 계정 패턴

```
Security Tooling Account
  ├── GuardDuty (위임 관리자)
  ├── Security Hub (위임 관리자)
  ├── Config Aggregator
  ├── IAM Access Analyzer
  └── CloudWatch Cross-Account Dashboard

Log Archive Account
  ├── CloudTrail 로그 (전체 계정)
  ├── Config 스냅샷 (전체 계정)
  ├── VPC Flow Logs (전체 계정)
  └── S3 버킷 (WORM: Write Once Read Many)
```

보안 도구와 감사 로그를 전용 계정에 분리하여, 워크로드 계정의 관리자가 로그를 변조할 수 없게 한다.

### 패턴3: Config 수정 파이프라인

```
리소스 변경 → Config 감지 → 규칙 평가 → 비준수 감지
                                           ↓
                              SSM Automation (자동 수정)
                                           ↓
                                   수정 성공? → YES → 완료
                                           ↓ NO
                              SNS 알림 → 운영 팀에 수동 대응 요청
```

## SAA 시험 포인트

- **SCP는 관리 계정에 적용되지 않는다.** 관리 계정의 IAM 사용자는 SCP의 제약을 받지 않는다.
- **SCP는 IAM의 유효 권한의 상한을 설정하지만, 권한을 부여하지 않는다.** SCP에서 Allow한 것만으로는 접근할 수 없다. IAM 정책에서의 Allow도 필요.
- **SCP의 기본 정책 `FullAWSAccess`** 를 삭제하면, 명시적으로 Allow되지 않은 조작은 모두 차단된다(Allow-list 전략).
- **AWS Config는 리전 서비스이지만 Aggregator로 크로스 리전 집약이 가능하다.** 각 리전에서 Config를 활성화할 필요가 있다.
- **Config Rules의 트리거 유형:** (1) 구성 변경 시 (Configuration Changes): 리소스가 변경될 때마다 평가. (2) 정기적 (Periodic): 1시간/3시간/6시간/12시간/24시간마다 평가.
- **Config의 수정 액션은 SSM Automation 문서**로 정의한다. AWS는 일반적인 수정을 위한 사전 정의 문서를 제공.
- **Conformance Packs는 조직 수준에서 배포 가능**하며, 전체 멤버 계정에 일괄 적용할 수 있다.
- **Organizations의 통합 청구**에서는 전체 계정의 리소스 사용량이 합산되므로, 볼륨 디스카운트(S3, EC2 RI 등)의 혜택을 받을 수 있다.
- **Tag Policies**는 태그의 키 이름과 허용되는 값을 정의하지만, 태그 부여를 강제하지는 않는다(SCP와 조합하여 강제).

## 핸즈온 참조

- CDK 프로젝트: `cdk-projects/01-iam-org-governance/`
- 주요 스택: OrganizationsGovernanceStack
- 구현 내용:
  - OU 구조의 정의
  - SCP (Deny-list 전략) 적용
  - AWS Config Rules 설정 (관리형 규칙 + 커스텀 규칙)
  - 수정 액션 설정 (SSM Automation)

## Well-Architected 체크리스트

### Security
- [ ] 멀티 계정 전략이 수립되어 OU 구조가 설계되어 있는가
- [ ] 관리 계정에서 워크로드를 실행하고 있지 않은가
- [ ] SCP로 리전 제한이 적용되어 있는가 (불필요한 리전에서의 리소스 생성 금지)
- [ ] SCP로 CloudTrail/Config 비활성화가 금지되어 있는가
- [ ] AWS Config가 전체 계정 및 전 리전에서 활성화되어 있는가
- [ ] Config Aggregator로 조직 전체의 컴플라이언스가 가시화되어 있는가
- [ ] 비준수 리소스에 대한 수정 액션이 정의되어 있는가
- [ ] 보안 로그가 전용 계정에 집약되어 변조 방지되어 있는가

### Operational Excellence
- [ ] 신규 계정 생성이 자동화되어 있는가 (Account Factory)
- [ ] 가드레일(SCP + Config Rules)이 코드로 관리되고 있는가
- [ ] 컴플라이언스 상황의 대시보드가 구축되어 있는가
- [ ] 비준수 감지 시 에스컬레이션 경로가 정의되어 있는가
- [ ] 정기적인 컴플라이언스 리뷰 프로세스가 확립되어 있는가
