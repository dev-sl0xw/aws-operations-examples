# 섹션16: CI/CD & DevOps (CI/CD & DevOps)
> Well-Architected Pillars: Operational Excellence, Reliability
> Day: 4 | 난이도: 중급~상급

## 개요

CI/CD (Continuous Integration / Continuous Delivery)는 소프트웨어의 변경을 자동으로 안전하게 프로덕션 환경에 전달하기 위한 일련의 프랙티스와 도구 체인이다. AWS는 이 파이프라인 전체를 매니지드 서비스로 제공하고 있으며, CodeCommit (소스 리포지토리), CodeBuild (빌드·테스트), CodeDeploy (디플로이), CodePipeline (오케스트레이션)을 중심으로 CodeArtifact (패키지 관리)를 추가한 Developer Tools 스위트로 구성된다.

CI/CD의 근본적인 가치는 「피드백 루프의 단축」과 「릴리스 리스크의 저감」에 있다. 코드 변경이 작고 빈번할수록 각 릴리스의 리스크는 작아진다. 자동 테스트로 품질이 보증되고, 자동 디플로이로 휴먼 에러가 배제된다. 이는 Well-Architected Framework의 Operational Excellence (운영 우수성) 원칙의 핵심 -- 「운영의 코드화」와 「작은 변경을 빈번하게 릴리스」에 직결된다.

또한 Reliability (신뢰성) 원칙에서도 Blue/Green 디플로이먼트나 Canary 디플로이먼트 등의 전략적 디플로이 방식을 통해 장애의 영향 범위를 최소화하고, 문제 발생 시 신속한 롤백을 가능하게 한다. 멀티 계정·멀티 리전 파이프라인 구성은 기업의 거버넌스 요건을 충족하면서 안전하고 신속한 릴리스 사이클을 실현한다.

## 핵심 개념

### CI/CD의 기초

**정의:** CI (Continuous Integration)는 개발자가 빈번하게 코드를 메인 브랜치에 머지하고, 자동 빌드와 자동 테스트를 실행하는 프랙티스. CD (Continuous Delivery)는 CI에 더하여 자동으로 스테이징 환경에 디플로이하고, 원클릭으로 프로덕션 릴리스가 가능한 상태를 유지하는 프랙티스. Continuous Deployment는 더 나아가 테스트를 통과한 모든 변경을 자동으로 프로덕션에 디플로이한다.

**CI/CD 파이프라인 스테이지:**

```
Source → Build → Test → Deploy (Staging) → Approval → Deploy (Production)
  │        │       │         │                │              │
  │        │       │         │                │              └── CodeDeploy
  │        │       │         │                └── Manual/SNS 알림
  │        │       │         └── CodeDeploy (Staging 환경)
  │        │       └── CodeBuild (유닛 테스트, 통합 테스트)
  │        └── CodeBuild (컴파일, 패키징)
  └── CodeCommit / GitHub / S3
```

**Continuous Delivery vs Continuous Deployment:**

| 관점 | Continuous Delivery | Continuous Deployment |
|------|--------------------|-----------------------|
| 프로덕션 디플로이 | 수동 승인이 필요 | 완전 자동 |
| 리스크 | 낮음 (사람의 판단을 개입) | 매우 낮음 (테스트 품질에 의존) |
| 릴리스 빈도 | 높음 (임의의 타이밍) | 매우 높음 (커밋마다) |
| 전제 조건 | 기본적인 자동 테스트 | 포괄적인 자동 테스트 + 모니터링 |
| AWS 구현 | CodePipeline + Manual Approval | CodePipeline (승인 스테이지 없음) |

**소크라테스식 심화:**
> Q: "왜 수동 디플로이가 아닌 CI/CD 파이프라인이 필요한가?"
> A: 수동 디플로이의 문제는 3가지이다. (1) 휴먼 에러 -- 절차 누락, 설정 실수, 파일 배치 누락. (2) 일관성 부재 -- 사람에 따라 절차가 미묘하게 다름. (3) 확장성의 한계 -- 하루 10회 릴리스하고 싶은 경우 수동으로는 불가능. CI/CD는 이 모든 것을 코드로 정의하고, 매번 동일한 프로세스를 확실하게 실행한다.
> Q: "Continuous Delivery와 Continuous Deployment 중 어느 쪽을 선택해야 하는가?"
> A: 대부분의 조직에서는 Continuous Delivery부터 시작해야 한다. 프로덕션 디플로이 전의 수동 승인 단계는 비즈니스 판단(릴리스 타이밍, 마케팅 연동 등)을 반영할 여지를 남긴다. Continuous Deployment는 자동 테스트 커버리지가 충분히 높고, 모니터링과 자동 롤백이 정비된 성숙한 조직에 적합하다.

**현실 세계의 비유 (비IT 대상):**
> "자동차 공장의 조립 라인. 부품(코드)이 공장에 도착할 때마다 품질 검사(테스트) → 조립(빌드) → 시운전(스테이징) → 출하 승인(수동 승인) → 딜러에 배송(프로덕션 디플로이). Continuous Delivery는 출하 승인에 공장장의 서명이 필요. Continuous Deployment는 품질 검사를 통과하면 자동으로 배송됨. 어느 쪽을 선택할지는 품질 관리 체제의 성숙도에 따름"

---

### AWS CodeCommit

**정의:** CodeCommit은 AWS가 제공하는 완전 매니지드 Git 리포지토리 서비스. IAM 기반 액세스 제어, 저장 시 암호화 (AES-256), 전송 시 암호화 (HTTPS/SSH)를 갖추고 있다. 리포지토리 크기에 제한이 없으며 (개별 파일은 최대 2GB), 고가용성으로 운영된다.

> **참고:** 2024년 이후 CodeCommit은 신규 고객에 대한 제공이 중단되었다 (기존 고객은 계속 이용 가능). 다만 SAA 시험 범위에는 포함되므로 개념 이해가 필요하다.

**주요 기능:**

