# 섹션04: Systems Manager
> Well-Architected Pillar: Operational Excellence
> Day: 1 | 난이도: 중급

## 개요

AWS Systems Manager (SSM)는 AWS 및 온프레미스 인프라를 일원 관리하기 위한 포괄적인 운영 관리 서비스이다. EC2 인스턴스에 대한 안전한 액세스, 패치 적용의 자동화, 구성 관리, 파라미터의 안전한 저장, 메인터넌스 윈도우 관리 등 일상적인 운영 태스크의 대부분을 커버한다.

Systems Manager의 핵심은 「SSM 에이전트」에 있다. 이 에이전트가 EC2 인스턴스나 온프레미스 서버에 설치됨으로써 SSM의 모든 기능이 이용 가능해진다. Amazon Linux 2/2023, Ubuntu Server, Windows Server의 최신 AMI에는 SSM 에이전트가 사전 설치되어 있다. 에이전트는 SSM 서비스 엔드포인트에 HTTPS로 아웃바운드 접속하므로 인바운드 포트를 개방할 필요가 없다.

운영 관점에서 Systems Manager는 「수작업의 배제」와 「운영의 코드화」를 실현하는 핵심 서비스이다. Session Manager에 의한 배스천 호스트 폐지, Run Command에 의한 원격 명령 실행, Patch Manager에 의한 자동 패치 적용, Parameter Store에 의한 설정의 일원 관리 등, Operational Excellence 원칙을 구현하는 서비스라 할 수 있다.

## 핵심 개념

### SSM Agent 아키텍처

**정의:** SSM Agent는 EC2 인스턴스나 온프레미스 서버에 설치되는 소프트웨어 컴포넌트. SSM 서비스의 API 엔드포인트에 대해 HTTPS 아웃바운드 접속(포트 443)을 확립하여 명령의 수신과 결과의 송신을 수행한다.

**전제 조건:**

| 요건 | 설명 |
|------|------|
| **SSM Agent** | 인스턴스에 설치되어 있을 것 (최신 AMI에서는 사전 설치 완료) |
| **IAM 역할** | 인스턴스에 `AmazonSSMManagedInstanceCore` 정책을 포함한 IAM 역할이 부여되어 있을 것 |
| **네트워크** | SSM 서비스 엔드포인트로의 HTTPS 아웃바운드 접속이 가능할 것 |

**네트워크 요건 상세:**

```
EC2 인스턴스 (SSM Agent)
  ↓ HTTPS (443) 아웃바운드
  ↓
  ├── ssm.{region}.amazonaws.com
  ├── ssmmessages.{region}.amazonaws.com  (Session Manager용)
  └── ec2messages.{region}.amazonaws.com  (Run Command용)
```

프라이빗 서브넷의 인스턴스에서 SSM을 사용하는 경우의 선택지:
1. **NAT 게이트웨이/인스턴스** 경유로 인터넷 액세스
2. **VPC 엔드포인트 (PrivateLink)** 를 생성하여 프라이빗 접속 (권장)

**매니지드 인스턴스 등록:**
온프레미스 서버를 SSM으로 관리하려면 「하이브리드 활성화」를 사용한다. 활성화 코드와 ID를 사용하여 SSM에 서버를 등록하면 `mi-` 접두사의 매니지드 인스턴스 ID가 부여된다(EC2의 경우 `i-` 접두사).

---

### Session Manager

**정의:** Session Manager는 SSM의 기능으로, EC2 인스턴스나 온프레미스 서버에 대한 브라우저 기반 또는 CLI 기반의 셸 액세스를 제공한다. SSH 키 관리, 배스천 호스트 운영, 인바운드 포트 개방이 불필요해진다.

**기존의 배스천 호스트 (Bastion Host) 아키텍처:**

```
사용자 → [SSH:22] → 배스천 호스트 (퍼블릭 서브넷)
                          ↓ [SSH:22]
                       타겟 인스턴스 (프라이빗 서브넷)
```

**Session Manager 아키텍처:**

