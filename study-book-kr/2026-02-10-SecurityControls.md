# 섹션09: 보안 통제 (Security Controls)
> Well-Architected Pillar: Security
> Day: 3 | 난이도: 중급

## 개요

보안 통제란 AWS 리소스를 위협으로부터 보호하기 위한 기술적/조직적 메커니즘의 총칭이다. AWS에서는 보안 통제를 3가지 카테고리로 분류한다: Preventive (예방적), Detective (탐지적), Responsive (대응적). 이러한 통제를 다층적으로 조합함으로써 Defense in Depth (다층 방어)를 실현한다.

예방적 통제는 IAM, SCP, Permission Boundaries, WAF 등 '애초에 문제를 발생시키지 않는' 메커니즘이다. 탐지적 통제는 CloudTrail, GuardDuty, Inspector, Config Rules, Access Analyzer 등 '문제가 발생했음을 빠르게 감지하는' 메커니즘이다. 대응적 통제는 Lambda Remediation, SSM Automation, EventBridge Rules 등 '감지된 문제에 대해 자동으로 복구/대응하는' 메커니즘이다.

SAA 시험에서는 이 3가지 분류를 이해한 상태에서, 구체적인 서비스가 어떤 카테고리에 속하는지를 묻는 문제가 자주 출제된다. 특히 CloudTrail, GuardDuty, Inspector의 차이와 활용 방법은 필수 지식이다. 본 섹션에서는 각 서비스의 특징을 제1원리부터 파헤치고, 시험에서 출제되는 포인트를 정리한다.

## 핵심 개념

### 보안 통제 분류 (Security Control Classification)

**정의:** 보안 통제를 목적/기능별로 분류하는 프레임워크. 예방적 통제 (Preventive)는 문제 발생을 사전에 방지하고, 탐지적 통제 (Detective)는 발생한 문제를 감지하며, 대응적 통제 (Responsive)는 감지된 문제를 복구한다.

**소크라테스식 심화:**
> Q: "왜 예방적 통제만으로는 불충분한가?"
> A: 예방적 통제는 알려진 리스크에는 유효하지만, 모든 공격 패턴을 사전에 예측하는 것은 불가능하다. 예를 들어 IAM 정책으로 최소 권한을 설정해도 정규 크레덴셜이 유출된 경우 예방적 통제는 돌파된다. 탐지적 통제 (GuardDuty 등)가 없으면 이 침해를 인지하는 것조차 불가능하다.
> Q: "그렇다면 탐지적 통제가 있으면 대응적 통제는 불필요한가?"
> A: 탐지만으로는 문제가 해결되지 않는다. GuardDuty가 '비정상 API 호출을 탐지'해도 사람이 대응할 때까지 피해는 확대된다. 대응적 통제 (EventBridge + Lambda)가 자동으로 액세스 키를 비활성화하면 탐지로부터 수초 내에 피해를 봉쇄할 수 있다. 이 3계층의 조합이 다층 방어의 본질이다.

**현실 세계의 비유 (비IT 대상):**
> "중세의 성을 상상해 보세요. 해자 (WAF - 외부로부터의 악의적 요청을 차단), 도개교 (ALB - 정규 트래픽만 통과), 외벽 (NACL - 서브넷 레벨 필터), 내벽 (Security Group - 인스턴스 레벨 필터), 감시탑 (GuardDuty - 위협 탐지), 순찰 기록 (CloudTrail - 모든 행동을 기록). 하나의 벽이 뚫려도 공격자는 모든 방어 계층을 돌파해야 합니다"

**통제의 구체적 예시 매트릭스:**

| 카테고리 | 서비스 | 기능 |
|----------|----------|------|
| Preventive | IAM Policies | 리소스에 대한 액세스를 제한 |
| Preventive | SCP (Organizations) | 계정 전체의 권한 상한을 제어 |
| Preventive | Permission Boundaries | IAM 엔터티의 권한 상한을 설정 |
| Preventive | WAF | 웹 애플리케이션에 대한 악의적 요청을 차단 |
| Detective | CloudTrail | 모든 API 호출을 기록/감사 |
| Detective | GuardDuty | 위협 인텔리전스 + ML로 위협을 탐지 |
| Detective | Inspector | 취약점 스캔 (CVE + 네트워크 도달성) |
| Detective | Config Rules | 리소스 설정의 컴플라이언스 평가 |
| Detective | IAM Access Analyzer | 외부 공유/미사용 액세스의 탐지 |
| Responsive | Lambda + EventBridge | 탐지 이벤트를 트리거로 자동 복구 |
| Responsive | SSM Automation | 사전 정의된 런북에 의한 자동 복구 |
| Responsive | Config Remediation | Config Rules 비준수 리소스의 자동 복구 |

