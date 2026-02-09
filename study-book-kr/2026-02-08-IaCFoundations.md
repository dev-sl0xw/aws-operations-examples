# 섹션01: IaC 기초 (Infrastructure as Code Foundations)
> Well-Architected Pillars: Operational Excellence, Cost Optimization
> Day: 1 | 난이도: 기초

## 개요

Infrastructure as Code (IaC)는 클라우드 인프라스트럭처를 코드로 정의하고 관리하는 방법론이다. 기존의 수동 콘솔 조작이나 CLI를 통한 임시방편적 구축을 배제하고, 템플릿 파일을 통해 인프라의 상태를 선언적으로 기술한다. 이를 통해 환경의 재현성, 변경의 추적 가능성, 팀 간의 협업이 비약적으로 향상된다.

AWS에서 IaC의 핵심은 CloudFormation이며, 그 상위 추상화로 CDK (Cloud Development Kit)가 존재한다. CloudFormation은 JSON/YAML 템플릿으로부터 AWS 리소스의 프로비저닝을 자동화하고, 스택 단위로 리소스의 라이프사이클을 관리한다. CDK는 TypeScript, Python 등의 프로그래밍 언어로 인프라를 기술할 수 있으며, CloudFormation 템플릿으로 합성(synthesize)된다.

운영의 관점에서 IaC는 Operational Excellence 원칙의 근간을 이룬다. 변경 관리 프로세스를 표준화하고, 환경 간 일관성을 보장하며, 장애 시 신속한 복구를 가능하게 한다. 또한 불필요한 리소스의 가시화를 통한 Cost Optimization에도 직결된다.

## 핵심 개념

### Infrastructure as Code (IaC)

**정의:** 인프라스트럭처의 구성을 코드(템플릿 파일)로 기술하여 버전 관리, 자동화, 재사용을 가능하게 하는 방법론. 수동 조작을 배제하고 프로비저닝 프로세스를 선언적이고 멱등하게 만든다.

**소크라테스식 심화:**
> Q: "IaC란 무엇인가? 왜 필요한가?"
> A: IaC란 서버나 네트워크 등의 인프라 구성을 코드 파일에 기술하는 것이다. 왜 필요한지를 생각하려면 IaC가 없는 세계를 상상해보면 된다. 기존에 엔지니어는 AWS 콘솔에 로그인하여 마우스로 클릭하며 EC2를 만들고, 보안 그룹을 설정하고, RDS를 구축했다. 이 절차는 담당자의 기억이나 메모에 의존하여 재현성이 없다. 두 번째로 같은 환경을 만들려고 하면 미묘하게 설정이 다른 환경이 완성된다. IaC는 이 문제를 근본적으로 해결한다.
> Q: "그렇다면 IaC가 없으면 어떻게 되는가?"
> A: (1) 환경의 불일치: 개발/스테이징/프로덕션 환경에서 설정이 달라 "개발에서는 동작했는데 프로덕션에서는 동작하지 않는다"가 빈발한다. (2) 변경 추적 불가: 누가 언제 무엇을 변경했는지 알 수 없어 장애 원인 파악에 시간이 걸린다. (3) 복구 지연: 장애 시 수동으로 환경을 재구축하기 때문에 RTO가 수 시간~수 일에 달한다. (4) 속인화: 특정 엔지니어만 환경을 구축할 수 있는 상태에 빠진다.

**현실 세계의 비유 (비IT 대상):**
> "레스토랑의 레시피 vs 기억으로 요리. 레시피(템플릿)가 있으면 누가 만들어도 매번 같은 요리(환경)를 재현할 수 있습니다. 기억에 의존하면 요리사가 바뀔 때마다 맛이 변합니다. 또한 레시피를 버전 관리하면 '지난달 레시피로 되돌리기'도 가능합니다"

---

### 멱등성 (Idempotency)

**정의:** 같은 조작을 몇 번 실행해도 결과가 항상 동일한 성질. CloudFormation 템플릿을 반복적으로 배포해도 이미 존재하는 리소스는 재생성되지 않고, 차이분만 적용된다.