```
사용자 → [HTTPS:443] → SSM 서비스 엔드포인트
                            ↓ (SSM Agent가 폴링)
                         타겟 인스턴스 (프라이빗 서브넷)
```

**주요 이점:**

| 관점 | 배스천 호스트 | Session Manager |
|------|-------------|-----------------|
| 포트 개방 | SSH (22) 인바운드 필수 | 인바운드 불필요 |
| SSH 키 관리 | 필요 (키 배포·로테이션) | 불필요 (IAM 인증) |
| 배스천 비용 | EC2 인스턴스 유지비 | 추가 비용 없음 |
| 액세스 로그 | 배스천 로그 + OS 설정 필요 | CloudWatch/S3에 자동 기록 |
| 액세스 제어 | SSH 키 + 보안 그룹 | IAM 정책 |
| OS 지원 | Linux (SSH 네이티브) | Linux + Windows |

**감사 로그 설정:**

Session Manager의 세션 로그는 다음에 저장 가능:
- **CloudWatch Logs:** 실시간 모니터링, 알람 설정에 적합
- **S3:** 장기 보존, 비용 효율에 적합
- 로그에는 모든 명령 입력과 출력이 기록됨

**IAM에 의한 액세스 제어 예:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": [
        "arn:aws:ec2:ap-northeast-1:123456789012:instance/*"
      ],
      "Condition": {
        "StringLike": {
          "ssm:resourceTag/Environment": ["dev"]
        }
      }
    }
  ]
}
```

이 예에서는 `Environment=dev` 태그가 부여된 인스턴스에만 세션 시작을 허가한다.

**소크라테스식 심화:**
> Q: "배스천 호스트란 무엇인가? 왜 Session Manager로 대체해야 하는가?"
> A: 배스천 호스트(Bastion Host)는 퍼블릭 서브넷에 배치되어 프라이빗 서브넷의 서버에 대한 액세스를 중계하는 서버이다. 모든 사용자가 이 1대를 경유하여 액세스하므로 보안의 「단일 집중형 방어」가 된다. 그러나 배스천 자체가 보안 리스크가 된다 -- (1) SSH 키의 관리 부하, (2) 배스천 호스트 자체에 대한 공격 리스크, (3) 포트 22의 인바운드 개방이 필요, (4) 배스천의 패치 적용·OS 업데이트 운영 부하. Session Manager는 이 모든 것을 해소한다.
> Q: "Session Manager는 어떻게 SSH 포트를 개방하지 않고 액세스할 수 있는가?"
> A: SSM Agent가 SSM 서비스에 대해 HTTPS (443)로 아웃바운드 접속을 확립한다. 즉, 접속은 인스턴스 측에서 개시되므로 인바운드 포트 개방이 불필요하다. 이는 인스턴스가 SSM 서비스에 「새로운 명령이 있는가?」라고 정기적으로 폴링하는 구조에 의한 것이다.

**현실 세계의 비유 (비IT 대상):**
> "공용 도로와 군사 기지 사이의 보안 체크포인트 건물(배스천 호스트). 모든 사람이 이 하나의 건물을 통과하여 안으로 들어갑니다. Session Manager는 보안 카메라가 달린 텔레포테이션 -- 체크포인트 건물 자체가 불필요해지고 직접 안전하게 액세스할 수 있습니다. 게다가 모든 행동이 기록됩니다. 체크포인트 건물을 유지하는 비용도 인원도 불필요합니다"

---

### Run Command

**정의:** Run Command는 관리 대상 인스턴스 그룹에 대해 SSM 문서(명령 정의)를 원격으로 실행하는 기능. SSH 접속 없이 IAM 인증에 기반하여 명령을 안전하게 실행할 수 있다.

**SSM 문서 타입:**

| 타입 | 용도 | 실행 방법 |
|-------|------|---------|
| **Command** | 인스턴스 상에서 셸 명령 실행 | Run Command |
| **Automation** | AWS 리소스 조작(EC2 중지, AMI 생성 등) | Automation |
| **Policy** | 구성 관리 정책 적용 | State Manager |
| **Session** | Session Manager 세션 설정 | Session Manager |

**주요 AWS 제공 문서:**

| 문서명 | 용도 |
|---------------|------|
| `AWS-RunShellScript` | Linux에서 셸 명령 실행 |
| `AWS-RunPowerShellScript` | Windows에서 명령 실행 |
| `AWS-UpdateSSMAgent` | SSM Agent 업데이트 |
| `AWS-ConfigureAWSPackage` | AWS 패키지 설치 |
| `AWS-RunPatchBaseline` | 패치 베이스라인에 기반한 패치 적용 |

**레이트 컨트롤:**

대량의 인스턴스에 대해 Run Command를 실행할 때, 모든 인스턴스에 동시 실행하면 서비스에 영향을 줄 수 있다. 레이트 컨트롤로 동시 실행 수를 제어할 수 있다.

```
Targets: 100 인스턴스
MaxConcurrency: "10%"      # 동시에 10대씩 실행
MaxErrors: "5%"            # 5대 이상 실패하면 전체 중지
```

**출력 대상:**

| 출력 대상 | 용도 |
|-------|------|
| **S3** | 대량의 명령 출력의 장기 보존 |
| **CloudWatch Logs** | 실시간 모니터링, 알람 연동 |
| **SSM 콘솔** | 최근 출력(처음 48,000자)의 확인 |

---

### Patch Manager

**정의:** Patch Manager는 EC2 인스턴스 및 온프레미스 서버에 대한 OS 패치와 애플리케이션 패치 적용을 자동화하는 기능. 패치 베이스라인(어떤 패치를 적용할 것인가), 패치 그룹(어떤 인스턴스에 적용할 것인가), 메인터넌스 윈도우(언제 적용할 것인가)를 조합하여 운영한다.

**패치 베이스라인 (Patch Baseline):**

| 종류 | 설명 |
|------|------|
| **기본 베이스라인** | OS별로 AWS가 사전 정의. 보안 패치와 중요 패치를 자동 승인 |
| **커스텀 베이스라인** | 패치 승인 규칙, 예외 목록, 승인/거부 패치를 독자적으로 정의 |

**커스텀 베이스라인 설정 항목:**

```yaml
PatchBaseline:
  Name: "CustomLinuxBaseline"
  OperatingSystem: "AMAZON_LINUX_2"
  ApprovalRules:
    - PatchFilterGroup:
        PatchFilters:
          - Key: "CLASSIFICATION"
            Values: ["Security", "Bugfix"]
          - Key: "SEVERITY"
            Values: ["Critical", "Important"]
      ApproveAfterDays: 7              # 릴리스 후 7일 후 자동 승인
      ComplianceLevel: "CRITICAL"
  ApprovedPatches:
    - "KB1234567"                       # 개별적으로 승인하는 패치
  RejectedPatches:
    - "KB9999999"                       # 적용을 제외하는 패치