---

### IAM Access Analyzer

**정의:** IAM Access Analyzer는 AWS 리소스에 대한 외부 액세스, 미사용 액세스 권한, 그리고 IAM 정책의 타당성을 분석하는 서비스. Zone of Trust (신뢰 영역)를 정의하고, 해당 영역 외부로부터의 액세스를 'Finding (탐지 결과)'으로 보고한다.

**소크라테스식 심화:**
> Q: "IAM Access Analyzer란 무엇인가? 왜 필요한가?"
> A: AWS 계정 내의 리소스(S3 버킷, IAM 역할, KMS 키, Lambda 함수, SQS 큐 등)가 의도치 않게 외부(다른 AWS 계정이나 인터넷)에 공개되어 있지 않은지를 자동으로 탐지하는 서비스이다. 대규모 환경에서는 수백 개의 S3 버킷 정책이나 IAM 역할의 신뢰 정책을 사람이 모두 확인하는 것은 불가능하며, 누락이 심각한 데이터 유출로 이어진다.
> Q: "그렇다면 Access Analyzer가 없으면 어떻게 되는가?"
> A: (1) 퍼블릭 S3 버킷의 존재를 수개월간 인지하지 못할 가능성이 있다. (2) 크로스 계정 IAM 역할 신뢰 관계가 과도하게 넓게 설정되어 있어도 발견할 수 없다. (3) 사용되지 않는 액세스 키나 역할이 공격의 발판이 된다. 실제로 2019년 Capital One 사건에서는 S3 버킷의 과도한 액세스 허용이 주요 원인 중 하나였다.

**3가지 주요 기능:**

1. **외부 액세스 분석 (External Access Findings)**
   - S3 버킷, IAM 역할, KMS 키, Lambda 함수, SQS 큐, Secrets Manager 등을 대상
   - 신뢰 영역 외부의 프린시펄로부터 액세스 가능한 리소스를 탐지
   - 자동적이며 지속적으로 스캔됨

2. **정책 검증과 정책 생성**
   - Policy Validation: IAM 정책의 문법 오류, 모범 사례 위반을 탐지
   - Policy Generation: CloudTrail의 활동 로그로부터 최소 권한 정책을 자동 생성
   - 생성된 정책은 과거의 실제 API 호출에 기반함

3. **미사용 액세스 분석 (Unused Access Findings)**
   - 지정 기간 내에 사용되지 않은 역할, 액세스 키, 비밀번호를 탐지
   - 최소 권한 원칙의 유지에 불가결

---

### Permission Boundaries (액세스 허용 경계)

**정의:** IAM 엔터티 (사용자 또는 역할)에 부여할 수 있는 최대 권한을 정의하는 IAM 정책. Effective permissions (유효 권한)은 IAM 정책과 Permission Boundary의 공통 부분 (교집합)만 해당된다.

**수식 표현:**
```
유효 권한 = IAM 정책 ∩ Permission Boundary
```

**소크라테스식 심화:**
> Q: "Permission Boundary란 무엇인가? 왜 IAM 정책만으로는 불충분한가?"
> A: IAM 정책은 '무엇을 할 수 있는가'를 정의하지만, 관리자가 개발자에게 IAM 역할 생성 권한을 위임하면 개발자는 자신보다 강한 권한의 역할을 생성할 수 있다 (권한 에스컬레이션). Permission Boundary는 '어떤 경우에도 이 이상의 권한은 가질 수 없다'는 상한을 설정함으로써 이 문제를 해결한다.
> Q: "구체적으로 어떤 시나리오에서 사용하는가?"
> A: 전형적인 사용 사례는 개발자 셀프서비스 패턴이다. 개발자가 Lambda 함수용 IAM 역할을 직접 생성해야 하지만, 관리자 권한을 가진 역할을 생성하면 곤란하다. Permission Boundary를 조건으로 설정함으로써 '개발자는 IAM 역할을 생성할 수 있지만, 반드시 지정된 Permission Boundary를 부여해야 한다. 그리고 그 Boundary가 DynamoDB와 S3만 허용한다'는 제어가 실현된다.