**소크라테스식 심화:**
> Q: "멱등성이란 무엇인가? 왜 IaC에 있어 중요한가?"
> A: 멱등성이란 수학적으로는 f(f(x)) = f(x)가 되는 성질이다. IaC 맥락에서는 "템플릿을 10번 적용해도 1번 적용한 것과 같은 결과가 된다"는 것을 의미한다. 이것이 중요한 이유는 운영 현장에서는 배포가 도중에 실패하거나, 같은 템플릿을 여러 번 적용하는 상황이 빈번하게 발생하기 때문이다. 멱등성이 없으면 두 번째 배포에서 중복 리소스가 생성되거나 오류로 중지된다.
> Q: "그렇다면 멱등성이 없는 시스템에서는 어떻게 되는가?"
> A: 예를 들어 "EC2 인스턴스를 1대 생성하라"는 스크립트를 멱등성 없이 2번 실행하면 2대의 인스턴스가 생성된다. CloudFormation은 스택의 현재 상태와 템플릿의 원하는 상태를 비교하여 차이분만 적용한다. 이미 인스턴스가 존재하면 아무것도 하지 않는다. 이것이 멱등성의 힘이다.

**현실 세계의 비유 (비IT 대상):**
> "일종의 시스템의 전기 스위치와 같은 것. 1번 눌러도 ON, 한 번 더 눌러도 이미 ON이면 아무것도 변하지 않는다. CloudFormation에 템플릿을 몇 번 적용해도 결과는 항상 같은 상태로 수렴합니다"

---

### 선언적 vs 명령적 (Declarative vs Imperative)

**정의:** 선언적 접근법은 "무엇이 필요한가"(최종 상태)를 기술하고, 도달 방법은 시스템에 맡긴다. 명령적 접근법은 "어떻게 만드는가"(절차)를 하나씩 기술한다. CloudFormation은 선언적, 셸 스크립트는 명령적이다.

**소크라테스식 심화:**
> Q: "왜 CloudFormation은 선언적 접근법을 채택하고 있는가?"
> A: 선언적 접근법의 가장 큰 장점은 엔지니어가 "무엇을" 달성하고 싶은지에 집중할 수 있고, "어떻게" 달성하는지의 복잡성을 CloudFormation 엔진에 위임할 수 있다는 것이다. 예를 들어 VPC를 생성한 다음 서브넷을 만들고, 그 후 보안 그룹을 만드는 순서 관리는 CloudFormation이 의존 관계 그래프를 자동 분석하여 수행한다. 명령적 스크립트에서는 이 순서를 사람이 정확하게 관리해야 한다.
> Q: "그렇다면 선언적 접근법의 약점은 없는가?"
> A: 복잡한 조건 분기나 반복 처리가 약하다. CloudFormation의 Conditions나 Mappings는 제한적이며, 프로그래밍 언어의 유연성에는 미치지 못한다. 이것이 CDK가 등장한 이유 중 하나이다. CDK는 프로그래밍 언어의 모든 기능(if문, for문, 함수, 클래스)을 사용하여 인프라를 기술할 수 있으며, 최종적으로 CloudFormation 템플릿으로 출력된다.

**현실 세계의 비유 (비IT 대상):**
> "목적지를 내비게이션에 입력하는 것(선언적)과 '다음 교차로에서 우회전하고, 3번째 신호에서 좌회전하고...'라고 하나씩 지시하는 것(명령적)의 차이. CloudFormation은 선언적 -- 최종 상태를 기술하면 도달 방법은 AWS가 판단합니다. 정체(의존 관계)의 우회도 자동입니다"

---

### CloudFormation 템플릿 구조

**정의:** CloudFormation 템플릿은 JSON/YAML 형식으로 기술되며, 다음의 주요 섹션으로 구성된다.

```yaml
AWSTemplateFormatVersion: "2010-09-09"   # 템플릿 사양 버전 (고정값)
Description: "템플릿의 설명문"              # 사람을 위한 설명

Parameters:                               # 배포 시 전달하는 변수
  EnvironmentType:
    Type: String
    AllowedValues: [dev, stg, prod]
    Default: dev

Mappings:                                 # 정적 참조 테이블 (배포 시 변경 불가)
  RegionMap:
    ap-northeast-1:
      AMI: ami-0abcdef1234567890
    us-east-1:
      AMI: ami-0fedcba9876543210

Conditions:                               # 조건부 리소스 생성
  IsProduction: !Equals [!Ref EnvironmentType, prod]

Resources:                                # 【필수】AWS 리소스 정의
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "${AWS::StackName}-data"

Outputs:                                  # 스택 생성 후 출력값
  BucketArn:
    Value: !GetAtt MyBucket.Arn
    Export:
      Name: !Sub "${AWS::StackName}-BucketArn"
```

**중요한 포인트:**
- `Resources` 섹션만이 필수. 나머지는 모두 옵션.
- `AWSTemplateFormatVersion`은 "2010-09-09"로 고정(2010년 이후 업데이트되지 않음).
- `Parameters`는 배포 시 동적 입력, `Mappings`는 템플릿 내의 정적 참조 테이블.
- `Outputs`의 `Export`는 크로스 스택 참조에 사용된다.

