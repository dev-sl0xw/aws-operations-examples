# 섹션07: Auto Scaling & 레질리언스
> Well-Architected Pillars: Reliability, Performance Efficiency
> Day: 2 | 난이도: 중급

## 개요

Auto Scaling은 애플리케이션의 가용성을 유지하면서, 수요에 따라 컴퓨팅 리소스를 자동으로 증감시키는 서비스이다. EC2 Auto Scaling이 가장 일반적이며, Launch Template과 Auto Scaling Group(ASG)을 조합하여 인스턴스의 자동 기동 및 종료를 관리한다.

레질리언스(복원력)는 시스템이 장애에 견디고, 장애로부터 신속하게 회복하는 능력을 말한다. Auto Scaling은 단순한 비용 최적화 도구가 아니라, 인스턴스 장애 시의 자동 복구, AZ 장애 시의 다른 AZ에서의 재기동 등, 신뢰성의 핵심을 담당한다. "Design for Failure" 원칙을 자동화하는 서비스로 자리매김된다.

SAA 시험에서는 스케일링 정책의 종류와 적용 장면, 쿨다운 기간의 역할, Launch Template vs Launch Configuration, ELB와의 통합, 그리고 라이프사이클 훅의 사용 장면이 자주 출제된다. 특히 Target Tracking vs Step Scaling vs Simple Scaling의 차이는 확실히 이해할 필요가 있다.

## 핵심 개념

### 수평 스케일링 vs 수직 스케일링

**정의:** 수직 스케일링(Scale Up/Down)은 기존 인스턴스의 스펙(CPU, 메모리 등)을 변경하는 것. 수평 스케일링(Scale Out/In)은 인스턴스의 대수를 증감시키는 것. 클라우드 아키텍처에서는 수평 스케일링이 강력히 권장된다.

**소크라테스식 심화:**
> Q: "수평 스케일링과 수직 스케일링의 차이는 무엇인가? 왜 수평이 선호되는가?"
> A: 점심 러시 아워의 레스토랑에 비유한다. 수직 스케일링=요리사를 초고속 요리사로 교체한다(더 큰 인스턴스 타입으로 변경). 수평 스케일링=요리사를 추가 고용한다(인스턴스를 추가). 수평이 선호되는 이유는 3가지이다: (1) 한 명의 요리사 속도에는 물리적 한계가 있다(인스턴스 타입에는 상한이 있다) (2) 그 요리사가 병가를 내면 폐점(단일 장애점) (3) 요리사를 증감시키는 것이 더 유연하다(수요에 따라 즉시 대응 가능). 수직 스케일링은 인스턴스의 정지 → 타입 변경 → 재기동이 필요해 다운타임이 발생하지만, 수평 스케일링은 서비스를 중단하지 않고 실행할 수 있다.
> Q: "그럼, 수직 스케일링이 적절한 경우는 있는가?"
> A: 데이터베이스(RDS)와 같이 수평 스케일링이 어려운 스테이트풀 워크로드에서는 수직 스케일링이 필요한 경우가 있다. 단, RDS에서도 Read Replica에 의한 읽기의 수평 스케일링은 가능하다. 또한, 싱글 스레드 애플리케이션으로 하나의 리퀘스트 처리에 대량의 CPU/메모리가 필요한 경우에도 수직 스케일링이 적절하다.

**현실 세계의 비유 (비IT 대상):**
> "이사 작업. 수직=한 명의 작업원을 초인적으로 힘센 사람으로 교체한다(한계가 있다). 수평=작업원을 늘린다(유연하고, 한 명이 쉬어도 작업은 계속된다). 보통은 작업원을 늘리는 것이 현실적이다."

### Launch Template vs Launch Configuration

**정의:** Launch Template(시작 템플릿)은 EC2 인스턴스의 기동 파라미터(AMI, 인스턴스 타입, 키 페어, 시큐리티 그룹, 유저 데이터 등)를 정의하는 템플릿이다. Launch Configuration(시작 구성)은 동일한 목적이지만, 레거시이며 신규 생성이 비권장이다.