**현실 세계의 비유 (비IT 대상):**
> "아이의 용돈 상한과 같은 것입니다. 부모 (관리자)가 월 5,000엔의 상한 (Permission Boundary)을 설정하고, 아이 (개발자)는 그 범위 내에서 자유롭게 사용할 수 있습니다 (IAM 정책). 아이가 '과자에 3,000엔, 만화에 2,000엔'으로 정해도 (IAM 정책) 합계 5,000엔을 초과하는 것은 물리적으로 불가능합니다. 아이가 스스로 새로운 예산 카테고리를 만들어도 상한은 변하지 않습니다"

**위임 패턴의 구현 예:**

```json
{
  "Effect": "Allow",
  "Action": ["iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary": "arn:aws:iam::123456789012:policy/DeveloperBoundary"
    }
  }
}
```

---

### CloudTrail

**정의:** AWS 계정 내의 모든 API 호출을 기록하는 서비스. 관리 콘솔, CLI, SDK, 다른 AWS 서비스로부터의 호출을 포함한다. 보안 감사, 컴플라이언스 증명, 인시던트 조사의 기반이 된다.

**소크라테스식 심화:**
> Q: "CloudTrail이란 무엇인가? 왜 필요한가?"
> A: CloudTrail은 'AWS 계정 내에서 누가, 언제, 무엇을 했는가'를 모두 기록하는 감사 로그 서비스이다. 보안의 세계에서는 '로그가 없으면 인시던트는 존재하지 않는 것과 같다'라고 한다. CloudTrail이 없으면 무단 액세스가 발생해도 원인 규명이 불가능해진다.
> Q: "보안 인시던트 발생 시 가장 먼저 해야 할 일은?"
> A: **먼저 CloudTrail을 확인한다.** 이것은 AWS 운영에서의 철칙이다. CloudTrail의 로그로부터 (1) 언제 무단 액세스가 시작되었는지, (2) 어떤 API가 호출되었는지, (3) 어떤 리소스가 영향을 받았는지, (4) 발신 IP 주소는 무엇인지를 특정할 수 있다.

**현실 세계의 비유 (비IT 대상):**
> "빌딩 내의 CCTV 영상과 같은 것입니다. 누가, 언제, 어떤 방에, 무엇을 하러 들어갔는지가 모두 기록됩니다. 사건 (인시던트)이 발생하면 가장 먼저 확인하는 증거 영상입니다"

**이벤트 종류:**

| 이벤트 유형 | 설명 | 예시 | 기본값 |
|-------------|------|-----|-----------|
| Management Events | 컨트롤 플레인 작업 | CreateBucket, RunInstances, CreateUser | 활성화 (무료) |
| Data Events | 데이터 플레인 작업 | GetObject, PutObject, Invoke (Lambda) | 비활성화 (유료) |
| Insights Events | 비정상적인 API 호출 패턴 | 평소의 10배에 달하는 DeleteObject | 선택 사항 |

**주요 기능:**

- **Organization Trail:** Organizations 전체 계정의 로그를 일원 관리. 관리 계정에서 설정하고, 전용 S3 버킷에 집약한다.
- **로그 파일 무결성 검증 (Log File Integrity Validation):** SHA-256 해시 체인에 의한 변조 탐지. 1시간마다 다이제스트 파일이 생성되어 로그의 변조나 삭제를 탐지할 수 있다. 법적 증거로서의 로그 신뢰성을 담보한다.
- **CloudTrail Lake:** SQL 기반의 로그 쿼리 서비스. 기존의 S3 + Athena의 대안으로, CloudTrail 이벤트를 직접 SQL로 검색 가능. 최대 7년간의 데이터 보유.

```sql
-- CloudTrail Lake 쿼리 예: 지난 24시간의 실패한 API 호출
SELECT eventTime, eventName, userIdentity.arn, errorCode, errorMessage
FROM event_data_store_id
WHERE eventTime > '2026-02-09 00:00:00'
  AND errorCode IS NOT NULL
ORDER BY eventTime DESC
```

---

### GuardDuty

**정의:** AWS 환경에서의 위협을, 위협 인텔리전스 피드와 머신러닝 (ML) 기반의 이상 탐지로 지속적으로 모니터링하고 탐지하는 관리형 서비스. 에이전트 불필요로 활성화만 하면 동작한다.