| 기능 | 설명 |
|------|------|
| **IAM 인증** | Git 인증 정보 (HTTPS) 또는 SSH 키 (IAM 사용자에 연결) |
| **암호화** | 저장 시: AWS KMS (자동), 전송 시: HTTPS/SSH |
| **트리거** | SNS 알림, Lambda 함수를 브랜치 이벤트로 기동 |
| **알림** | CloudWatch Events/EventBridge 연계로 PR 생성, 코멘트 등을 알림 |
| **크로스 계정** | IAM 역할 인수에 의한 크로스 계정 액세스 |
| **Pull Request** | 코드 리뷰, 승인 규칙, 머지 전 체크 |

**CodeCommit vs GitHub vs Bitbucket:**

| 관점 | CodeCommit | GitHub | Bitbucket |
|------|-----------|--------|-----------|
| 인증 방식 | IAM (AWS 통합) | OAuth/PAT | OAuth/PAT |
| 암호화 | KMS 자동 암호화 | 표준 암호화 | 표준 암호화 |
| AWS 통합 | 네이티브 통합 | CodeStar 접속 | CodeStar 접속 |
| CI/CD 연계 | CodePipeline 직접 연계 | CodeStar 접속 경유 | CodeStar 접속 경유 |

**소크라테스식 심화:**
> Q: "CodeCommit이 비권장이 된 지금 왜 배워야 하는가?"
> A: (1) SAA 시험 범위에 아직 포함되어 있다. (2) 기존 AWS 환경에서 널리 사용되고 있다. (3) IAM 기반 액세스 제어와 AWS 네이티브 통합의 개념은 GitHub 등의 서드파티 리포지토리를 CodePipeline에서 사용하는 경우에도 이해가 필요하다. CodeStar Connections 개념을 이해하기 위한 전제 지식이 된다.

---

### AWS CodeBuild

**정의:** CodeBuild는 소스 코드의 컴파일, 테스트 실행, 디플로이 가능한 아티팩트 생성을 수행하는 완전 매니지드 빌드 서비스. 빌드 환경의 프로비저닝, 스케일링, 패치 적용을 AWS가 관리하므로 빌드 서버 운영이 불필요.

**buildspec.yml 페이즈:**

```yaml
version: 0.2

env:
  variables:
    JAVA_HOME: "/usr/lib/jvm/java-11"
  parameter-store:
    DB_PASSWORD: "/app/prod/db/password"    # SSM Parameter Store에서 취득
  secrets-manager:
    API_KEY: "prod/api-key:api_key"          # Secrets Manager에서 취득

phases:
  install:
    runtime-versions:
      nodejs: 18
    commands:
      - npm install                          # 의존 패키지 설치

  pre_build:
    commands:
      - echo "Running unit tests..."
      - npm test                             # 테스트 실행
      - echo "Logging in to ECR..."
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI

  build:
    commands:
      - echo "Building application..."
      - npm run build                        # 애플리케이션 빌드
      - docker build -t $ECR_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION .

  post_build:
    commands:
      - echo "Pushing Docker image..."
      - docker push $ECR_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - echo "Writing image definitions file..."
      - printf '[{"name":"app","imageUri":"%s"}]' $ECR_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
    - appspec.yml
    - taskdef.json

cache:
  paths:
    - '/root/.npm/**/*'                      # npm 캐시
    - 'node_modules/**/*'                    # node_modules 캐시

reports:
  jest-reports:
    files:
      - 'junit.xml'
    file-format: 'JUNITXML'
```

**빌드 페이즈 상세:**

| 페이즈 | 실행 타이밍 | 용도 |
|---------|-------------|------|
| **install** | 빌드 환경 셋업 후 | 런타임 설치, 의존 패키지 취득 |
| **pre_build** | 빌드 전 | 테스트 실행, Docker 레지스트리 로그인, 변수 설정 |
| **build** | 메인 빌드 | 컴파일, Docker 이미지 빌드 |
| **post_build** | 빌드 후 | 아티팩트 푸시, 알림, 클린업 |

**빌드 환경:**

| 컴퓨트 타입 | 메모리 | vCPU | 용도 |
|------------------|--------|------|------|
| BUILD_GENERAL1_SMALL | 3 GB | 2 | 소규모 빌드 |
| BUILD_GENERAL1_MEDIUM | 7 GB | 4 | 중규모 빌드 |
| BUILD_GENERAL1_LARGE | 15 GB | 8 | 대규모 빌드, Docker |
| BUILD_GENERAL1_2XLARGE | 145 GB | 72 | 초대규모 빌드 |

**캐시 전략:**

| 캐시 타입 | 설명 | 권장 장면 |
|---------------|------|---------|
| **S3 캐시** | S3 버킷에 캐시를 보존 | 복수 빌드 프로젝트에서 공유 |
| **로컬 캐시** | 빌드 호스트 상에 보존 | 동일 빌드 프로젝트의 고속화 |

**소크라테스식 심화:**
> Q: "왜 Jenkins 같은 셀프 호스트 빌드 서버가 아닌 CodeBuild를 사용하는가?"
> A: Jenkins의 운영 부하는 상상 이상으로 크다. (1) 서버 유지 관리 (패치, 스케일링, 장애 대응). (2) 플러그인 호환성 문제. (3) 빌드 큐 관리. CodeBuild는 「빌드가 필요한 시점에만 리소스가 기동되고, 사용한 만큼만 과금되는」 서버리스 모델이다. 빌드가 동시에 100개 들어와도 자동 스케일한다.
> Q: "buildspec.yml의 env 섹션에서 Parameter Store나 Secrets Manager에서 값을 취득할 수 있는 것은 왜 중요한가?"
> A: 빌드 프로세스에는 종종 비밀 정보가 필요하다 (Docker 레지스트리 패스워드, API 키, 데이터베이스 접속 정보 등). 이를 소스 코드에 포함시키는 것은 보안상 중대한 리스크이다. buildspec.yml에서 직접 Parameter Store / Secrets Manager를 참조함으로써 비밀 정보를 코드에서 분리하고, IAM 정책으로 취득 권한을 제어할 수 있다.

**현실 세계의 비유 (비IT 대상):**
> "렌탈 키친 (CodeBuild). 요리 (빌드)가 필요한 때만 키친을 빌려서 사용한 시간만큼만 지불한다. 식재료 목록 (buildspec.yml)을 넘기면 프로 셰프 (빌드 환경)가 절차대로 조리하여 완성품 (아티팩트)을 돌려준다. 자체 키친을 소유하는 것 (Jenkins)보다 훨씬 효율적"