**소크라테스식 심화:**
> Q: "Launch Template과 Launch Configuration의 차이는 무엇인가?"
> A: Launch Template은 버전 관리가 가능하며, 여러 인스턴스 타입의 지정(Mixed Instances Policy), 스팟 인스턴스 설정, T2/T3 Unlimited 설정이 가능하다. Launch Configuration은 생성 후 변경할 수 없으며, 새로운 설정에는 신규 생성이 필요하다. AWS는 모든 유스케이스에서 Launch Template을 권장하고 있다.
> Q: "Launch Configuration이 비권장인데, 왜 시험에 나오는가?"
> A: 레거시 시스템의 마이그레이션에 관한 문제로 출제된다. "Launch Configuration을 사용하는 ASG가 있다. 최신 베스트 프랙티스로 이전하려면 어떻게 해야 하는가?" → Launch Template으로 이전한다. 또한, Launch Configuration에서는 불가능한 기능(여러 인스턴스 타입의 혼재 등)을 묻는 문제도 있다.

**현실 세계의 비유 (비IT 대상):**
> "건축 설계도. Launch Configuration=한 번 인쇄하면 수정할 수 없는 청사진. Launch Template=디지털 CAD 도면으로 버전 관리 가능, 부분적인 변경도 용이, 여러 변형도 관리할 수 있다."

### Auto Scaling Group (ASG)

**정의:** EC2 인스턴스의 논리적 그룹. 최소 용량(Min), 최대 용량(Max), 희망 용량(Desired)을 설정하고, ASG가 Desired의 대수를 유지한다. 인스턴스가 비정상 종료되면 자동으로 새 인스턴스를 기동한다(Self-Healing).

**소크라테스식 심화:**
> Q: "Min, Max, Desired의 관계는 무엇인가?"
> A: Min=최저 보장 인원. 아무리 야간이라도 이 인원은 유지한다. Max=상한 인원. 아무리 바빠도 이 이상은 고용하지 않는다(비용 상한). Desired=지금 이 순간의 이상적인 인원. 스케일링 정책에 의해 자동으로 Min과 Max 범위 내에서 변동한다. 예: Min=2, Max=10, Desired=4인 경우, 통상 4대의 인스턴스가 가동되고, 부하 증가로 Desired가 6으로 변경되면 2대가 추가된다. 부하가 줄면 Desired가 3으로 변경되어 1대가 종료되지만, Min=2 이하로는 내려가지 않는다.
> Q: "Desired를 설정하지 않고(Auto Scaling에 맡기는) 것이 좋은가, 고정하는 것이 좋은가?"
> A: 통상적으로는 스케일링 정책에 맡긴다. 수동으로 Desired를 변경하는 것은 긴급 시에만. 스케일링 정책이 Desired를 자동 조정하는 것이야말로 Auto Scaling의 본래 가치가 발휘된다.

**현실 세계의 비유 (비IT 대상):**
> "택시 회사의 배차 관리. Min=최소한의 대기 대수. Max=보유 대수의 상한. Desired=지금 필요한 배차 대수. 승차 수요(트래픽)에 따라 Desired가 변동하며, Min 이하로도 Max 이상으로도 되지 않는다."

### 스케일링 정책

**정의:** ASG가 언제, 어떻게 인스턴스 수를 증감하는지 결정하는 규칙. 목적과 복잡성에 따라 5종류의 정책이 준비되어 있다.