---

### 내장 함수 (Intrinsic Functions)

**정의:** CloudFormation 템플릿 내에서 리소스 간의 참조나 문자열 조작을 수행하기 위한 함수 모음.

| 함수 | 용도 | 예 |
|------|------|-----|
| `!Ref` | 파라미터의 값 또는 리소스의 물리 ID를 반환 | `!Ref MyBucket` → 버킷명 |
| `!GetAtt` | 리소스의 특정 속성을 반환 | `!GetAtt MyBucket.Arn` → ARN |
| `!Sub` | 문자열 내의 변수를 치환 | `!Sub "arn:aws:s3:::${MyBucket}/*"` |
| `!Join` | 구분자로 문자열을 결합 | `!Join ["-", [!Ref Env, "app"]]` |
| `!Select` | 리스트에서 지정 인덱스의 값을 반환 | `!Select [0, !GetAZs ""]` |
| `!Split` | 문자열을 구분자로 분할 | `!Split [",", "a,b,c"]` |
| `!If` | 조건에 따라 값을 반환 | `!If [IsProduction, "t3.large", "t3.micro"]` |
| `!FindInMap` | Mappings에서 값을 가져옴 | `!FindInMap [RegionMap, !Ref "AWS::Region", AMI]` |

**DependsOn에 대해:**

`DependsOn`은 함수가 아니라 리소스 속성이며, 명시적인 의존 관계를 선언한다.

```yaml
Resources:
  MyInstance:
    Type: AWS::EC2::Instance
    DependsOn: MyRDSInstance    # RDS가 먼저 생성된다
    Properties:
      # ...
```

일반적으로 CloudFormation은 `!Ref`나 `!GetAtt`의 참조로부터 암묵적인 의존 관계를 추론한다. `DependsOn`이 필요한 것은 참조 관계가 없더라도 순서를 제어하고 싶은 경우(예: EC2가 RDS의 기동을 기다려야 하지만, 템플릿 내에서 직접 참조하지 않는 경우)이다.

---

### 드리프트 감지 (Drift Detection)

**정의:** CloudFormation 스택의 실제 리소스 상태와 템플릿에서 정의된 기대 상태의 차이를 감지하는 기능. 콘솔이나 API를 통해 수동으로 변경된 설정을 발견할 수 있다.

**소크라테스식 심화:**
> Q: "드리프트란 무엇인가? 왜 발생하는가?"
> A: 드리프트란 CloudFormation으로 관리되는 리소스가 템플릿 외의 수단(콘솔 조작, CLI, 다른 IaC 도구 등)으로 변경되어, 템플릿의 정의와 실제 상태가 괴리되는 것을 말한다. 발생 원인은 주로 (1) 긴급 대응으로 콘솔에서 직접 변경한 경우, (2) 다른 팀이 모르고 변경한 경우, (3) AWS 자동 처리에 의한 변경, 이 세 가지이다.
> Q: "드리프트 감지에는 한계가 있는가?"
> A: 있다. (1) 모든 리소스 유형이 드리프트 감지를 지원하는 것은 아니다. (2) 템플릿에 기술되지 않은 속성의 변경은 감지할 수 없다. (3) 중첩된 스택의 드리프트 감지에는 추가 작업이 필요하다. (4) 리소스의 삭제는 감지할 수 있지만, 템플릿 외에서 추가된 리소스는 감지할 수 없다.

**현실 세계의 비유 (비IT 대상):**
> "누군가가 무단으로 사무실의 가구를 재배치한 것과 같은 것. 도면(템플릿)에는 창가에 데스크가 있어야 하는데, 실제로는 구석으로 이동되어 있다. 드리프트 감지는 이 차이를 찾는 기능입니다. 다만 도면에 실리지 않은 개인 물품(템플릿 외의 속성)의 이동은 감지할 수 없습니다"

**드리프트 감지가 포착할 수 있는 것:**
- 리소스의 속성값 변경
- 스택 관리 리소스의 삭제

**드리프트 감지가 포착할 수 없는 것:**
- 템플릿에 기술하지 않은 속성의 변경
- 지원되지 않는 리소스 유형의 변경
- 템플릿 외에서 추가된 신규 리소스

---

### Service Catalog

**정의:** AWS Service Catalog는 조직 내에서 승인된 AWS 리소스를 "제품"으로 정의하고, 포트폴리오로 묶어 배포 및 관리하는 서비스. 최종 사용자는 사전 승인된 구성만을 셀프 서비스로 프로비저닝할 수 있다.