---

### AWS CodeDeploy

**정의:** CodeDeploy는 EC2 인스턴스, 온프레미스 서버, Lambda 함수, ECS 서비스에 대한 애플리케이션 디플로이를 자동화하는 서비스. appspec.yml로 디플로이 절차를 정의하고, 복수의 디플로이 전략을 지원한다.

**디플로이 타입 비교:**

| 디플로이 타입 | EC2/온프레미스 | Lambda | ECS |
|-------------|----------------|--------|-----|
| **In-place** | 지원 | 미지원 | 미지원 |
| **Blue/Green** | 지원 (ASG) | 지원 (Alias) | 지원 (Task Set) |
| **Canary** | 미지원 | 지원 | 지원 |
| **Linear** | 미지원 | 지원 | 지원 |
| **All-at-once** | 지원 | 지원 | 지원 |

**EC2/온프레미스 대상 디플로이:**

In-place 디플로이:
```
기존 인스턴스 그룹: [A] [B] [C] [D]
                     ↓ 디플로이 (1대씩 or 일괄)
Step 1: [A 중지] → 앱 업데이트 → [A 기동]  [B] [C] [D] (가동 중)
Step 2: [A] [B 중지] → 앱 업데이트 → [B 기동]  [C] [D] (가동 중)
Step 3: ... (반복)
```

Blue/Green 디플로이 (ASG):
```
Blue 환경 (현재):  ASG-Blue  → [A] [B] [C] [D] ← ALB의 타겟
                                                     │
Green 환경 (신규): ASG-Green → [A'] [B'] [C'] [D']   │
                                  ↑                    │
                                  ├── 새 버전 디플로이   │
                                  └── 헬스 체크 통과 후, ALB 방향 전환
                                                     ↓
Blue 환경:         ASG-Blue  → [A] [B] [C] [D]  (트래픽 없음 → 이후 종료)
Green 환경:        ASG-Green → [A'] [B'] [C'] [D'] ← ALB의 타겟
```

**Lambda 대상 디플로이 (트래픽 시프팅):**

| 디플로이 프리퍼런스 | 동작 |
|---------------------|------|
| **Canary10Percent5Minutes** | 처음에 10%의 트래픽을 새 버전에 전송, 5분 후 100% |
| **Canary10Percent10Minutes** | 처음에 10%, 10분 후 100% |
| **Canary10Percent15Minutes** | 처음에 10%, 15분 후 100% |
| **Canary10Percent30Minutes** | 처음에 10%, 30분 후 100% |
| **Linear10PercentEvery1Minute** | 1분마다 10%씩 새 버전으로 이행 |
| **Linear10PercentEvery2Minutes** | 2분마다 10%씩 새 버전으로 이행 |
| **Linear10PercentEvery3Minutes** | 3분마다 10%씩 새 버전으로 이행 |
| **Linear10PercentEvery10Minutes** | 10분마다 10%씩 새 버전으로 이행 |
| **AllAtOnce** | 즉시 모든 트래픽을 새 버전으로 전환 |

**ECS Blue/Green 디플로이:**
```
ECS Service
  ├── Task Set (Blue - 현행)  ← Production Listener (포트 80)
  └── Task Set (Green - 신규) ← Test Listener (포트 8080)
                                    │
                                    ├── 테스트 후, 트래픽 전환
                                    ↓
  ├── Task Set (Blue - 구)   ← 대기 (롤백용) → 이후 삭제
  └── Task Set (Green - 신규) ← Production Listener (포트 80)
```

**appspec.yml (EC2/온프레미스):**

```yaml
version: 0.0
os: linux
files:
  - source: /                      # 소스로부터의 파일
    destination: /var/www/html     # 디플로이 대상

hooks:
  BeforeInstall:
    - location: scripts/before_install.sh
      timeout: 300
      runas: root
  AfterInstall:
    - location: scripts/after_install.sh
      timeout: 300
      runas: root
  ApplicationStart:
    - location: scripts/start_server.sh
      timeout: 300
      runas: root
  ValidateService:
    - location: scripts/validate_service.sh
      timeout: 300
      runas: root
```

**EC2 디플로이의 라이프사이클 이벤트 순서:**

```
ApplicationStop          # 현행 애플리케이션 중지
  ↓
DownloadBundle           # S3/GitHub에서 번들 다운로드 (자동)
  ↓
BeforeInstall            # 설치 전 처리 (로그 백업, 구 파일 삭제 등)
  ↓
Install                  # 파일 복사 (자동)
  ↓
AfterInstall             # 설치 후 처리 (권한 설정, 설정 파일 변경 등)
  ↓
ApplicationStart         # 애플리케이션 기동
  ↓
ValidateService          # 헬스 체크, 동작 확인
```

**appspec.yml (Lambda):**

```yaml
version: 0.0
Resources:
  - MyFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: "my-function"
        Alias: "live"
        CurrentVersion: "1"
        TargetVersion: "2"
Hooks:
  - BeforeAllowTraffic: "LambdaFunctionToValidate"
  - AfterAllowTraffic: "LambdaFunctionToValidate"
```

**소크라테스식 심화:**
> Q: "In-place 디플로이와 Blue/Green 디플로이 중 어느 쪽을 선택해야 하는가?"
> A: 트레이드오프가 있다. In-place는 기존 인스턴스를 업데이트하므로 비용 효율이 높지만 디플로이 중 캐퍼시티 저하와 롤백 시간이 길다 (재디플로이가 필요). Blue/Green은 새 환경을 병렬로 기동하므로 제로 다운타임에 즉시 롤백이 가능하지만, 일시적으로 2배의 리소스 비용이 든다. 프로덕션 환경에서는 Blue/Green, 개발 환경에서는 In-place가 일반적인 선택이다.
> Q: "Canary와 Linear의 차이는 무엇인가?"
> A: 둘 다 단계적 트래픽 이행이지만 패턴이 다르다. Canary는 「소량의 트래픽으로 검증한 후 한꺼번에 전량을 이행」하는 2단계 방식. Linear는 「일정 간격으로 일정 비율씩 이행」하는 점진적 방식. Canary는 빠른 검증에 적합하고, Linear는 신중하고 예측 가능한 이행에 적합하다.