**소크라테스식 심화:**
> Q: "5종류의 스케일링 정책의 사용 구분은?"
> A: (1) **Target Tracking(타깃 추적):** "CPU 사용률을 70%로 유지"처럼 목표값을 설정하기만 하면 된다. ASG가 자동으로 인스턴스 수를 조정. 에어컨의 자동 온도 설정에 가장 가깝다. 가장 심플하며, AWS가 권장하는 첫 번째 선택지. (2) **Step Scaling(스텝):** 알람의 초과 폭에 따라 스케일링 양을 변경. CPU 70-80%면 2대 추가, 80-90%면 4대 추가, 90% 초과면 6대 추가. 단계적 대응이 가능. (3) **Simple Scaling(심플):** 알람 발보로 고정 대수를 증감. 쿨다운 기간 중에는 추가 스케일링을 수행하지 않는다. 가장 기본적이지만, Step Scaling이나 Target Tracking에 뒤떨어진다. (4) **Scheduled Scaling(스케줄):** 시간 지정으로 스케일링. "매일 아침 9시에 Desired=10, 매일 밤 22시에 Desired=2". 예측 가능한 트래픽 패턴에 유효. (5) **Predictive Scaling(예측):** 과거의 트래픽 패턴을 ML로 분석하여, 수요를 예측해 스케일링. 실제 부하 증가 전에 인스턴스를 준비할 수 있다.
> Q: "Target Tracking으로 충분하다면, 왜 다른 정책이 존재하는가?"
> A: Target Tracking은 "CPU 사용률" 등의 단일 메트릭에 기반한다. 커스텀 메트릭(예: SQS 큐의 깊이)에 기반한 복잡한 스케일링에는 Step Scaling이 적절하다. 또한, 확실히 예측할 수 있는 트래픽 패턴(업무 시간, 세일 시작 시각)에는 Scheduled Scaling으로 사전에 스케일링하는 것이 더 확실하다. Predictive Scaling은 정기적인 패턴을 가진 워크로드에 최적이지만, 불규칙한 트래픽에는 부적합하다.

**현실 세계의 비유 (비IT 대상):**
> "슈퍼마켓의 계산대 운영. Target Tracking=대기 줄이 5명 이상이 되지 않도록 자동 조정. Step Scaling=5명 대기 시 1대 증설, 10명 대기 시 3대 증설, 20명 대기 시 전대 가동. Scheduled=주말은 처음부터 계산대를 많이 열어둔다. Predictive=과거 경향에서 다음 주 토요일 피크 시간을 예측하여 사전에 인원 배치."

### 쿨다운 기간 (Cooldown Period)

**정의:** 스케일링 액션 실행 후, 다음 스케일링 액션을 억제하는 대기 기간. 기본값은 300초(5분). 이 기간 중에는 새로운 스케일링 액션이 실행되지 않으며, 직전 스케일링의 효과가 나타나는 것을 기다린다.

**소크라테스식 심화:**
> Q: "쿨다운 기간은 왜 필요한가?"
> A: 에어컨의 서모스탯과 같은 것이다. 설정 온도에 도달한 후 바로 ON/OFF를 반복하면 고장난다(플래핑). 일정 시간 기다린 후 다음 판단을 한다. Auto Scaling도 마찬가지로, 스케일링 액션 후 안정화될 때까지 기다린다. 새 인스턴스가 기동되어도 초기화(부트, 애플리케이션 기동, 워밍업)에 시간이 걸린다. 그 사이에 메트릭이 아직 개선되지 않았다고 추가 스케일링하면, 과잉 인스턴스가 기동되어 버린다.
> Q: "쿨다운 기간이 너무 길면 어떻게 되는가?"
> A: 급격한 부하 증가에 대응할 수 없게 된다. 사용자로부터의 리퀘스트가 급증하고 있는데, 쿨다운 중이라 추가 스케일링이 차단되어 기존 인스턴스가 과부하에 빠진다. 적절한 쿨다운 기간은 인스턴스의 초기화 시간과 메트릭의 안정화 시간을 고려하여 설정할 필요가 있다. Target Tracking 정책은 쿨다운의 자동 관리를 수행하므로, 수동 설정의 복잡성이 경감된다.

**현실 세계의 비유 (비IT 대상):**
> "엘리베이터의 운행 관리. 각 층에서 사람이 탈승한 후 문이 닫힐 때까지의 대기 시간이 쿨다운. 대기 시간이 너무 짧으면 문에 끼는 사고(플래핑). 너무 길면 다른 층에서 기다리는 사람이 짜증난다(스케일링 지연)."

### 인스턴스 워밍업 (Instance Warm-up)