**소크라테스식 심화:**
> Q: "GuardDuty란 무엇인가? CloudTrail과의 차이는 무엇인가?"
> A: CloudTrail은 '기록'하는 서비스이며, GuardDuty는 '분석/탐지'하는 서비스이다. CloudTrail이 CCTV 영상이라면, GuardDuty는 그 영상을 AI로 분석하여 수상한 행동을 자동 탐지하는 시스템이다. GuardDuty는 CloudTrail의 로그, VPC Flow Logs, DNS Logs 등을 분석 데이터 소스로 사용한다.
> Q: "GuardDuty가 없으면 어떻게 되는가?"
> A: CloudTrail의 로그는 방대하며 사람이 모두 확인하는 것은 불가능하다. 하루에 수백만 건의 API 이벤트가 기록되는 환경에서, 그 중에서 '오전 3시에 평소 사용하지 않는 리전에서 EC2가 100대 기동됨 (크립토마이닝)'을 찾아내는 것은 사람에게는 어렵지만, GuardDuty의 ML 모델은 과거의 행동 패턴으로부터의 이탈로 즉시 탐지한다.

**데이터 소스:**

| 데이터 소스 | 분석 대상 | 탐지 예시 |
|-------------|---------|--------|
| VPC Flow Logs | 네트워크 트래픽 패턴 | C&C 서버로의 통신, 포트 스캔 |
| DNS Logs | DNS 쿼리 | 알려진 악성코드 도메인으로의 이름 확인 |
| CloudTrail Management Events | API 호출 패턴 | 비정상 API 호출, 권한 에스컬레이션 |
| CloudTrail S3 Data Events | S3 데이터 액세스 패턴 | 비정상적인 대량 데이터 다운로드 |
| EKS Audit Logs | Kubernetes API 서버 로그 | 수상한 컨테이너 조작 |

**Finding Types (탐지 결과의 종류):**

- **Backdoor:** 리소스가 백도어로 이용되고 있음 (DDoS 공격 출처 등)
- **CryptoCurrency:** 크립토마이닝 활동의 탐지
- **Trojan:** 트로이 목마적 활동의 탐지
- **UnauthorizedAccess:** 무단 액세스의 시도 또는 성공
- **Recon:** 정찰 활동 (포트 스캔, API 열거)
- **Exfiltration:** 데이터의 외부 유출

**Severity Levels (심각도):**

| 레벨 | 수치 범위 | 의미 | 대응 |
|--------|---------|------|------|
| Low | 1.0 - 3.9 | 의심스럽지만 영향은 제한적 | 정기 리뷰 |
| Medium | 4.0 - 6.9 | 예상 외의 활동을 확인 | 조사 필요 |
| High | 7.0 - 8.9 | 리소스가 침해된 가능성 | 즉시 대응 |

---

### Inspector

**정의:** Amazon Inspector v2는 EC2 인스턴스, ECR 컨테이너 이미지, Lambda 함수의 취약점을 자동으로 스캔하는 관리형 서비스. CVE (Common Vulnerabilities and Exposures) 데이터베이스와 네트워크 도달성 분석을 사용한다.

**소크라테스식 심화:**
> Q: "Inspector란 무엇인가? GuardDuty와의 차이는 무엇인가?"
> A: GuardDuty는 '현재 진행 중인 위협'을 탐지하는 반면, Inspector는 '존재하는 취약점'을 탐지한다. GuardDuty가 '도둑이 침입 중'을 감지하는 시스템이라면, Inspector는 '잠금장치가 고장난 창문이 있다'를 사전에 발견하는 점검 서비스이다. Inspector는 공격이 발생하기 전에 취약점을 찾는 것에 초점을 맞춘다.
> Q: "CVE란 무엇인가?"
> A: Common Vulnerabilities and Exposures (공통 취약점 식별자)의 약어로, 공개된 보안 취약점의 표준적인 식별 시스템이다. 각 취약점에는 CVE-2024-XXXXX와 같은 고유 ID가 부여된다.

**현실 세계의 비유 (비IT 대상):**
> "자동차 리콜 통지와 같은 것입니다. 브레이크 결함 (취약점)이 발견되면 고유한 리콜 번호 (CVE-2024-XXXXX)가 부여됩니다. 모든 차량 소유자 (시스템 관리자)가 이 번호로 자신의 차가 대상인지 확인할 수 있습니다. Inspector는 이 확인 작업을 자동으로 수행합니다"

**Inspector v2의 주요 특징:**