**현실 세계의 비유 (비IT 대상):**
> "레스토랑 메뉴 리뉴얼. In-place 디플로이는 영업하면서 1개씩 메뉴를 교체하는 것 -- 손님은 한정된 품목으로 참는 시간이 있다. Blue/Green은 옆에 새 레스토랑을 열어 전체 메뉴를 준비하고, 준비 완료 후 손님을 새 점포로 안내하는 것 -- 문제가 있으면 바로 돌아갈 수 있도록 구 점포를 남겨둔다. Canary는 새 메뉴를 먼저 단골손님 10명에게 시식시키고, 호평이면 전원에게 제공하는 것"

---

### AWS CodePipeline

**정의:** CodePipeline은 소프트웨어 릴리스 프로세스를 모델링·자동화·가시화하는 완전 매니지드 CI/CD 오케스트레이션 서비스. 복수의 스테이지와 액션을 조합하여 소스 취득부터 프로덕션 디플로이까지의 파이프라인 전체를 정의한다.

**파이프라인 구조:**

```
Pipeline
  ├── Stage 1: Source
  │     └── Action: CodeCommit / GitHub / S3
  │                  ↓ (Output Artifact → S3 버킷에 보존)
  ├── Stage 2: Build
  │     └── Action: CodeBuild
  │                  ↓ (Output Artifact)
  ├── Stage 3: Test
  │     └── Action: CodeBuild (테스트 실행)
  │                  ↓
  ├── Stage 4: Staging
  │     └── Action: CodeDeploy (스테이징 환경)
  │                  ↓
  ├── Stage 5: Approval
  │     └── Action: Manual Approval (SNS 알림 → 승인자에게 메일)
  │                  ↓
  └── Stage 6: Production
        └── Action: CodeDeploy (프로덕션 환경)
```

**액션 타입:**

| 카테고리 | 액션 | 설명 |
|---------|----------|------|
| **Source** | CodeCommit, GitHub, S3, ECR | 소스 코드 취득 |
| **Build** | CodeBuild, Jenkins | 빌드·테스트 |
| **Test** | CodeBuild, DeviceFarm | 테스트 실행 |
| **Deploy** | CodeDeploy, CloudFormation, ECS, S3, Elastic Beanstalk | 디플로이 |
| **Approval** | Manual Approval | 수동 승인 (SNS 알림) |
| **Invoke** | Lambda, Step Functions | 커스텀 액션 |

**아티팩트 스토리지:**

CodePipeline은 각 스테이지 간의 아티팩트 전달에 S3 버킷을 사용한다. 파이프라인 생성 시 아티팩트 스토어용 S3 버킷이 자동으로 생성된다 (또는 커스텀 버킷을 지정 가능). 아티팩트는 AES-256 또는 KMS로 암호화된다.

```
Stage 1 (Source) → Output Artifact → [S3 아티팩트 버킷]
                                              ↓
Stage 2 (Build) ← Input Artifact  ← [S3 아티팩트 버킷]
                → Output Artifact → [S3 아티팩트 버킷]
                                              ↓
Stage 3 (Deploy) ← Input Artifact ← [S3 아티팩트 버킷]
```

**수동 승인 액션:**

```
파이프라인 실행 중
  ↓
Manual Approval 스테이지에 도달
  ↓
SNS 알림 → 승인자에게 메일/Slack 알림
  ↓
승인자가 AWS 콘솔/CLI에서 승인 or 거부
  ├── 승인 → 다음 스테이지로 진행
  └── 거부 → 파이프라인 중지
```

**크로스 리전 액션:**

CodePipeline은 크로스 리전의 디플로이 액션을 지원한다. 파이프라인은 1개 리전에 생성하고, 디플로이 액션을 다른 리전에서 실행할 수 있다. 각 리전에 아티팩트 버킷이 필요하다.

**크로스 계정 파이프라인:**

```
도구 계정 (파이프라인 소유)
  └── CodePipeline
        ├── Source: 도구 계정의 CodeCommit
        ├── Build: 도구 계정의 CodeBuild
        ├── Deploy to Dev: 개발 계정의 CodeDeploy
        │     └── IAM 역할 인수 (AssumeRole)
        ├── Approval: 수동 승인
        └── Deploy to Prod: 프로덕션 계정의 CodeDeploy
              └── IAM 역할 인수 (AssumeRole)
```

크로스 계정 디플로이에는 다음이 필요:
1. 타겟 계정에 CodeDeploy용 IAM 역할을 생성
2. 도구 계정의 파이프라인 역할에 AssumeRole 권한을 부여
3. S3 아티팩트 버킷 정책에서 크로스 계정 액세스를 허가
4. KMS 키 정책에서 크로스 계정 복호화를 허가

**소크라테스식 심화:**
> Q: "CodePipeline의 아티팩트는 왜 S3에 보존되는가?"
> A: 스테이지 간에 아티팩트를 전달하기 위한 불변의 스토리지가 필요하기 때문이다. S3는 고가용성·고내구성 (99.999999999%)으로 버전 관리도 가능하며, KMS 암호화도 네이티브로 지원한다. 각 스테이지는 독립적으로 실행되고, 실패해도 입력 아티팩트는 S3에 보존되므로 재실행 시 이전 스테이지를 다시 실행할 필요가 없다.
> Q: "왜 멀티 계정 파이프라인이 권장되는가?"
> A: 프로덕션 환경을 별도 계정에 격리하는 것은 Well-Architected의 베스트 프랙티스이다. (1) 개발자가 실수로 프로덕션 환경을 변경하는 리스크를 배제. (2) IAM의 경계가 명확해진다. (3) AWS 서비스 쿼터가 계정 간에 독립적이다. (4) 비용 배분이 명확해진다. 파이프라인만이 AssumeRole로 프로덕션 계정에 액세스할 수 있으므로 통제된 릴리스 프로세스가 보장된다.