**정의:** 새로 기동된 인스턴스가 트래픽을 처리할 수 있는 상태가 될 때까지의 유예 시간. 워밍업 기간 중의 인스턴스의 메트릭은 ASG의 집계 메트릭에 포함되지 않는다. 이를 통해 초기화 중인 인스턴스의 낮은 퍼포먼스가 추가 스케일 아웃을 잘못 트리거하는 것을 방지한다.

**소크라테스식 심화:**
> Q: "워밍업과 쿨다운의 차이는 무엇인가?"
> A: 워밍업은 "새 인스턴스가 준비 완료될 때까지의 시간". 쿨다운은 "다음 스케일링 판단까지의 대기 시간". 워밍업은 인스턴스 단위, 쿨다운은 ASG 전체에 적용된다. 예를 들어 애플리케이션 기동에 3분이 걸리면, 워밍업을 3분으로 설정한다. Step Scaling과 Target Tracking에서 사용 가능.
> Q: "워밍업을 설정하지 않으면 어떻게 되는가?"
> A: 새 인스턴스가 아직 기동 중(CPU 100%로 초기화 중)인 상태에서, 그 CPU 메트릭이 ASG의 평균에 포함된다. 결과적으로 ASG 전체의 CPU 평균이 높아 보이며, 추가 스케일 아웃이 발생한다. 이것이 반복되면 불필요한 인스턴스가 대량으로 기동되고, 그 후 일제히 스케일 인하여 불안정한 동작(oscillation)을 일으킨다.

**현실 세계의 비유 (비IT 대상):**
> "신입사원의 연수 기간. 입사 첫날부터 통상의 실적 평가(메트릭 집계)에 포함하면, 팀 전체의 평균이 내려간다. 연수 기간(워밍업)이 끝날 때까지는 평가 대상 외로 하고, 한 사람 몫을 하게 된 후에 팀 평가에 포함한다."

### 라이프사이클 훅 (Lifecycle Hooks)

**정의:** ASG가 인스턴스를 기동(Launch) 또는 종료(Terminate)할 때, 커스텀 액션을 실행하기 위한 대기 포인트. 훅이 설정되면, 인스턴스는 Pending:Wait(기동 시) 또는 Terminating:Wait(종료 시) 상태에서 대기하며, 커스텀 처리의 완료를 기다린다.

**소크라테스식 심화:**
> Q: "라이프사이클 훅은 왜 필요한가?"
> A: 신입사원의 온보딩과 같은 것이다. 입사일(인스턴스 기동)에 바로 업무에 투입하는 것이 아니라, ID 등록, 환경 설정, 연수(커스텀 초기화)를 거친 후 실제 업무(트래픽 수신)를 시작한다. 구체적인 예: (1) 기동 시: 서비스 디스커버리 등록, 설정 파일 다운로드, 애플리케이션 워밍업 (2) 종료 시: 로그 백업, 서비스 디스커버리 등록 해제, 진행 중인 작업 완료 대기.
> Q: "라이프사이클 훅의 타임아웃은 어떻게 되는가?"
> A: 기본값은 3600초(1시간). 타임아웃되면 기본 액션(ABANDON or CONTINUE)이 실행된다. ABANDON은 기동을 중지(종료), CONTINUE는 훅을 무시하고 처리를 진행한다. Lambda 함수나 SNS/SQS와 연계하여 커스텀 처리를 실행하고, 완료 후에 `complete-lifecycle-action` API를 호출하여 훅을 해제한다.

**현실 세계의 비유 (비IT 대상):**
> "호텔의 체크인/체크아웃 절차. 체크인(기동) 시에는 ID 확인, 객실 준비 확인, 시설 안내가 필요하다. 체크아웃(종료) 시에는 미니바 확인, 룸키 반납, 정산이 필요하다. 이것들이 끝날 때까지 다음 게스트(트래픽)는 들어올 수 없다."

### 헬스 체크와 Self-Healing

**정의:** ASG는 인스턴스의 건전성을 감시하며, 비정상 인스턴스를 자동으로 교체한다. EC2 스테이터스 체크(기본)와 ELB 헬스 체크의 2종류가 있다. EC2 스테이터스 체크는 하드웨어/네트워크 레벨의 이상을 감지하고, ELB 헬스 체크는 애플리케이션 레벨의 이상을 감지한다.