| 특징 | 설명 |
|------|------|
| 에이전트리스 | SSM Agent를 활용. 전용 에이전트 불필요 |
| 자동 스캔 | 활성화만 하면 대상 리소스를 자동 검색/스캔 |
| CVE 데이터베이스 | NVD 등의 취약점 데이터베이스와 통합, 새 CVE 공개 시 자동 재스캔 |
| 네트워크 도달성 | EC2 인스턴스로의 네트워크 경로를 분석 |
| ECR 스캔 | 컨테이너 이미지의 OS 패키지 및 프로그래밍 언어 패키지의 취약점 탐지 |
| Lambda 함수 스캔 | 배포된 함수 코드와 의존 패키지의 취약점 탐지 |
| Risk Score | CVSS 스코어에 네트워크 도달성을 가미한 독자적 리스크 스코어 |

---

### 자동 복구 패턴 (Responsive Controls)

**정의:** 탐지적 통제가 발견한 문제를 자동으로 복구하는 메커니즘. EventBridge + Lambda의 조합이 가장 일반적인 패턴이다.

**전형적인 자동 복구 플로우:**

```
GuardDuty Finding (High Severity)
  → EventBridge Rule (필터: severity >= 7)
    → Lambda Function (자동 복구)
      → IAM: 액세스 키 비활성화
      → EC2: Security Group을 격리용 SG로 변경
      → SNS: 보안 팀에 알림
```

```
Config Rule (S3 버킷이 퍼블릭)
  → Config Remediation (SSM Automation)
    → S3: 퍼블릭 액세스 블록 설정을 활성화
    → SNS: 관리자에게 알림
```

**EventBridge Rule의 이벤트 패턴 예:**

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{ "numeric": [">=", 7] }]
  }
}
```

## 아키텍처 패턴

### 패턴1: 다층 방어 아키텍처

```
Internet
  │
  ├── WAF (Layer 7 필터링: SQLi, XSS, Bot Control)
  │
  ├── CloudFront (DDoS 완화: Shield Standard 자동 적용)
  │
  ├── ALB (TLS 종단, 경로/호스트 기반 라우팅)
  │     │
  │     └── Security Group (ALB용: 443만 허용)
  │
  ├── EC2 / ECS (애플리케이션 계층)
  │     │
  │     └── Security Group (앱용: ALB로부터의 통신만)
  │
  ├── RDS (데이터 계층)
  │     │
  │     └── Security Group (DB용: 앱 계층으로부터의 3306만)
  │
  └── Monitoring Layer
        ├── CloudTrail (모든 API 호출 기록)
        ├── GuardDuty (위협 탐지)
        ├── Inspector (취약점 스캔)
        └── Config Rules (설정 컴플라이언스)
```

### 패턴2: 인시던트 대응 자동화

```
Step 1: 탐지
  GuardDuty → "UnauthorizedAccess:IAMUser/MaliciousIPCaller.Custom"

Step 2: 알림 + 자동 복구
  EventBridge Rule → Lambda Function
    ├── IAM: 침해된 액세스 키를 비활성화
    ├── EC2: 영향을 받은 인스턴스의 SG를 격리용 SG로 변경
    ├── SNS: 보안 팀에 PagerDuty 알림
    └── CloudWatch: 커스텀 메트릭 기록

Step 3: 조사
  CloudTrail Lake → SQL 쿼리로 영향 범위를 특정
  VPC Flow Logs → 의심스러운 통신처의 특정

Step 4: 복구
  SSM Automation → 표준화된 복구 런북 실행
```

### 패턴3: Organization 레벨의 보안 통제

```
Management Account
  ├── CloudTrail Organization Trail → Central S3 Bucket
  ├── GuardDuty 위임 관리자 → Security Account
  ├── Inspector 위임 관리자 → Security Account
  └── Config Aggregator → Security Account

Security Account (위임 관리자)
  ├── GuardDuty: 전 멤버 계정의 위협을 일원 관리
  ├── Inspector: 전 멤버 계정의 취약점을 일원 관리
  ├── SecurityHub: Findings의 통합 대시보드
  └── EventBridge: 크로스 계정의 자동 복구