**현실 세계의 비유 (비IT 대상):**
> "공장의 조립 라인 (CodePipeline). 원재료 수령 (Source) → 부품 가공 (Build) → 품질 검사 (Test) → 시제품 확인 (Staging) → 공장장의 출하 승인 (Manual Approval) → 출하 (Production Deploy). 각 공정의 중간품은 창고 (S3)에 보관되어 어떤 공정에서든 재개 가능. 크로스 계정은 복수 공장 간의 연계 -- 시제 공장에서 만들고, 양산 공장에서 양산한다"

---

### AWS CodeArtifact

**정의:** CodeArtifact는 소프트웨어 패키지를 안전하게 저장·공개·공유하기 위한 완전 매니지드 아티팩트 리포지토리 서비스. npm, pip, Maven, NuGet, Swift, Cargo 등의 주요 패키지 매니저에 대응한다.

**아키텍처:**

```
외부 리포지토리 (npmjs.com, PyPI)
  ↑ 업스트림 접속
  │
CodeArtifact 도메인
  ├── 리포지토리 A (프로덕션용)
  │     ├── 패키지 A v1.0
  │     ├── 패키지 B v2.3
  │     └── 업스트림: 외부 리포지토리
  └── 리포지토리 B (개발용)
        ├── 패키지 A v1.1-beta
        └── 업스트림: 리포지토리 A + 외부 리포지토리
```

**주요 개념:**

| 개념 | 설명 |
|------|------|
| **도메인** | 복수 리포지토리의 관리 단위. 정책 적용 범위 |
| **리포지토리** | 패키지 격납 장소 |
| **업스트림** | 패키지를 찾을 수 없는 경우 폴백하는 상위 리포지토리 |
| **도메인 정책** | 크로스 계정 액세스 제어 |

**CodeBuild와의 통합:**

```yaml
# buildspec.yml
phases:
  pre_build:
    commands:
      - aws codeartifact login --tool npm --domain my-domain --repository my-repo
      - npm install    # CodeArtifact에서 패키지를 설치
  post_build:
    commands:
      - npm publish    # 빌드 성과물을 CodeArtifact에 퍼블리시
```

**소크라테스식 심화:**
> Q: "왜 공개 리포지토리 (npmjs.com)를 직접 사용하지 않고 CodeArtifact를 중간에 두는가?"
> A: 3가지 이유가 있다. (1) 보안 -- 공개 리포지토리에 대한 의존은 공급망 공격의 리스크가 있다. CodeArtifact에서 패키지를 검사·캐시하여 리스크를 경감. (2) 가용성 -- 공개 리포지토리가 다운되어도 캐시에서 빌드를 계속할 수 있다. (3) 거버넌스 -- 승인된 패키지만 개발자가 이용할 수 있도록 제어할 수 있다.

---

### 디플로이 전략 상세 비교

**전체 디플로이 전략 비교:**

| 전략 | 다운타임 | 롤백 | 비용 | 리스크 | 적용 장면 |
|------|-----------|-----------|--------|-------|---------|
| **All-at-once** | 있음 | 재디플로이 (느림) | 저 | 고 | 개발 환경 |
| **Rolling** | 최소한 | 재디플로이 (느림) | 저 | 중 | 비크리티컬 서비스 |
| **Rolling with additional batch** | 없음 | 재디플로이 (느림) | 중 | 중 | 캐퍼시티 유지가 필요 |
| **Immutable** | 없음 | 구 환경 복원 | 고 | 저 | 확실성이 필요한 경우 |
| **Blue/Green** | 없음 | 라우팅 전환 (즉시) | 고 | 최저 | 프로덕션 환경 권장 |
| **Canary** | 없음 | 라우팅 전환 (즉시) | 중 | 저 | 신중한 프로덕션 릴리스 |
| **Linear** | 없음 | 라우팅 전환 (즉시) | 중 | 저 | 단계적 프로덕션 릴리스 |

**각 전략의 동작 이미지:**

```
All-at-once:
  [v1][v1][v1][v1] → [v2][v2][v2][v2]  (일괄 업데이트)

Rolling:
  [v1][v1][v1][v1]
  [v2][v1][v1][v1]  (1대씩 업데이트)
  [v2][v2][v1][v1]
  [v2][v2][v2][v1]
  [v2][v2][v2][v2]

Rolling with additional batch:
  [v1][v1][v1][v1]
  [v1][v1][v1][v1][v2]  (추가 배치로 새 버전 기동)
  [v2][v1][v1][v1][v2]  (구 버전을 1대씩 업데이트)
  ...
  [v2][v2][v2][v2]      (추가 배치 삭제)

Immutable:
  [v1][v1][v1][v1]  (기존 ASG)
  [v1][v1][v1][v1] + [v2][v2][v2][v2]  (새 ASG에서 v2 기동)
  헬스 체크 통과 후, 구 ASG 삭제
  [v2][v2][v2][v2]

Blue/Green:
  Blue: [v1][v1][v1][v1] ← ALB
  Green: [v2][v2][v2][v2]
  ALB의 타겟 그룹을 전환
  Blue: [v1][v1][v1][v1]  (대기/삭제)
  Green: [v2][v2][v2][v2] ← ALB

Canary:
  시각 0:   v1: 100%, v2: 0%
  시각 T:   v1: 90%,  v2: 10%  (카나리 테스트)
  시각 T+N: v1: 0%,   v2: 100% (전량 전환)

Linear:
  시각 0:   v1: 100%, v2: 0%
  시각 T:   v1: 90%,  v2: 10%
  시각 2T:  v1: 80%,  v2: 20%
  ...
  시각 10T: v1: 0%,   v2: 100%
```

**Blue/Green with ALB 상세:**

```
ALB
  ├── Listener Rule (포트 80)
  │     └── Forward to Target Group Blue (Weight: 100)
  │
  ├── Target Group Blue (Blue 환경)
  │     ├── Instance A (v1)
  │     ├── Instance B (v1)
  │     └── Instance C (v1)
  │
  └── Target Group Green (Green 환경)
        ├── Instance D (v2)
        ├── Instance E (v2)
        └── Instance F (v2)

전환 후:
ALB
  └── Listener Rule (포트 80)
        └── Forward to Target Group Green (Weight: 100)
```

---

### Infrastructure as Code와 CI/CD

**CDK Pipelines (셀프 뮤테이팅 파이프라인):**