```

**패치 그룹 (Patch Groups):**

인스턴스에 태그 `Patch Group` (키 이름은 정확히 일치해야 함)을 부여하여 그룹화한다.

```
Tag: Patch Group = "WebServers-Prod"    → 베이스라인 A (보수적)
Tag: Patch Group = "WebServers-Dev"     → 베이스라인 B (적극적)
```

- 1개의 패치 그룹에 연결할 수 있는 베이스라인은 1개뿐
- 1개의 베이스라인에 여러 패치 그룹을 연결하는 것은 가능

**패치 적용 플로우:**

```
메인터넌스 윈도우 시작
  ↓
Patch Manager가 타겟 인스턴스를 특정 (패치 그룹)
  ↓
패치 베이스라인에 기반하여 적용해야 할 패치를 산출
  ↓
AWS-RunPatchBaseline 문서를 실행
  ↓
패치 적용 (Scan만 or Scan + Install)
  ↓
컴플라이언스 리포트 생성
  ↓
메인터넌스 윈도우 종료
```

**소크라테스식 심화:**
> Q: "왜 패치 관리를 자동화해야 하는가?"
> A: 수동 패치 관리에는 한계가 있다. (1) 수백 대의 인스턴스에 수동으로 SSH 접속하여 패치를 적용하는 것은 비현실적이다. (2) 패치 적용 누락이 보안 취약점으로 이어진다. (3) 패치 적용 타이밍을 서비스 영향이 없는 시간대에 정확하게 실행해야 한다. Patch Manager는 이를 자동화하고 컴플라이언스 리포트로 적용 상태를 가시화한다.
> Q: "모든 패치를 즉시 적용해야 하는가?"
> A: 아니다. 패치에 따라서는 애플리케이션 호환성 문제를 일으킬 수 있다. 따라서 (1) 개발 환경에서 먼저 패치를 적용하여 테스트, (2) 문제가 없으면 스테이징 환경에 적용, (3) 최종적으로 프로덕션 환경에 적용, 이라는 단계적 롤아웃이 권장된다. `ApproveAfterDays`로 릴리스부터 승인까지의 대기 기간을 설정할 수 있다.

**현실 세계의 비유 (비IT 대상):**
> "자동차 정기 점검과 같은 것. 제조사(OS/소프트웨어 벤더)가 리콜(패치)을 발표하면, 딜러(Patch Manager)가 대상 차량(인스턴스)을 특정하고, 정비 공장(Maintenance Window)에서 일괄 수리합니다. 모든 차량의 정비 기록(컴플라이언스 리포트)도 자동으로 관리됩니다"

---

### Parameter Store

**정의:** Parameter Store는 설정 데이터와 비밀 정보를 계층적으로 저장·관리하는 SSM의 기능. 평문(String, StringList) 또는 KMS로 암호화된 SecureString으로 저장할 수 있으며, 애플리케이션에서 안전하게 파라미터를 취득할 수 있다.

**파라미터 계층:**

```
/
├── app/
│   ├── prod/
│   │   ├── db/
│   │   │   ├── host        = "prod-db.xxxxx.rds.amazonaws.com"
│   │   │   ├── port        = "5432"
│   │   │   ├── password    = "***" (SecureString)
│   │   │   └── username    = "admin"
│   │   └── api/
│   │       └── key         = "***" (SecureString)
│   └── dev/
│       └── db/
│           ├── host        = "dev-db.xxxxx.rds.amazonaws.com"
│           └── password    = "***" (SecureString)
└── shared/
    └── config/
        └── log-level   = "INFO"