```

## SAA 시험 포인트

- **보안 인시던트 발생 시 첫 번째 액션은 CloudTrail 확인**이다. "What is the FIRST step?" 유형의 문제에서는 CloudTrail이 정답인 경우가 많다.
- **GuardDuty는 에이전트리스**로 활성화만 하면 동작한다. Inspector v2도 SSM Agent 경유로 에이전트리스로 동작한다.
- **GuardDuty의 데이터 소스**에 CloudWatch Logs는 포함되지 않는다. VPC Flow Logs, DNS Logs, CloudTrail Events, S3 Data Events, EKS Audit Logs가 대상이다.
- **Inspector v2는 v1과는 완전히 다른 서비스**로 생각해도 좋다. v2는 에이전트리스, 자동 스캔, ECR/Lambda 대응. v1은 수동 실행, 에이전트 필수였다.
- **Permission Boundary는 IAM 정책의 AND 조건**으로 기능한다. Boundary에서 허용되어 있어도 IAM 정책에서 허용되지 않으면 액세스가 거부된다. 반대도 마찬가지이다.
- **IAM Access Analyzer의 "External Access"**는 신뢰 영역 외부로부터의 액세스를 탐지한다. 신뢰 영역은 AWS 계정 또는 Organization이다.
- **CloudTrail의 로그 파일 무결성 검증**은 SHA-256 해시 체인을 사용한다. 법적 증거로서의 로그 신뢰성이 문제될 경우 이 기능이 답이다.
- **CloudTrail의 Management Events는 기본 활성화** (무료). Data Events는 선택 사항 (유료)으로 명시적으로 활성화가 필요하다. S3의 GetObject/PutObject 로그가 필요한 경우 Data Events를 활성화한다.
- **GuardDuty의 Findings는 EventBridge 경유**로 다른 서비스에 연계 가능. Lambda로 자동 복구하는 패턴은 자주 출제된다.
- **Config Rules와 Inspector의 차이:** Config Rules는 리소스의 설정 (Security Group이 특정 포트를 열고 있는지 등)을 평가한다. Inspector는 소프트웨어의 취약점 (CVE)과 네트워크 도달성을 평가한다.
- **CloudTrail Lake vs Athena:** CloudTrail Lake는 CloudTrail 전용의 SQL 쿼리 서비스. Athena는 S3 상의 임의의 데이터에 대한 SQL 쿼리. CloudTrail Lake는 설정이 간편하지만, Athena가 비용 효율이 좋은 경우도 있다.

## 핸즈온 참조

- CDK 프로젝트: `cdk-projects/05-security-edge/`
- 구축하는 주요 리소스:
  - CloudTrail Trail (Organization Trail)
  - GuardDuty Detector
  - Inspector 활성화
  - IAM Access Analyzer
  - EventBridge Rule + Lambda 자동 복구
  - Permission Boundary 정책
- 확인 포인트:
  - CloudTrail에서 콘솔 조작의 로그가 기록되는 것을 확인
  - GuardDuty의 샘플 Finding을 생성하여 EventBridge 연계를 확인
  - Inspector에서 EC2 인스턴스의 취약점 스캔 결과를 확인
  - Permission Boundary를 부여한 역할에서 권한 에스컬레이션이 방지되는 것을 확인

## Well-Architected 체크리스트

### Security - Identity and Access Management
- [ ] 모든 IAM 사용자에게 MFA가 활성화되어 있는가
- [ ] 루트 계정의 사용을 최소한으로 억제하고 MFA를 설정하고 있는가
- [ ] IAM 정책이 최소 권한 원칙을 따르고 있는가
- [ ] IAM Access Analyzer로 외부 액세스의 Findings를 정기적으로 리뷰하고 있는가
- [ ] 미사용 IAM 사용자, 역할, 액세스 키를 정기적으로 정리하고 있는가
- [ ] Permission Boundary를 사용하여 개발자의 셀프서비스를 안전하게 위임하고 있는가

### Security - Detective Controls
- [ ] CloudTrail이 전 리전에서 활성화되어 있는가
- [ ] CloudTrail의 로그 파일 무결성 검증이 활성화되어 있는가
- [ ] GuardDuty가 전 계정/전 리전에서 활성화되어 있는가
- [ ] Inspector가 자동 스캔 모드로 활성화되어 있는가
- [ ] Config Rules로 보안 베이스라인의 준수 상황을 모니터링하고 있는가
- [ ] VPC Flow Logs가 전 VPC에서 활성화되어 있는가

### Security - Incident Response
- [ ] 보안 인시던트 대응 절차가 문서화되어 있는가
- [ ] GuardDuty의 High Severity Findings에 EventBridge 규칙이 설정되어 있는가
- [ ] 자동 복구 Lambda 함수가 테스트되었는가
- [ ] CloudTrail Lake 또는 Athena로 인시던트 조사 쿼리가 준비되어 있는가
- [ ] 인시던트 대응의 정기적인 훈련 (Game Day)을 실시하고 있는가