CDK Pipelines는 CDK 애플리케이션 자체의 디플로이 파이프라인을 CDK 코드로 정의하는 기능. 파이프라인 자체의 변경도 자동으로 디플로이되는 「셀프 뮤테이팅 (자기 변이)」의 특성을 가진다.

```
CDK Pipeline의 동작 흐름:
  Source (CodeCommit/GitHub)
    ↓
  Synth (cdk synth → CloudFormation 템플릿 생성)
    ↓
  Self-Mutate (파이프라인 자체를 업데이트)
    ↓
  Assets (Docker 이미지, Lambda 코드 등을 S3/ECR에 업로드)
    ↓
  Deploy-Dev (개발 환경에 Stack 디플로이)
    ↓
  Deploy-Staging + 테스트
    ↓
  Manual Approval
    ↓
  Deploy-Production
```

**CloudFormation StackSets with CI/CD:**

```
CodePipeline
  ├── Source: CDK/CloudFormation 템플릿
  ├── Build: cdk synth / cfn-lint (템플릿 검증)
  └── Deploy: StackSets
        ├── OU: ProductionOU
        │     ├── 계정 A (us-east-1)
        │     ├── 계정 B (eu-west-1)
        │     └── 계정 C (ap-northeast-1)
        └── 설정:
              ├── MaxConcurrentCount: 1  (1 계정씩)
              └── FailureToleranceCount: 0  (0건이라도 실패 시 중지)
```

**소크라테스식 심화:**
> Q: "CDK Pipelines의 셀프 뮤테이팅이란 무엇인가?"
> A: 일반적인 파이프라인은 「애플리케이션의 디플로이」를 자동화하지만, 파이프라인 자체의 변경은 수동으로 해야 한다. CDK Pipelines에서는 파이프라인 코드 변경을 푸시하면, 파이프라인이 자기 자신을 업데이트한 후 새로운 파이프라인 정의로 애플리케이션을 디플로이한다. 이로써 「파이프라인의 코드 = 파이프라인의 실체」가 항상 일치한다 -- Infrastructure as Code의 궁극적 형태이다.

---

### 롤백 전략

**CodeDeploy의 자동 롤백:**

| 트리거 조건 | 설명 |
|------------|------|
| **디플로이 실패** | 디플로이의 임의 페이즈에서 실패한 경우 |
| **CloudWatch 알람** | 지정한 알람이 ALARM 상태가 된 경우 |
| **수동** | 콘솔/CLI에서 수동으로 롤백 |

```
CodeDeploy 롤백 설정:
  AutoRollback:
    Enabled: true
    Events:
      - DEPLOYMENT_FAILURE         # 디플로이 실패 시
      - DEPLOYMENT_STOP_ON_ALARM   # CloudWatch 알람 발화 시

  CloudWatch Alarms:
    - ErrorRate5xxAlarm           # 5xx 에러율 알람
    - LatencyP99Alarm             # P99 레이턴시 알람
    - UnhealthyHostAlarm          # Unhealthy 호스트 수 알람
```

**CloudFormation 롤백 트리거:**

```yaml
# CloudFormation Stack 업데이트 시의 롤백 설정
aws cloudformation update-stack \
  --stack-name my-stack \
  --template-body file://template.yaml \
  --rollback-configuration \
    RollbackTriggers:
      - Arn: arn:aws:cloudwatch:region:account:alarm:ErrorRateAlarm
        Type: AWS::CloudWatch::Alarm
    MonitoringTimeInMinutes: 10   # 디플로이 후 10분간 감시
```

**데이터베이스 마이그레이션의 롤백 전략:**

| 전략 | 장점 | 단점 |
|------|---------|----------|
| **Forward-compatible migrations** | 롤백 불필요 | 설계가 복잡 |
| **Reversible migrations (up/down)** | 명시적 되돌리기 | 데이터 손실 리스크 |
| **Feature flags** | 코드 레벨에서 전환 | 복잡성 증가 |
| **Database snapshots** | 확실한 복원 | 복원 시간이 길다 |

**소크라테스식 심화:**
> Q: "롤백은 왜 사전에 계획해 두어야 하는가?"
> A: 장애 발생 시에는 패닉 상태에 빠지기 쉬우며, 그 자리에서 올바른 롤백 절차를 생각해 내기 어렵다. 사전에 롤백 계획을 정의하고 자동화해 둠으로써 (1) MTTR (평균 복구 시간)을 최소화, (2) 인위적 실수에 의한 2차 장애를 방지, (3) 디플로이의 심리적 허들을 낮추어 릴리스 빈도를 높일 수 있다.

**현실 세계의 비유 (비IT 대상):**
> "비행기의 비상 탈출 절차. 이륙 전에 반드시 설명하고, 정기적으로 훈련한다. 실제로 비상 사태가 발생한 후에 절차를 생각하는 것은 늦다. 롤백 계획도 마찬가지 -- 디플로이 전에 '문제가 생기면 이렇게 되돌린다'를 정의하고, 자동화해 두는 것으로 냉정하고 신속하게 대처할 수 있다"

---

### CI/CD에서의 모니터링과 옵저버빌리티

**파이프라인 모니터링:**

| 메트릭스 | 서비스 | 의미 |
|----------|---------|------|
| **Pipeline execution time** | CodePipeline | 파이프라인 전체 실행 시간 |
| **Stage execution time** | CodePipeline | 각 스테이지 실행 시간 |
| **Action execution status** | CodePipeline | 액션의 성공/실패 |
| **Build duration** | CodeBuild | 빌드 소요 시간 |
| **Build success rate** | CodeBuild | 빌드 성공률 |
| **Failed builds** | CodeBuild | 빌드 실패 수 |
| **Deployment success rate** | CodeDeploy | 디플로이 성공률 |
| **Deployment duration** | CodeDeploy | 디플로이 소요 시간 |

**EventBridge에 의한 파이프라인 이벤트 감지:**

```json
{
  "source": ["aws.codepipeline"],
  "detail-type": ["CodePipeline Pipeline Execution State Change"],
  "detail": {
    "state": ["FAILED"]
  }
}
```

이 규칙으로 CodePipeline의 파이프라인 실패를 감지하고, SNS → Slack/Email로 알림.