**소크라테스식 심화:**
> Q: "EC2 스테이터스 체크와 ELB 헬스 체크의 차이는 무엇인가?"
> A: EC2 스테이터스 체크는 "서버의 전원이 켜져 있는가, 네트워크가 연결되어 있는가"를 확인한다. ELB 헬스 체크는 "애플리케이션이 정상적으로 응답하고 있는가"를 확인한다. 예를 들어, EC2 인스턴스는 정상 가동 중이지만 애플리케이션이 크래시한 경우, EC2 스테이터스 체크는 Healthy이지만 ELB 헬스 체크는 Unhealthy가 된다.
> Q: "ASG에 ELB 헬스 체크를 설정하지 않으면 어떻게 되는가?"
> A: 애플리케이션이 크래시해도 EC2 인스턴스는 정상으로 판단되며, ASG는 교체하지 않는다. 사용자는 에러를 계속 받게 된다. 운영 환경에서는 반드시 ELB 헬스 체크를 ASG에 설정해야 한다. 설정 방법은 `aws autoscaling update-auto-scaling-group --health-check-type ELB`.

**현실 세계의 비유 (비IT 대상):**
> "직원의 건강 관리. EC2 스테이터스 체크=출근하고 있는가 확인(재석 확인). ELB 헬스 체크=업무를 정상적으로 수행하고 있는가 확인(업무 수행 확인). 출근하고 있어도 컨디션 불량으로 업무를 할 수 없는(애플리케이션 장애) 경우, ELB 체크로 감지하여 교대시킨다."

### Instance Refresh (인스턴스 리프레시)

**정의:** ASG 내의 인스턴스를 롤링 방식으로 새로운 Launch Template 버전으로 업데이트하는 기능. 최소 건전 비율(Min Healthy Percentage)을 지정하여, 한 번에 교체하는 인스턴스의 비율을 제어한다. 블루/그린 배포 없이 롤링 업데이트를 실현한다.

**소크라테스식 심화:**
> Q: "Instance Refresh는 어떤 장면에서 사용하는가?"
> A: AMI 업데이트, 유저 데이터 변경, 인스턴스 타입 변경 등, Launch Template의 변경을 기존 인스턴스에 반영하고 싶은 경우. Min Healthy Percentage=90%라면, 10대 중 9대는 항상 가동 상태에서 1대씩 교체한다. 서비스의 가용성을 유지하면서 업데이트가 가능하다.
> Q: "Instance Refresh가 실패한 경우 어떻게 되는가?"
> A: 자동 롤백 옵션을 설정 가능하다. 새 인스턴스의 헬스 체크가 계속 실패하는 경우, 업데이트를 중지하고 원래 상태로 되돌린다. CloudWatch Alarms와 연계하여, 애플리케이션 레벨의 이상도 감지하여 롤백할 수 있다.

**현실 세계의 비유 (비IT 대상):**
> "영업 중인 슈퍼마켓 바닥의 왁스칠. 전체 층을 한꺼번에 폐쇄하지 않고, 구역별로 통행 차단 → 왁스칠 → 건조 → 통행 재개를 반복한다. 항상 고객(트래픽)이 쇼핑할 수 있는 상태를 유지하면서 전체 층을 업데이트한다."

## 아키텍처 패턴

### 패턴1: ALB + ASG 표준 구성

```
Route 53 → ALB (Multi-AZ)
              |
              v
        Target Group
              |
              v
     Auto Scaling Group
    ┌─────────┼─────────┐
    │         │         │
  AZ-a      AZ-c      AZ-d
  [EC2]     [EC2]     [EC2]
  [EC2]     [EC2]     [EC2]

Scaling Policy: Target Tracking (CPU 70%)
Min: 2 | Max: 12 | Desired: 6
```

- 3개의 AZ에 균등 분산(기본 동작)
- Target Tracking Policy로 CPU 사용률을 70%로 유지
- ALB의 헬스 체크를 ASG에 설정
- 비정상 인스턴스는 자동 교체

### 패턴2: 복합 스케일링 전략