**주요 개념:**

| 개념 | 설명 |
|------------|------|
| **포트폴리오** | 제품의 집합. IAM 사용자/그룹/역할에 공유 |
| **제품 (Product)** | CloudFormation 템플릿에 기반한 단위. 버전 관리 가능 |
| **시작 제약 (Launch Constraint)** | 제품 프로비저닝 시 사용할 IAM 역할을 지정. 최종 사용자에게 직접적인 CloudFormation 권한을 부여하지 않아도 됨 |
| **버전 관리** | 제품의 여러 버전을 관리. 이전 버전으로부터의 마이그레이션을 제어 |

**소크라테스식 심화:**
> Q: "왜 Service Catalog가 필요한가? IAM 정책만으로는 부족한가?"
> A: IAM 정책은 "무엇을 할 수 있는가"를 제어하지만, "어떤 구성으로 만드는가"까지는 제어할 수 없다. 예를 들어 IAM으로 "EC2를 생성할 수 있다"고 허가해도, 최종 사용자가 m5.24xlarge를 선택하여 비용이 폭증할 가능성이 있다. Service Catalog라면 "t3.micro의 EC2 + 지정 VPC + 지정 보안 그룹"이라는 승인된 구성만을 제공할 수 있다.
> Q: "시작 제약 (Launch Constraint)은 왜 중요한가?"
> A: 시작 제약이 없으면 최종 사용자가 CloudFormation 스택을 생성하기 위해 CloudFormation + 모든 리소스의 생성 권한이 필요하게 된다. 시작 제약을 사용하면 지정한 IAM 역할의 권한으로 프로비저닝이 실행되므로, 사용자 자신에게는 최소한의 권한(Service Catalog 사용 권한만)으로 충분하다.

---

### 태그 전략 (Tagging Strategy)

**정의:** AWS 리소스에 키-값 쌍의 메타데이터를 부여하여 비용 배분, 접근 제어, 자동화, 운영 관리를 실현하는 체계적인 접근법.

**4단계 접근법:**

1. **목적 정의:** 태그로 무엇을 달성하고 싶은지 명확히 한다
   - 비용 배분 (Cost Allocation)
   - 접근 제어 (ABAC: Attribute-Based Access Control)
   - 자동화 (예: 야간에 자동 정지할 인스턴스를 `AutoStop=true`로 식별)
   - 운영 관리 (환경 식별, 소유자 식별)

2. **명명 규칙:** 일관된 키 명명 규칙을 수립한다
   ```
   Environment: dev | stg | prod
   Project: project-name
   Owner: team-name
   CostCenter: 1234
   AutoStop: true | false
   ```
   - 대소문자 통일 (PascalCase 권장)
   - 접두사 사용 (예: `aws:`는 AWS 예약, `company:`는 자사)

3. **강제 (Enforcement):**
   - SCP: 태그 없는 리소스 생성을 금지
   - AWS Config Rules: `required-tags` 규칙으로 미태그 리소스를 감지
   - Service Catalog: 템플릿에 태그를 내장

4. **평가 개선:** Tag Editor로 태그 적용 상황을 가시화하고 정기적으로 리뷰

---

### CDK vs CloudFormation