**디플로이 후 애플리케이션 모니터링:**

```
디플로이 완료
  ↓
CloudWatch 메트릭스 감시 (Bake Time: 5-30분)
  ├── Error Rate (5xx 에러율)
  ├── Latency (P50, P99)
  ├── Request Count
  └── Custom Business Metrics
  ↓
알람 발화?
  ├── Yes → 자동 롤백 (CodeDeploy)
  └── No → 디플로이 성공 확정
```

**소크라테스식 심화:**
> Q: "왜 디플로이 후 감시 기간 (Bake Time)이 필요한가?"
> A: 모든 버그가 즉시 드러나는 것은 아니다. (1) 메모리 릭은 서서히 메모리를 소비하여 수 시간 후에 크래시한다. (2) 특정 시간대나 특정 요청 패턴에서만 발생하는 버그가 있다. (3) 캐시가 전환될 때까지 구 버전의 동작이 남는다. Bake Time을 두어 메트릭스를 감시함으로써 이러한 지연형 장애를 감지할 수 있다.

---

## 아키텍처 패턴

### 패턴1: 풀 CodePipeline (EC2)

```
CodeCommit (소스 리포지토리)
  ↓ 푸시 이벤트 (EventBridge)
CodePipeline
  ├── Source: CodeCommit
  ├── Build: CodeBuild
  │     ├── npm install
  │     ├── npm test
  │     ├── npm run build
  │     └── Output: 아티팩트 (S3)
  ├── Deploy-Staging: CodeDeploy (In-place)
  │     └── EC2 Auto Scaling Group (Staging)
  ├── Approval: Manual Approval (SNS → 메일)
  └── Deploy-Production: CodeDeploy (Blue/Green)
        ├── EC2 Auto Scaling Group (Blue)
        ├── EC2 Auto Scaling Group (Green)
        └── Application Load Balancer
```

### 패턴2: 컨테이너 CI/CD (ECS Blue/Green)

```
GitHub (소스 리포지토리)
  ↓ CodeStar Connection
CodePipeline
  ├── Source: GitHub (via CodeStar Connection)
  ├── Build: CodeBuild
  │     ├── Docker 빌드
  │     ├── ECR에 푸시
  │     └── Output: imagedefinitions.json, appspec.yaml, taskdef.json
  └── Deploy: CodeDeploy (ECS Blue/Green)
        ├── ECS Service
        │     ├── Task Set (Blue) ← Production Listener (80)
        │     └── Task Set (Green) ← Test Listener (8080)
        └── Application Load Balancer
              ├── Production Listener (포트 80)
              └── Test Listener (포트 8080)
```

### 패턴3: 서버리스 CI/CD

```
CodeCommit (소스 리포지토리)
  ↓
CodePipeline
  ├── Source: CodeCommit
  ├── Build: CodeBuild
  │     ├── sam build / cdk synth
  │     ├── 테스트 실행
  │     └── Output: CloudFormation 템플릿
  ├── Deploy-Staging: CloudFormation (변경 세트)
  │     ├── Lambda 함수군
  │     ├── API Gateway
  │     └── DynamoDB 테이블
  ├── Test: CodeBuild (통합 테스트 실행)
  ├── Approval: Manual Approval
  └── Deploy-Production: CloudFormation (변경 세트)
        └── Lambda 디플로이 프리퍼런스: Canary10Percent5Minutes
```

### 패턴4: 멀티 계정 파이프라인

```
도구 계정 (Shared Services)
  └── CodePipeline
        ├── Source: CodeCommit
        ├── Build: CodeBuild
        │     └── cdk synth
        ├── Deploy-Dev (개발 계정)
        │     ├── AssumeRole → DevAccountDeployRole
        │     └── CloudFormation Stack
        ├── Integration Test (개발 계정)
        ├── Approval-Staging
        ├── Deploy-Staging (스테이징 계정)
        │     ├── AssumeRole → StagingAccountDeployRole
        │     └── CloudFormation Stack
        ├── Load Test (스테이징 계정)
        ├── Approval-Production
        └── Deploy-Production (프로덕션 계정)
              ├── AssumeRole → ProdAccountDeployRole
              └── CloudFormation Stack

IAM 신뢰 관계:
  DevAccount:     DevAccountDeployRole → Trust: ToolsAccount Pipeline Role
  StagingAccount: StagingAccountDeployRole → Trust: ToolsAccount Pipeline Role
  ProdAccount:    ProdAccountDeployRole → Trust: ToolsAccount Pipeline Role

S3 아티팩트 버킷:
  도구 계정: s3://pipeline-artifacts-tools
    BucketPolicy: 각 계정의 디플로이 역할로부터의 읽기를 허가
  KMS 키:
    KeyPolicy: 각 계정의 디플로이 역할로부터의 복호화를 허가
```

### 패턴5: CDK Pipelines (셀프 뮤테이팅)

```
GitHub (소스 리포지토리)
  ↓
CDK Pipeline (CodePipeline 기반)
  ├── Source: GitHub (via CodeStar Connection)
  ├── Synth: CodeBuild
  │     └── cdk synth → Cloud Assembly
  ├── UpdatePipeline (자기 변이)
  │     └── 파이프라인 정의에 변경이 있으면 자신을 업데이트
  ├── Assets
  │     └── Docker 이미지 / Lambda 코드 → S3 / ECR
  ├── Stage: Dev
  │     ├── DeployStack: AppStack (개발 환경)
  │     └── Post: 통합 테스트 (CodeBuild)
  ├── Stage: Staging
  │     ├── DeployStack: AppStack (스테이징 환경)
  │     └── Post: E2E 테스트 (CodeBuild)
  ├── ManualApproval
  └── Stage: Production
        └── DeployStack: AppStack (프로덕션 환경)

특징:
  - 파이프라인 코드 변경을 푸시 → 파이프라인이 자기 자신을 업데이트
  - 새로운 스테이지나 Stack 추가도 코드 변경만으로 자동 반영
  - cdk synth의 결과 (Cloud Assembly)를 기반으로 디플로이
```

## SAA 시험 포인트