```
                    Auto Scaling Group
                           |
         ┌─────────────────┼─────────────────┐
         │                 │                 │
  Scheduled Scaling   Target Tracking   Predictive Scaling
  (업무 시간에        (CPU 70% 유지)     (ML 기반의
   Min=4로 인상)                         수요 예측)
```

- Scheduled Scaling: 업무 시간(9:00-18:00)에 최소 대수를 인상
- Target Tracking: 리얼타임 부하에 기반한 스케일링
- Predictive Scaling: 과거 패턴으로부터 다음 날의 수요를 예측
- 3개의 정책은 병용 가능. 가장 많은 대수를 요구하는 정책이 우선됨

### 패턴3: 라이프사이클 훅을 사용한 초기화

```
ASG Launch
    |
    v
Pending:Wait ─→ EventBridge ─→ Lambda
    |                              |
    |                    (서비스 디스커버리 등록,
    |                     설정 다운로드,
    |                     워밍업)
    |                              |
    v                              v
Pending:Proceed ←── complete-lifecycle-action
    |
    v
InService (트래픽 수신 개시)
```

- Launch 라이프사이클 훅으로 인스턴스를 대기 상태로 함
- EventBridge 경유로 Lambda 함수를 트리거
- Lambda 내에서 커스텀 초기화 처리를 실행
- 완료 후 complete-lifecycle-action으로 해제

### 패턴4: Mixed Instances Policy

```
Auto Scaling Group (Mixed Instances)
    |
    ├── On-Demand: m5.large (베이스라인: 2대)
    ├── Spot: m5.large (30%)
    ├── Spot: m5.xlarge (30%)
    ├── Spot: m4.large (20%)
    └── Spot: c5.large (20%)

Allocation Strategy: capacity-optimized
On-Demand Base Capacity: 2
On-Demand Percentage Above Base: 30%
Spot Percentage: 70%
```

- Launch Template에서 여러 인스턴스 타입을 지정
- On-Demand Base로 최소한의 베이스라인을 확보
- Spot 인스턴스로 비용 최적화(최대 90% 절감)
- capacity-optimized 전략으로 Spot의 중단 리스크를 최소화

## SAA 시험 포인트

1. **Launch Template vs Launch Configuration:** Launch Template이 권장. 버전 관리, 여러 인스턴스 타입, Spot 인스턴스 설정이 가능. Launch Configuration은 레거시. 시험에서는 "Launch Configuration에서 Launch Template으로의 이전"이 출제된다.

2. **Target Tracking의 권장:** AWS가 가장 권장하는 스케일링 정책. "CPU 사용률을 70%로 유지"와 같은 단순한 목표 설정으로, ASG가 자동 조정. 커스텀 메트릭(SQS 큐 깊이 등)에도 사용 가능.

3. **Cooldown vs Warm-up:** Cooldown=ASG 전체의 스케일링 억제 기간. Warm-up=새 인스턴스의 준비 시간(메트릭 집계에서 제외). Simple Scaling에는 cooldown, Step/Target Tracking에는 Warm-up이 적용된다.

4. **헬스 체크의 종류:** EC2(기본)=인스턴스 레벨. ELB=애플리케이션 레벨. Custom=외부 헬스 체크. 운영 환경에서는 ELB 헬스 체크를 설정해야 한다.

5. **스케일링의 순서:** 스케일 아웃 시에는 AZ의 인스턴스 수가 가장 적은 AZ에서 기동. 스케일 인 시에는 인스턴스 수가 가장 많은 AZ에서 종료(AZ Rebalancing). 동수인 경우 Oldest Launch Template → Oldest Launch Configuration → 다음 과금 시간에 가장 가까운 인스턴스 순으로 종료.

6. **Termination Policy:** Default(위의 순서), OldestInstance, NewestInstance, OldestLaunchConfiguration, OldestLaunchTemplate, ClosestToNextInstanceHour, AllocationStrategy. 커스텀 종료 정책도 설정 가능.

7. **Scheduled Action:** cron 또는 at 식으로 지정. 타임존 지정이 가능. 반복 설정(매일, 매주 등)도 지원. 예측 가능한 트래픽 패턴에 최적.