```

계층 구조에 의해 IAM 정책에서 `/app/prod/*`와 같은 경로 기반 액세스 제어가 가능.

**Standard vs Advanced:**

| 특성 | Standard | Advanced |
|------|----------|---------|
| 요금 | 무료 | 유료 (0.05 USD/파라미터/월) |
| 최대 사이즈 | 4 KB | 8 KB |
| 파라미터 정책 | 없음 | 있음 (유효기한 알림, 자동 갱신) |
| 최대 파라미터 수 | 10,000 | 100,000 |
| 스루풋 | 표준 (40 TPS) | 고스루풋 옵션 (1,000 TPS) |

**SecureString과 KMS:**

SecureString 파라미터는 AWS KMS로 암호화된다. 기본적으로 AWS 매니지드 키 (`aws/ssm`)가 사용되지만, 고객 관리 키 (CMK)를 지정하여 보다 세밀한 액세스 제어가 가능해진다.

```
애플리케이션 → Parameter Store API (GetParameter) → KMS로 복호화 → 평문 값을 반환
```

애플리케이션에는 SSM의 읽기 권한과 KMS의 복호화 권한 모두가 필요.

**소크라테스식 심화:**
> Q: "Parameter Store와 Secrets Manager의 차이는 무엇인가? 어느 쪽을 사용해야 하는가?"
> A: Parameter Store는 범용적인 설정 관리 스토어, Secrets Manager는 인증 정보에 특화된 스토어이다. 가장 큰 차이는 「자동 로테이션」의 유무. Secrets Manager는 RDS, Redshift, DocumentDB의 패스워드를 자동으로 로테이션하는 Lambda 함수를 빌트인으로 제공한다. Parameter Store에는 자동 로테이션 기능이 없다(직접 구현이 필요).
> Q: "그렇다면 Parameter Store는 불필요한가?"
> A: 아니다. (1) Parameter Store의 Standard 티어는 무료, Secrets Manager는 0.40 USD/시크릿/월. (2) 설정 값(DB 접속 호스트명, 로그 레벨, 피처 플래그 등)의 저장에는 Parameter Store가 최적. (3) 단순한 패스워드 저장으로 로테이션이 불필요한 경우에도 Parameter Store의 SecureString으로 충분. 인증 정보에서 로테이션이 필요한 경우에만 Secrets Manager를 선택한다.

**현실 세계의 비유 (비IT 대상):**
> "파일링 캐비넷(Parameter Store: 무료/저비용, 심플, 설정 값 용) vs 회전 잠금 금고(Secrets Manager: 유료, 자동 로테이션 기능, 데이터베이스 패스워드 등의 인증 정보 용). 어느 쪽을 사용할지는 내용물의 기밀도와 관리 요건에 따릅니다. 일반적인 서류는 캐비넷에, 현금이나 보석은 금고에 넣습니다"

---

### AppConfig

**정의:** AppConfig는 SSM의 기능으로, 애플리케이션의 설정 변경을 디플로이먼트 파이프라인처럼 안전하게 롤아웃한다. 피처 플래그, 운영 파라미터, 기능 토글의 관리에 적합하다.

**Parameter Store와 AppConfig의 차이:**

| 관점 | Parameter Store | AppConfig |
|------|----------------|-----------|
| 주요 용도 | 정적인 설정 값의 저장 | 동적인 설정의 디플로이 |
| 디플로이 전략 | 즉시 반영 | 단계적 롤아웃 |
| 밸리데이션 | 없음 | JSON Schema / Lambda에 의한 검증 |
| 롤백 | 수동 | 자동 롤백 (CloudWatch 연동) |
| 피처 플래그 | 가능하지만 원시적 | 네이티브 지원 |

**AppConfig의 디플로이 전략:**

```
설정 변경
  ↓
밸리데이션 (JSON Schema or Lambda)
  ↓
디플로이 전략 적용:
  ├── AllAtOnce: 전체 타겟에 즉시 디플로이
  ├── Linear: 일정 간격으로 단계적으로 디플로이 (예: 10분마다 20%씩)
  └── Exponential: 지수 함수적으로 디플로이 (예: 1%, 2%, 4%, 8%, ...)
  ↓
CloudWatch 알람 모니터링
  ↓
이상 감지 → 자동 롤백
```

---

### Maintenance Windows

**정의:** 메인터넌스 윈도우는 패치 적용이나 Run Command 실행 등의 운영 태스크를 스케줄된 시간대에 실행하는 기능. 서비스에 대한 영향을 최소화하기 위해 저트래픽 시간대에 메인터넌스 작업을 집중시킨다.

**구성 요소:**

| 요소 | 설명 |
|------|------|
| **스케줄** | cron식 또는 rate식으로 정의 (예: `cron(0 2 ? * SUN *)` = 매주 일요일 2:00) |
| **기간 (Duration)** | 윈도우의 길이 (1~24시간) |
| **컷오프 (Cutoff)** | 새로운 태스크의 시작을 중지하는 남은 시간 (예: 1시간 전) |
| **타겟** | 태그, 리소스 그룹, 개별 인스턴스로 지정 |
| **태스크** | Run Command, Automation, Lambda, Step Functions |

**cron식 예:**

```
cron(0 2 ? * SUN *)          # 매주 일요일 02:00 UTC
cron(0 4 ? * SAT#1 *)        # 매월 첫째 토요일 04:00 UTC
rate(7 days)                  # 7일마다
```

**SSM Document의 상세:**

**소크라테스식 심화:**
> Q: "SSM 문서란 무엇인가?"
> A: SSM 문서는 Systems Manager가 실행하는 액션을 정의한 JSON/YAML 형식의 파일이다. 셸 스크립트를 SSM 문서로 래핑함으로써 (1) 파라미터화에 의한 재사용성, (2) IAM에 의한 액세스 제어, (3) 실행 로그의 자동 기록, (4) 레이트 컨트롤에 의한 안전한 대규모 실행이 실현된다.
> Q: "셸 스크립트를 직접 실행하는 것과 어떻게 다른가?"
> A: 셸 스크립트를 직접 실행하려면 SSH 접속이 필요하며, 누가 언제 무엇을 실행했는지의 기록이 남지 않는다. SSM 문서를 통해 Run Command로 실행하면 CloudTrail에 API 호출이 기록되고, 출력은 S3/CloudWatch Logs에 저장되며, IAM 정책으로 「누가 어떤 문서를 어떤 인스턴스에 실행할 수 있는가」를 정밀하게 제어할 수 있다.

**현실 세계의 비유 (비IT 대상):**
> "작업 절차서와 같은 것. 누가 언제 실행해도 같은 절차로 작업이 수행됩니다. 사람이 절차서를 읽고 작업하는 대신 SSM이 자동으로 실행합니다. 게다가 절차서에는 '한 번에 10대까지', '5대 실패하면 중지'라는 안전 장치가 내장되어 있습니다"

---

### 패치 관리 베스트 프랙티스

**소크라테스식 심화:**
> Q: "패치 관리는 왜 어려운가?"
> A: 패치 관리의 어려움은 3가지 요소의 균형에 있다. (1) 보안: 패치를 빨리 적용하여 취약점을 막고 싶다. (2) 안정성: 패치가 애플리케이션을 깨뜨릴 리스크를 최소화하고 싶다. (3) 가용성: 패치 적용을 위한 다운타임을 최소화하고 싶다. 이 3가지는 서로 트레이드오프 관계에 있으며 완벽한 해답은 없다. 단계적 롤아웃과 컴플라이언스 리포트가 현실적인 해결책이 된다.

**현실 세계의 비유 (비IT 대상):**
> "자동차 정기 점검과 같은 것. 제조사(OS/소프트웨어 벤더)가 리콜(패치)을 발표하면, 딜러(Patch Manager)가 대상 차량(인스턴스)을 특정하고, 정비 공장(Maintenance Window)에서 일괄 수리합니다. 먼저 시작차(개발 환경)에서 테스트하고, 문제가 없으면 영업차(프로덕션 환경)에 전개합니다"

**권장 패치 적용 플로우:**

```
1. Dev 환경: ApproveAfterDays = 0 (즉시 패치 적용)
   ↓ 테스트 기간: 3-7일
2. Staging 환경: ApproveAfterDays = 7
   ↓ 테스트 기간: 3-7일
3. Production 환경: ApproveAfterDays = 14
   ↓
4. 컴플라이언스 리포트 확인
```

## 아키텍처 패턴

### 패턴1: 배스천 리스 아키텍처

```
개발자 → IAM 인증 → Session Manager → 프라이빗 서브넷의 EC2
                                        ↑
                            VPC 엔드포인트 (PrivateLink)
                            ├── com.amazonaws.{region}.ssm
                            ├── com.amazonaws.{region}.ssmmessages
                            └── com.amazonaws.{region}.ec2messages
```

프라이빗 서브넷의 인스턴스에 VPC 엔드포인트 경유로 액세스. NAT Gateway도 불필요하므로 비용과 보안 양면에서 최적.

### 패턴2: 중앙 집중 패치 관리

```
관리 계정
  └── Patch Manager
        ├── 커스텀 패치 베이스라인
        ├── 메인터넌스 윈도우
        └── 타겟: 태그 기반

워크로드 계정 A                          워크로드 계정 B
├── EC2 (Patch Group: "WebServers")     ├── EC2 (Patch Group: "DBServers")
└── EC2 (Patch Group: "AppServers")     └── EC2 (Patch Group: "WebServers")
```

Organizations 연계로 복수 계정의 패치를 일원 관리.

### 패턴3: 계층화된 파라미터 관리

```
Parameter Store
  /shared/                  ← 전 환경 공통
    logging/level = "INFO"
  /app-a/
    prod/                   ← 프로덕션 환경 고유
      db/host = "prod-rds.xxx"
      db/password = "***" (SecureString, CMK: prod-key)
    dev/                    ← 개발 환경 고유
      db/host = "dev-rds.xxx"
      db/password = "***" (SecureString, CMK: dev-key)

IAM Policy:
  개발자: /app-a/dev/* 만 읽기 가능
  운영자: /app-a/prod/* 도 읽기 가능
  앱(prod): /app-a/prod/* + /shared/* 읽기 가능
```

## SAA 시험 포인트

- **Session Manager는 인바운드 포트를 개방하지 않으며, SSH 키도 불필요.** IAM 정책으로 액세스를 제어하고, 모든 세션 로그를 CloudWatch Logs/S3에 기록.
- **SSM Agent의 전제 조건은 3가지:** (1) 에이전트 설치, (2) IAM 역할(`AmazonSSMManagedInstanceCore`), (3) SSM 엔드포인트에 대한 HTTPS 아웃바운드 접속.
- **프라이빗 서브넷에서 SSM을 사용하는 경우** NAT 게이트웨이 또는 VPC 엔드포인트(PrivateLink)가 필요. VPC 엔드포인트는 `ssm`, `ssmmessages`, `ec2messages`의 3개.
- **Run Command의 MaxConcurrency와 MaxErrors**로 레이트 컨트롤. 퍼센티지 또는 절대수로 지정 가능.
- **Patch Manager의 패치 그룹**은 태그 `Patch Group` (키 이름은 고정)으로 정의. 1 패치 그룹 = 1 베이스라인.
- **Parameter Store Standard는 API 호출 무료, Advanced는 유료.** SecureString은 KMS의 복호화 비용이 별도 발생.
- **Parameter Store vs Secrets Manager:** 자동 로테이션이 필요하면 Secrets Manager, 그렇지 않으면 Parameter Store.
- **AppConfig**는 피처 플래그, 단계적 롤아웃, 자동 롤백(CloudWatch 연동)에 사용.
- **Maintenance Windows의 컷오프**는 윈도우 종료 전에 새로운 태스크의 시작을 중지하는 시간. 예를 들어 Duration=3시간, Cutoff=1시간이면 처음 2시간 이내에 시작된 태스크만 실행.
- **SSM Automation**은 EC2의 중지·시작, AMI 생성, EBS 스냅샷 등의 AWS 리소스 조작에 사용. EventBridge와 연계하여 이벤트 기반으로 실행 가능.
- **State Manager**는 SSM 문서를 정기적으로 인스턴스에 적용하여 바람직한 구성 상태를 유지하는 기능(Ansible적인 구성 관리).

## 핸즈온 참조

- CDK 프로젝트: `cdk-projects/02-ssm-operations/`
- 주요 Stack: SsmOperationsStack
- 구현 내용:
  - Session Manager용 VPC 엔드포인트 설정
  - 커스텀 SSM 문서 작성
  - Patch Manager의 패치 베이스라인과 메인터넌스 윈도우 설정
  - Parameter Store의 계층화된 파라미터 설정
  - IAM 역할과 정책 설정

## Well-Architected 체크리스트

### Operational Excellence
- [ ] Session Manager를 사용하여 배스천 호스트를 폐지했는가
- [ ] Session Manager의 세션 로그가 CloudWatch Logs/S3에 저장되고 있는가
- [ ] 패치 적용이 자동화되어 컴플라이언스 리포트가 생성되고 있는가
- [ ] 패치의 단계적 롤아웃(Dev → Stg → Prod)이 구현되어 있는가
- [ ] 메인터넌스 윈도우가 적절한 시간대에 설정되어 있는가
- [ ] Parameter Store에서 설정 값이 일원 관리되고 있는가
- [ ] SecureString 파라미터에 CMK (고객 관리 키)가 사용되고 있는가
- [ ] SSM 문서가 버전 관리되어 코드로서 관리되고 있는가
- [ ] Run Command의 출력이 S3/CloudWatch Logs에 저장되고 있는가
- [ ] AppConfig를 사용하여 피처 플래그의 안전한 롤아웃이 이루어지고 있는가