| 토픽 | 출제 포인트 | 키워드 |
|---------|------------|-----------|
| **CodeDeploy 디플로이 타입** | In-place는 EC2에만 지원. Blue/Green은 EC2 (ASG), Lambda, ECS에서 지원. Lambda/ECS에서는 In-place 미지원 | In-place, Blue/Green, appspec.yml |
| **CodePipeline 아티팩트** | 스테이지 간 아티팩트는 S3 버킷에 보존. KMS 암호화. 크로스 계정에서는 버킷 정책과 키 정책이 필요 | S3, KMS, 아티팩트 버킷 |
| **buildspec.yml 페이즈** | install → pre_build → build → post_build의 4페이즈. env 섹션에서 Parameter Store / Secrets Manager로부터 비밀 정보 취득 가능 | buildspec.yml, phases, env |
| **Blue/Green과 ALB** | ALB의 타겟 그룹을 전환하여 트래픽을 이행. CodeDeploy가 자동으로 타겟 그룹의 가중치를 변경. 롤백 시 타겟 그룹을 원래대로 복원 | ALB, Target Group, 가중치 |
| **Lambda 디플로이 프리퍼런스** | Canary (10%→100%), Linear (10%씩 단계적), AllAtOnce. Alias와 Version을 사용. BeforeAllowTraffic / AfterAllowTraffic Hook으로 검증 | Canary, Linear, AllAtOnce, Alias |
| **appspec.yml Hooks 순서** | EC2: ApplicationStop → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService. Lambda: BeforeAllowTraffic → AfterAllowTraffic | 라이프사이클 이벤트, hooks |
| **CodePipeline 크로스 리전** | 디플로이 액션을 다른 리전에서 실행 가능. 각 리전에 아티팩트 버킷 필요. 멀티 리전 디플로이먼트에서 사용 | 크로스 리전, 아티팩트 버킷 |
| **CodeBuild 컴퓨트 타입** | SMALL (3GB/2vCPU) ~ 2XLARGE (145GB/72vCPU). Docker 빌드에는 LARGE 이상 권장. 과금은 빌드 시간 단위 (분 단위) | 컴퓨트 타입, 빌드 시간 과금 |
| **롤백 트리거** | CodeDeploy: 디플로이 실패 시 + CloudWatch 알람 연동으로 자동 롤백. CloudFormation: 롤백 트리거로 Stack 업데이트 후 모니터링 | 자동 롤백, CloudWatch 알람 |
| **Manual Approval** | CodePipeline의 승인 액션으로 SNS 알림. IAM 정책으로 승인 권한을 제어. 타임아웃 (기본 7일) 설정 가능 | Manual Approval, SNS, IAM |
| **CDK Pipelines** | 셀프 뮤테이팅 파이프라인. cdk synth → Cloud Assembly → CloudFormation 디플로이. 파이프라인 코드 변경도 자동 반영 | Self-mutating, Cloud Assembly |
| **CodeArtifact** | npm/pip/Maven의 프라이빗 리포지토리. 업스트림 리포지토리로 외부 패키지를 캐시. 도메인 정책으로 크로스 계정 공유 | 업스트림, 도메인, 패키지 |
| **ECS Blue/Green** | CodeDeploy가 ECS의 Task Set을 관리. Production Listener와 Test Listener로 검증 후 전환. appspec.yml에서 TaskDefinition과 컨테이너명을 지정 | Task Set, Listener, taskdef.json |
| **CodeBuild 캐시** | S3 캐시 (공유 가능)와 로컬 캐시 (동일 호스트). node_modules나 .m2 캐시로 빌드 고속화 | S3 캐시, 로컬 캐시 |

## Well-Architected 체크리스트

### Operational Excellence (운영 우수성)
- [ ] 모든 디플로이가 CI/CD 파이프라인을 통해 자동화되어 있는가
- [ ] 파이프라인의 각 스테이지에서 적절한 테스트 (유닛, 통합, E2E)가 실행되고 있는가
- [ ] 프로덕션 디플로이 전에 수동 승인 단계가 마련되어 있는가
- [ ] 파이프라인 실패가 SNS/EventBridge 경유로 적절하게 알림되고 있는가
- [ ] 디플로이 메트릭스 (성공률, 소요 시간, 빈도)가 CloudWatch에서 감시되고 있는가
- [ ] Infrastructure as Code (CDK/CloudFormation)가 파이프라인에 통합되어 있는가

### Reliability (신뢰성)
- [ ] Blue/Green 또는 Canary 디플로이 전략이 프로덕션 환경에서 채택되어 있는가
- [ ] 자동 롤백이 CloudWatch 알람 연동으로 설정되어 있는가
- [ ] 디플로이 후 Bake Time (감시 기간)이 설정되어 있는가
- [ ] 데이터베이스 마이그레이션의 롤백 전략이 정의되어 있는가
- [ ] 멀티 리전 디플로이가 필요한 경우 크로스 리전 파이프라인이 구성되어 있는가

### Security (보안)
- [ ] 비밀 정보 (API 키, 패스워드)가 소스 코드에 포함되지 않고 Parameter Store / Secrets Manager에서 취득되고 있는가
- [ ] 파이프라인의 IAM 역할이 최소 권한 원칙에 따르고 있는가
- [ ] 크로스 계정 디플로이에서 적절한 IAM 역할과 신뢰 관계가 설정되어 있는가
- [ ] 아티팩트 버킷이 KMS로 암호화되어 있는가
- [ ] CodeArtifact로 공급망 보안이 확보되어 있는가

### Cost Optimization (비용 최적화)
- [ ] CodeBuild의 컴퓨트 타입이 빌드 요건에 적절히 사이징되어 있는가
- [ ] CodeBuild의 캐시 (S3/로컬)가 설정되어 빌드 시간이 최적화되어 있는가
- [ ] Blue/Green 디플로이의 구 환경이 적절한 타이밍에 삭제되고 있는가
- [ ] 파이프라인의 실행 빈도가 적절한가 (불필요한 트리거가 없는가)

### Performance Efficiency (성능 효율)
- [ ] 빌드의 병렬 실행이 적절히 설정되어 있는가
- [ ] CodeBuild의 캐시 전략이 최적화되어 있는가
- [ ] 디플로이의 병행도 (MaxConcurrency)가 적절히 설정되어 있는가