**정의:** AWS CDK는 프로그래밍 언어(TypeScript, Python, Java, C#, Go)로 인프라를 기술하고, CloudFormation 템플릿으로 합성하는 프레임워크. CloudFormation의 상위 레이어에 위치한다.

| 관점 | CloudFormation | CDK |
|------|---------------|-----|
| 기술 언어 | YAML/JSON | TypeScript, Python 등 |
| 추상도 | 낮음 (L1: 1:1 매핑) | 높음 (L2: 베스트 프랙티스 포함) |
| 조건 분기 | Conditions (제한적) | if/else (완전) |
| 반복 | 없음 | for/map (완전) |
| 테스트 | 어려움 | 유닛 테스트 가능 |
| 재사용 | 중첩 스택 | Constructs (npm 등으로 배포) |
| 학습 곡선 | 낮음~중간 | 중간~높음 (프로그래밍 지식 필요) |

**CDK가 선호되는 경우:**
- 여러 환경(dev/stg/prod)에서 미묘하게 다른 구성을 관리하는 경우
- 조건 분기나 반복이 많은 인프라 구성
- 유닛 테스트를 포함한 CI/CD 파이프라인에서의 관리
- 팀 내에 프로그래밍 스킬이 있는 경우

**CloudFormation이 선호되는 경우:**
- 단순한 인프라 구성
- 프로그래밍 지식이 없는 팀
- Service Catalog의 제품 템플릿으로 사용하는 경우

## 아키텍처 패턴

### 패턴1: 환경별 스택 분리

```
cdk-app/
  lib/
    network-stack.ts      # VPC, Subnets
    compute-stack.ts      # EC2, ECS
    database-stack.ts     # RDS, DynamoDB
  bin/
    app.ts                # 환경별로 스택을 인스턴스화
```

각 스택을 기능별로 분리하고, `cdk.json`의 context 또는 환경 변수로 dev/stg/prod를 전환한다. 스택 간 의존은 `Export/Import` 또는 CDK의 직접 참조로 해결한다.

### 패턴2: 멀티 계정 및 멀티 리전

```
Organizations Root
  ├── Management Account (CloudFormation StackSets)
  ├── OU: Production
  │     ├── Account: prod-ap-northeast-1
  │     └── Account: prod-us-east-1
  └── OU: Non-Production
        ├── Account: dev
        └── Account: stg
```

CloudFormation StackSets를 사용하여 여러 계정 및 여러 리전에 일괄 배포. Service Catalog와 Organizations의 통합으로 승인된 제품을 전체 계정에 배포한다.

### 패턴3: CI/CD 파이프라인에 의한 IaC 배포

```
Git Push → CodePipeline → CodeBuild (cdk synth + test) → CloudFormation Deploy
                                       ↓
                              Manual Approval (prod)
```

CDK의 `cdk synth`로 템플릿을 생성하고, 유닛 테스트와 스냅샷 테스트를 실행한 후 CloudFormation을 통해 배포한다. 프로덕션 환경에는 수동 승인 단계를 삽입한다.

## SAA 시험 포인트

- **CloudFormation 템플릿에서 유일한 필수 섹션은 `Resources`** 이다. `AWSTemplateFormatVersion`은 권장이지만 필수는 아니다.
- **`!Ref`** 는 파라미터의 경우 값을, 리소스의 경우 물리 ID(예: EC2의 인스턴스 ID)를 반환한다. ARN이 필요한 경우 **`!GetAtt`** 를 사용한다.
- **드리프트 감지**는 모든 리소스 유형을 지원하지 않는다. 지원되는 리소스는 AWS 문서에서 확인 필요.
- **스택 업데이트 시 동작**에는 3종류가 있다: Update with No Interruption (중단 없음), Update with Some Interruption (일부 중단), Replacement (교체 = 기존 리소스 삭제 + 신규 생성).
- **DeletionPolicy**는 스택 삭제 시 리소스의 처리를 제어한다. `Retain` (유지), `Snapshot` (스냅샷 취득 후 삭제), `Delete` (삭제, 기본값).
- **StackSets**는 Organizations와 연계하여 여러 계정 및 리전에 일괄 배포. 관리 계정 또는 위임 관리자 계정에서 조작한다.
- **Service Catalog의 시작 제약**을 사용하면 최종 사용자에게 CloudFormation 권한을 직접 부여하지 않고 제품을 프로비저닝할 수 있다.
- **Mappings**는 배포 시 변경 불가한 정적 테이블. 리전별 AMI ID와 같은 고정값 참조에 사용. **Parameters**는 동적 입력.
- **CloudFormation Change Sets**는 업데이트 전에 변경 내용을 미리보기하는 기능. 실제 변경은 적용할 때까지 이루어지지 않는다.

## 핸즈온 참조

- CDK 프로젝트: `cdk-projects/01-iam-org-governance/`
- 주요 스택: IamOrgGovernanceStack
- 관련 스크립트: `scripts/` 디렉토리 내의 설정 스크립트

## Well-Architected 체크리스트

### Operational Excellence
- [ ] 모든 인프라가 IaC로 관리되고 있는가 (수동 생성 리소스가 존재하지 않는가)
- [ ] CloudFormation 드리프트 감지를 정기적으로 실행하고 있는가
- [ ] 스택 변경에 Change Sets를 사용하고 있는가
- [ ] 템플릿이 버전 관리(Git)되고 있는가
- [ ] CI/CD 파이프라인으로 IaC의 자동 배포를 수행하고 있는가

### Cost Optimization
- [ ] 모든 리소스에 비용 배분 태그가 부여되어 있는가
- [ ] 태그 기반 비용 리포트가 활성화되어 있는가
- [ ] 불필요한 리소스를 식별하기 위한 태그 전략이 수립되어 있는가
- [ ] Service Catalog로 비용 효율적인 구성만을 허용하고 있는가
- [ ] DeletionPolicy가 적절히 설정되어 불필요한 리소스 유지가 발생하지 않는가