8. **ASG의 일시 정지 프로세스:** Launch, Terminate, HealthCheck, ReplaceUnhealthy, AZRebalance, AlarmNotification, ScheduledActions, AddToLoadBalancer, InstanceRefresh. 디버그 시 ReplaceUnhealthy를 일시 정지하면, 비정상 인스턴스를 조사할 수 있다.

9. **Predictive Scaling:** 최소 2주분의 이력 데이터가 필요. forecast only 모드로 예측 정밀도를 확인한 후 forecast and scale 모드로 전환 가능. 주기적인 트래픽 패턴을 가진 워크로드에 최적.

10. **Instance Refresh:** Min Healthy Percentage(기본 90%)와 Instance Warmup 기간을 설정. Skip Matching을 활성화하면, 이미 최신 Launch Template의 인스턴스는 스킵. Checkpoint 기능으로 단계적 업데이트도 가능.

## 핸즈온 참조

**CDK 프로젝트:** `cdk-projects/04-networking-loadbalancing/`

### 권장 핸즈온 절차

1. **Launch Template 생성:**
   - AMI, 인스턴스 타입, 시큐리티 그룹 지정
   - 유저 데이터로 Apache/Nginx 자동 설치
   - 버전 관리 확인(v1, v2 생성)

2. **Auto Scaling Group 구축:**
   - Min=1, Max=4, Desired=2로 생성
   - 여러 AZ에 배포
   - ALB Target Group과의 연결
   - ELB 헬스 체크 설정

3. **스케일링 정책 설정:**
   - Target Tracking Policy(CPU 70%) 설정
   - stress 커맨드로 부하를 주어 스케일 아웃 확인
   - 부하 해제 후 스케일 인 확인
   - CloudWatch 대시보드에서 인스턴스 수 추이를 감시

4. **라이프사이클 훅 테스트:**
   - Launch Lifecycle Hook 설정
   - EventBridge + Lambda 연계 구축
   - 새 인스턴스 기동 시 Pending:Wait 상태 확인
   - complete-lifecycle-action API로 수동 해제

5. **Instance Refresh 실행:**
   - Launch Template의 새 버전(AMI 변경) 생성
   - Instance Refresh(Min Healthy 90%) 개시
   - 롤링 업데이트 진행 감시

## Well-Architected 체크리스트

### Reliability (신뢰성)

- [ ] ASG가 여러 AZ에 배포되어 있는가
- [ ] Min 용량이 최소 2 이상(단일 장애점 제거)으로 설정되어 있는가
- [ ] ELB 헬스 체크가 ASG에 설정되어 있는가
- [ ] 비정상 인스턴스가 자동으로 교체되고 있는가(Self-Healing)
- [ ] 라이프사이클 훅으로 적절한 초기화 및 종료 처리가 실행되고 있는가
- [ ] Instance Refresh로 안전한 롤링 업데이트가 가능한가
- [ ] 스케일링 정책이 적절히 설정되어, 수요 변동에 대응할 수 있는가

### Performance Efficiency (퍼포먼스 효율)

- [ ] Target Tracking Policy에서 적절한 메트릭 목표값이 설정되어 있는가
- [ ] Cooldown 기간이 인스턴스의 초기화 시간에 대해 적절한가
- [ ] Instance Warm-up이 설정되어, 메트릭 집계의 정밀도가 확보되어 있는가
- [ ] Mixed Instances Policy에서 적절한 인스턴스 타입이 선택되어 있는가
- [ ] Predictive Scaling으로 예측 가능한 트래픽 패턴에 대응하고 있는가

### Cost Optimization (비용 최적화)

- [ ] Spot 인스턴스의 활용이 비용 절감에 기여하고 있는가
- [ ] 스케일 인이 적절히 동작하여, 불필요한 인스턴스가 종료되고 있는가
- [ ] Scheduled Scaling으로 비업무 시간의 리소스를 줄이고 있는가
- [ ] Max 용량이 과대하게 설정되어 있지 않은가(의도치 않은 비용 증가 방지)
