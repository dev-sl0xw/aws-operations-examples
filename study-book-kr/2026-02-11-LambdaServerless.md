# 섹션13: Lambda & 서버리스 운영 (Lambda & Serverless Operations)
> Well-Architected Pillars: Operational Excellence, Performance Efficiency, Cost Optimization
> Day: 4 | 난이도: 중급~상급

## 개요

AWS Lambda는 서버의 프로비저닝이나 관리 없이 코드를 실행할 수 있는 서버리스 컴퓨팅 서비스이다. 이벤트 구동형 아키텍처에서 핵심적인 역할을 하며, API Gateway, S3, DynamoDB Streams, EventBridge 등 다양한 이벤트 소스와 통합된다. Lambda 함수는 요청 단위로 과금되며, 사용하지 않는 시간에는 비용이 발생하지 않으므로 배치 처리나 마이크로서비스의 실행 기반으로 매우 비용 효율이 높다.

서버리스 아키텍처는 Lambda 단독이 아닌, API Gateway(HTTP 엔드포인트), Step Functions(오케스트레이션), DynamoDB(NoSQL 데이터스토어), S3(오브젝트 스토리지), SQS/SNS(메시징) 등의 매니지드 서비스를 조합하여 구축된다. 이 조합을 통해 인프라 관리 부담을 최소화하면서 높은 확장성과 가용성을 실현할 수 있다. Well-Architected Framework의 관점에서는 운영 우수성(자동 스케일링, 배포 자동화), 성능 효율(메모리 설정 최적화, Provisioned Concurrency), 비용 최적화(요청 단위 과금, 유휴 비용 제로)의 3가지 기둥이 특히 중요하다.

SAA 시험에서는 Lambda의 실행 모델(Cold Start, 동기/비동기 호출), API Gateway의 종류와 기능, Step Functions의 워크플로우 설계, Lambda@Edge와 CloudFront Functions의 사용 구분, 그리고 VPC 내 Lambda 함수의 네트워크 설계가 자주 출제되는 주제이다. 특히 Lambda의 제한값(타임아웃 15분, 메모리 10GB, 페이로드 크기 등)은 정확히 기억해 둘 필요가 있다.

## 핵심 개념

### AWS Lambda 실행 모델

**정의:** Lambda 함수는 컨테이너 기반의 실행 환경에서 동작한다. 최초 호출 시 컨테이너가 생성되고(Cold Start), 이후 호출에서는 기존 컨테이너가 재사용된다(Warm Start). 실행 컨텍스트(메모리상의 변수, /tmp 디렉토리의 파일, DB 연결 등)는 Warm Start 시에 유지되지만 보장되지는 않는다. Lambda 런타임은 함수 코드를 실행 환경에 로드하고, 초기화 단계(INIT) -> 호출 단계(INVOKE) -> 종료 단계(SHUTDOWN)의 생명주기로 관리된다.

**소크라테스식 심화:**
> Q: "Cold Start와 Warm Start의 차이는 무엇인가? 성능에 어떤 영향을 미치는가?"
> A: Cold Start는 새로운 컨테이너를 처음부터 만드는 과정이다. 음식점의 개점 준비에 비유하면, 주방을 청소하고 식재료를 배치하고 오븐을 예열하는 것부터 시작한다(수백ms~수초). Warm Start는 이미 영업 중인 음식점에 새 주문이 들어오는 것과 같다(수ms). Cold Start의 소요 시간은 런타임(Java/C#은 느리고, Python/Node.js는 빠름), 메모리 크기(클수록 고속 CPU 할당), 패키지 크기(의존 라이브러리 양), VPC 연결 여부에 의존한다. VPC 내 Lambda는 이전에 ENI 생성으로 +10초 정도의 Cold Start가 있었지만, 현재는 Hyperplane ENI의 도입으로 크게 개선되었다.
> Q: "실행 컨텍스트의 재사용이란 구체적으로 무엇을 의미하는가?"
> A: 핸들러 함수 바깥에서 초기화한 변수, DB 연결, SDK 클라이언트는 다음 호출 시에 메모리에 남아 있을 가능성이 있다. /tmp 디렉토리(최대 10GB)의 파일도 유지된다. 이를 활용하여 DB 연결 풀이나 SDK 클라이언트를 핸들러 바깥에서 초기화하는 '연결 재사용' 패턴이 권장된다. 다만, 실행 컨텍스트의 재사용은 보장되지 않으므로 항상 초기화가 필요한 전제로 코드를 작성해야 한다. 전역 변수에 상태를 보존하면 서로 다른 요청 간에 상태가 누설되는 위험이 있다.

**현실 세계의 비유 (비IT 대상):**
> "택시 승강장의 구조. Cold Start = 전화로 부른 택시가 먼 차고에서 오는 것(대기 시간이 길다). Warm Start = 바로 앞 승강장에 이미 대기하고 있는 택시에 곧바로 탈 수 있는 것(대기 시간이 거의 없다). 바쁜 시간대(고빈도 요청)에는 택시가 항상 대기하고 있지만, 심야(저빈도)에는 차고에서 불러야 한다."

---

### Lambda 설정 파라미터

**정의:** Lambda 함수의 동작을 제어하는 주요 설정값. 메모리(128MB~10,240MB, 1MB 단위)는 CPU 파워에 비례하여 할당되며, 타임아웃(최대 15분 = 900초)은 함수의 최대 실행 시간을 제한한다. 동시 실행 수(Concurrency)는 Reserved Concurrency(다른 함수로부터 확보)와 Provisioned Concurrency(사전에 컨테이너를 워밍업)의 2종류가 있다. 환경 변수, Layers, 임시 스토리지(/tmp)도 중요한 설정 요소이다.

**소크라테스식 심화:**
> Q: "메모리 설정이 CPU 파워에 영향을 준다는 것은 어떤 의미인가?"
> A: Lambda에서는 메모리와 별도로 CPU 설정 항목이 없다. 메모리를 늘리면 CPU 파워도 비례하여 증가한다. 1,769MB에서 1 vCPU 상당, 10,240MB에서 6 vCPU 상당이 할당된다. 즉 메모리 설정은 '컴퓨팅 파워 전체의 다이얼'이다. CPU 부하가 높은 처리(이미지 처리, 데이터 변환 등)에서는 메모리를 늘림으로써 실행 시간이 단축되어, 결과적으로 비용이 줄어드는 경우도 있다. AWS Lambda Power Tuning 도구로 최적의 메모리 설정을 자동으로 찾을 수 있다.
> Q: "Reserved Concurrency와 Provisioned Concurrency의 차이와 사용 구분은?"
> A: Reserved Concurrency는 '이 함수용으로 동시 실행 할당량을 예약하는' 설정이다. 계정 전체의 동시 실행 상한(기본 1,000)에서 지정한 수를 확보하여, 다른 함수가 사용할 수 없게 한다. 다만 Cold Start는 발생한다. 비용은 무료. Provisioned Concurrency는 '사전에 컨테이너를 워밍업해 두는' 설정이다. Cold Start를 완전히 제거한다. 다만 워밍업하고 있는 컨테이너 분의 비용이 항상 발생한다. 사용 구분: (1) 일정 수준의 처리량만 보장하고 싶다면 Reserved (2) 지연 시간 요건이 엄격하다면(P99 < 100ms 등) Provisioned (3) 예측 가능한 트래픽 패턴에는 Application Auto Scaling과 결합하여 Provisioned Concurrency를 동적으로 조정.

**현실 세계의 비유 (비IT 대상):**
> "Reserved Concurrency = 음식점의 예약석. 다른 손님에게 뺏기지 않지만, 착석 후 요리 제공 시간(Cold Start)은 보통과 같다. Provisioned Concurrency = VIP 전용 사전 준비 테이블. 요리가 이미 준비되어 있어 착석과 동시에 바로 제공된다. 다만 VIP 테이블의 유지 비용이 항상 든다."

---

### Lambda 트리거와 이벤트 소스

**정의:** Lambda 함수를 기동하는 이벤트 소스는 동기 호출(Synchronous), 비동기 호출(Asynchronous), 스트림 기반 호출(Stream-based/Polling)의 3종류로 분류된다. 호출 방식에 따라 에러 핸들링, 재시도 동작, 스케일링 특성이 다르다.

**소크라테스식 심화:**
> Q: "동기 호출과 비동기 호출의 차이는 무엇인가?"
> A: **동기 호출:** 호출자가 Lambda의 실행 완료를 기다린다. API Gateway, ALB, CloudFront(Lambda@Edge), Cognito 등. 에러 시 재시도는 호출자의 책임. 응답이 직접 반환된다. 전화와 같다(상대의 응답을 기다린다). **비동기 호출:** 호출자는 이벤트를 큐에 넣고 즉시 응답(202 Accepted)을 받는다. S3 이벤트, SNS, EventBridge, CloudWatch Logs, SES, CodeCommit 등. Lambda 측에서 재시도(기본 2회)가 수행되며, 실패 시 DLQ(Dead Letter Queue) 또는 Destinations로 전송된다. 편지와 같다(투함하면 결과를 기다리지 않는다). **스트림 기반:** Lambda 자체가 스트림을 폴링하여 레코드를 가져온다. Kinesis Data Streams, DynamoDB Streams, SQS. 배치 처리로 효율적으로 레코드를 처리한다. 스트림 내의 위치(이터레이터)를 관리한다. 회전 초밥의 벨트 컨베이어(데이터가 흘러오는 것을 집는다).
> Q: "SQS는 스트림 기반인데, SNS는 비동기 호출이다. 왜 다른가?"
> A: SQS는 Lambda의 Event Source Mapping(ESM)이 큐를 폴링하여 메시지를 배치로 가져온다. 즉 Lambda 측이 pull한다. SNS는 토픽에서 Lambda 함수를 직접 호출한다(push한다). 이 차이는 스케일링과 에러 핸들링에 영향을 미친다. SQS에서는 처리 실패 시 메시지가 큐로 돌아가며(Visibility Timeout 후) 재처리된다. SNS에서는 비동기 호출의 재시도 정책을 따른다. SQS의 Batch Window이나 Batch Size 조정으로 처리 효율을 최적화할 수 있다.

**현실 세계의 비유 (비IT 대상):**
> "동기 = 전화 주문(상대가 응답할 때까지 기다린다). 비동기 = 주문서를 팩스로 송신(보내면 결과는 나중에 확인). 스트림 기반 = 회전 초밥의 벨트 컨베이어(흘러오는 접시를 자기 타이밍에 집는다). 각각 응답 속도, 에러 대응, 처리 효율의 특성이 다르다."

---

### API Gateway

**정의:** API Gateway는 REST API, HTTP API, WebSocket API를 생성하고 관리하는 풀매니지드 서비스이다. Lambda 함수의 HTTP 엔드포인트로 기능하며, 인증/인가, 속도 제한(스로틀링), 캐싱, 커스텀 도메인, 스테이지 관리 등의 기능을 제공한다. REST API와 HTTP API의 2종류가 있으며, 용도에 따라 선택한다.

**소크라테스식 심화:**
> Q: "REST API와 HTTP API의 차이와 사용 구분은?"
> A: **REST API:** 풀 기능 버전. API 키, 사용량 플랜, 리소스 정책, WAF 통합, 캐싱, 요청/응답 변환(매핑 템플릿), 카나리아 배포를 지원한다. 요금이 높다($3.50/100만 요청). **HTTP API:** 경량 버전. Lambda 통합과 HTTP 프록시에 특화. JWT 인가, CORS 설정, 자동 배포를 지원한다. REST API 대비 약 70% 저렴하다($1.00/100만 요청). 지연 시간도 낮다. **사용 구분:** API 키 관리, WAF 통합, 캐싱, 요청 변환이 필요 -> REST API. 단순한 Lambda 프록시, 비용 중시, 낮은 지연 시간 중시 -> HTTP API. 신규 프로젝트에서는 HTTP API가 권장되지만, 엔터프라이즈 기능이 필요하면 REST API.
> Q: "Lambda Proxy 통합과 Non-Proxy 통합의 차이는?"
> A: **Proxy 통합:** API Gateway가 요청 전체(헤더, 쿼리 파라미터, 바디, 컨텍스트)를 그대로 Lambda에 전달한다. 응답도 Lambda가 완전히 제어한다(상태 코드, 헤더, 바디). 설정이 간단하고 가장 일반적이다. **Non-Proxy 통합:** API Gateway에서 요청/응답의 변환(매핑 템플릿, VTL)을 수행한다. Lambda는 변환 후의 데이터를 받는다. 레거시 백엔드와의 통합이나 복수의 백엔드로의 라우팅에 사용된다. 설정이 복잡하지만 API 계층에서의 유연한 변환이 가능하다. SAA 시험에서는 주로 Proxy 통합이 출제된다.

**현실 세계의 비유 (비IT 대상):**
> "API Gateway = 호텔의 프런트 데스크. REST API = 풀서비스 프런트(컨시어지, 짐 보관, 레스토랑 예약, 룸서비스 주문 등 모두 대응). HTTP API = 셀프서비스 체크인 키오스크(기본적인 체크인/체크아웃에 특화, 빠르고 저렴). Proxy 통합 = 고객의 요청을 그대로 담당 부서에 전달. Non-Proxy 통합 = 프런트가 요청을 번역하고 정리한 후에 담당 부서에 전달."

---

### Step Functions

**정의:** Step Functions는 복수의 AWS 서비스를 워크플로우(스테이트 머신)로 편성하는 서버리스 오케스트레이션 서비스이다. Amazon States Language(ASL)라는 JSON 기반의 언어로 워크플로우를 정의한다. Standard(최대 1년 실행, 정확히 1회 실행)와 Express(최대 5분, 최소 1회 실행)의 2종류의 워크플로우 타입이 있다.

**소크라테스식 심화:**
> Q: "Step Functions의 Standard와 Express의 차이와 사용 구분은?"
> A: **Standard Workflow:** 최대 실행 기간 1년. 실행 상태가 완전히 기록되어, 실행 이력을 Step Functions 콘솔에서 확인 가능. 정확히 1회(exactly-once) 실행을 보장. 요금은 상태 전이마다 과금($0.025/1,000 상태 전이). 장시간의 승인 플로우, 에러 복구가 필요한 배치 처리, 사람의 개입을 포함하는 워크플로우에 적합. **Express Workflow:** 최대 실행 기간 5분. 실행 상태는 CloudWatch Logs에 기록. 최소 1회(at-least-once) 실행. 요금은 요청 수와 실행 시간에 기반(높은 처리량 향으로 저렴). IoT 데이터 처리, 스트리밍 데이터 변환, 고빈도 단시간 처리에 적합. Express Workflow에는 추가로 동기(Synchronous)와 비동기(Asynchronous) 실행 모드가 있다.
> Q: "Step Functions의 에러 핸들링(Retry/Catch)은 어떻게 기능하는가?"
> A: **Retry:** 특정 에러 타입에 대해 재시도 횟수, 백오프 레이트, 최대 간격을 정의한다. 예를 들어 'Lambda.ServiceException'에 대해 3회 재시도, 백오프 레이트 2.0(1초 -> 2초 -> 4초의 지수 백오프). **Catch:** 재시도 후에도 실패한 경우의 폴백 대상을 정의한다. 에러 핸들링용 스테이트(통지 송신, 클린업 처리 등)로 전이. **에러 타입:** States.ALL(모든 에러), States.Timeout(타임아웃), States.TaskFailed(태스크 실패), 커스텀 에러 등. Retry -> Catch 순서로 평가된다. 이를 통해 Lambda 함수 내에서의 에러 핸들링을 Step Functions에 위임할 수 있어, 함수 코드가 간결해진다.

**현실 세계의 비유 (비IT 대상):**
> "Step Functions = 공장의 조립 라인 관리 시스템. Standard = 집을 짓는 프로젝트(수개월, 각 공정의 기록이 중요, 실패하면 다시 해야 함). Express = 도시락 제조 라인(수분, 고속 대량 생산, 하나 실패해도 다음 것을 만들면 됨). Retry = 부품이 불량품이었을 경우, 같은 업체에 재발주(최대 3회). Catch = 재발주해도 입수할 수 없는 경우, 대체 업체에 발주."

---

### Step Functions 스테이트 타입

**정의:** Step Functions의 스테이트 머신은 Task(처리 실행), Choice(조건 분기), Parallel(병렬 실행), Map(반복 처리), Wait(대기), Pass(패스스루), Succeed/Fail(성공/실패 종단)의 각 스테이트 타입으로 구성된다.

**소크라테스식 심화:**
> Q: "Map 스테이트와 Parallel 스테이트의 차이는 무엇인가?"
> A: **Parallel 스테이트:** 서로 다른 처리를 동시에 실행한다. 예를 들어 주문 처리에서 '재고 확인' '결제 처리' '배송 수배'를 병렬로 실행한다. 각 브랜치는 서로 다른 스테이트 머신을 가진다. 전체 브랜치가 완료될 때까지 다음으로 진행하지 않는다. **Map 스테이트:** 같은 처리를 배열의 각 요소에 대해 반복 실행한다. 예를 들어 100건의 주문에 대해 같은 검증 처리를 병렬 실행한다. Inline Map(스테이트 머신 내에서 인라인 실행)과 Distributed Map(대규모 데이터셋 대상, S3에서 직접 읽기, 최대 10,000 병렬 실행)이 있다. Distributed Map은 수백만 개의 S3 오브젝트에 대한 ETL 처리에 적합하다.
> Q: "Choice 스테이트에서의 조건 분기 패턴은?"
> A: 문자열 비교(StringEquals, StringGreaterThan 등), 수치 비교(NumericEquals, NumericGreaterThan 등), 불리언 비교(BooleanEquals), 타임스탬프 비교(TimestampEquals 등), 존재 체크(IsPresent)를 조합한다. And, Or, Not에 의한 복합 조건도 가능. Default 브랜치는 필수(어떤 조건에도 매치하지 않는 경우의 폴백).

**현실 세계의 비유 (비IT 대상):**
> "Parallel = 음식점에서 전채, 메인, 디저트를 동시에 조리하는 것(서로 다른 요리를 병행 작업). Map = 100인분의 같은 카레를 10명의 셰프가 분담하여 만드는 것(같은 작업을 병렬화). Choice = 알레르기 정보에 따라 메뉴를 변경하는 것(조건 분기). Wait = 오븐에서 30분 굽는 것(시간 대기)."

---

### Lambda@Edge & CloudFront Functions

**정의:** Lambda@Edge는 CloudFront의 엣지 로케이션에서 Lambda 함수를 실행하는 기능이다. CloudFront Functions는 경량이고 고속인 엣지 컴퓨팅 기능이다. 둘 다 Viewer Request, Viewer Response, Origin Request, Origin Response의 4가지 이벤트 타입에서 호출된다.

**소크라테스식 심화:**
> Q: "Lambda@Edge와 CloudFront Functions의 차이와 사용 구분은?"
> A: **CloudFront Functions:** 경량/고속(서브밀리초). JavaScript 한정. 최대 실행 시간 1ms. 최대 메모리 2MB. 최대 패키지 크기 10KB. Viewer Request/Response만 대응. 1/6의 비용. 용도: HTTP 헤더 조작, URL 리라이트/리다이렉트, 캐시 키 정규화, 간단한 A/B 테스트. **Lambda@Edge:** 풀 기능의 Lambda. Node.js/Python 대응. Viewer Request/Response: 최대 5초, 128MB. Origin Request/Response: 최대 30초, 10GB. 네트워크 접근, 외부 API 호출, 다른 AWS 서비스와의 연계가 가능. 용도: 인증/인가(JWT 검증), 동적 콘텐츠 생성, A/B 테스트(외부 설정 참조), 이미지 동적 리사이즈, 오리진 선택.
> Q: "4가지 이벤트 타입은 어떻게 사용을 구분하는가?"
> A: **Viewer Request:** 클라이언트에서 CloudFront에 도달한 시점. 인증 체크, URL 리라이트, 헤더 추가. 캐시 전에 실행되므로 모든 요청에 대해 실행된다(비용 주의). **Origin Request:** CloudFront가 오리진에 요청을 전달하는 시점. 캐시 미스 시에만 실행. 오리진 선택, 요청 변환. **Origin Response:** 오리진에서 CloudFront로 응답이 돌아오는 시점. 응답 헤더의 추가/변경, 에러 페이지 커스터마이즈. **Viewer Response:** CloudFront에서 클라이언트로 응답을 반환하는 시점. 보안 헤더 추가(HSTS 등), 응답 커스터마이즈.

**현실 세계의 비유 (비IT 대상):**
> "CloudFront Functions = 공항의 보안 게이트(여권 확인, 탑승권 스캔 등, 고속으로 단순한 처리). Lambda@Edge = 공항의 커스텀 입국 심사관(비자 상세 확인, 추가 서류 요청, 외부 데이터베이스 참조 등, 복잡하고 시간이 걸리는 처리). Viewer Request = 공항 도착 시의 첫 번째 체크. Origin Request = 탑승 게이트에서의 최종 확인."

---

### Dead Letter Queue (DLQ) & Lambda Destinations

**정의:** 비동기 호출의 Lambda 함수가 실패한 경우의 에러 핸들링 메커니즘. DLQ(Dead Letter Queue)는 SQS 큐 또는 SNS 토픽에 실패한 이벤트를 전송하는 기존 방식이다. Lambda Destinations는 성공 시와 실패 시 모두에서 이벤트를 다른 서비스(Lambda, SQS, SNS, EventBridge)에 전송할 수 있는 새로운 방식이다.

**소크라테스식 심화:**
> Q: "DLQ와 Lambda Destinations의 차이와 권장은 어느 쪽인가?"
> A: **DLQ(레거시):** 실패한 이벤트만 SQS 또는 SNS에 전송. 원본 이벤트 페이로드만 포함된다. Lambda 함수의 리소스로 설정. **Lambda Destinations(권장):** 성공 시와 실패 시 모두 이벤트를 전송 가능. 전송 대상은 Lambda, SQS, SNS, EventBridge의 4가지. 이벤트에는 원본 페이로드에 더하여 요청 컨텍스트, 응답/에러 정보가 포함된다. AWS는 Destinations의 사용을 권장하고 있다. **중요한 차이:** DLQ는 비동기 호출의 재시도 후 최종적인 실패에만 작동한다. Destinations는 Event Source Mapping(SQS, Kinesis 등)의 배치 처리 실패에도 대응한다(OnFailure Destination).
> Q: "비동기 호출의 재시도 동작은 어떻게 되어 있는가?"
> A: Lambda 함수가 비동기로 호출되면, 이벤트는 내부 큐에 저장된다. 최초 실행이 실패하면, 기본으로 최대 2회 재시도된다(MaximumRetryAttempts: 0~2로 설정 가능). 재시도 간격은 1분 -> 2분(지수 백오프). 이벤트의 최대 보존 기간은 MaximumEventAge로 설정(60초~6시간, 기본 6시간). 보존 기간 내에 재시도가 모두 실패하면, DLQ 또는 Destinations의 OnFailure에 전송된다. 어느 쪽도 설정되어 있지 않으면, 이벤트는 폐기된다.

**현실 세계의 비유 (비IT 대상):**
> "DLQ = 우체국의 부재 통지함. 배달에 실패한 우편물을 임시 보관하고, 나중에 재배달한다. Lambda Destinations = 고도의 배송 추적 시스템. 배달 성공 시는 수령 확인을 발신자에게 통지, 배달 실패 시는 부재 통지 + 실패 이유 + 재배달 옵션을 포함한 상세 리포트를 발신자와 관리자에게 보낸다."

---

### Lambda VPC 설정

**정의:** Lambda 함수를 VPC 내의 리소스(RDS, ElastiCache, 내부 ALB 등)에 접근시키기 위한 설정. Lambda 함수에 VPC의 서브넷과 보안 그룹을 지정하면, ENI(Elastic Network Interface)가 VPC 내에 생성되어 프라이빗 리소스로의 접근이 가능해진다. 다만, VPC 내의 Lambda는 기본적으로 인터넷 접근이 불가능하다.

**소크라테스식 심화:**
> Q: "VPC 내의 Lambda 함수가 인터넷에 접근하려면 어떻게 해야 하는가?"
> A: VPC 내의 Lambda는 퍼블릭 서브넷에 배치해도 인터넷 접근이 불가능하다(퍼블릭 IP가 부여되지 않기 때문). 인터넷 접근이 필요한 경우, 프라이빗 서브넷에 Lambda를 배치하고, 퍼블릭 서브넷에 NAT Gateway를 설치하여 라우팅한다. AWS 서비스(S3, DynamoDB, SQS 등)로의 접근에는 VPC 엔드포인트(Gateway/Interface)를 사용하면 NAT Gateway의 비용을 절약할 수 있다. **중요:** Lambda가 외부 API나 AWS 서비스에 접근할 필요가 없고, VPC 내 리소스에만 접근하는 경우에는 VPC 엔드포인트로 충분하다.
> Q: "VPC Lambda의 Cold Start에 대한 영향은?"
> A: 이전에는 VPC 내 Lambda의 Cold Start에 10초 이상 걸리는 경우가 있었지만, 2019년에 Hyperplane ENI가 도입되어 크게 개선되었다. 현재는 ENI 생성이 계정 레벨에서 공유되어, Cold Start 시의 오버헤드가 대폭 삭감되었다. 그래도 VPC 외부의 Lambda보다는 약간 느리다. 복수의 AZ(Availability Zone)의 서브넷을 지정하여 고가용성을 확보한다. 보안 그룹은 최소 권한 원칙에 따라 필요한 포트만 개방한다.

**현실 세계의 비유 (비IT 대상):**
> "VPC 내 Lambda = 사원 전용 사내 네트워크에 연결된 단말기. 사내 서버(RDS)에는 접근할 수 있지만, 외부 인터넷으로는 직접 나갈 수 없다. NAT Gateway = 사내 네트워크에서 외부 인터넷으로 나가기 위한 대리 게이트(프록시 서버). VPC 엔드포인트 = 특정 AWS 서비스에 직통하는 전용 통로(프록시를 거치지 않고 직접 연결)."

---

## 아키텍처 패턴

### 패턴1: API Gateway + Lambda + DynamoDB (서버리스 REST API)

```
Client (Browser/Mobile)
         |
         v
    API Gateway
    (REST API / HTTP API)
    [인증: Cognito/JWT]
    [스로틀링: 10,000 RPS]
         |
    ┌────┼────┐
    v    v    v
  GET  POST  DELETE
  Lambda Lambda Lambda
    |    |    |
    v    v    v
    DynamoDB
    (On-Demand Capacity)
         |
         v
    DynamoDB Streams
         |
         v
    Lambda (후처리)
    ┌────┴────┐
    v         v
  SNS    CloudWatch
  (통지)   (메트릭스)
```

- 완전 서버리스의 REST API 구성
- API Gateway에서 인증/인가, 속도 제한을 일원 관리
- DynamoDB On-Demand로 자동 스케일링
- DynamoDB Streams로 변경을 실시간 처리(CQRS 패턴)
- Lambda 함수는 마이크로서비스로서 기능별로 분리

### 패턴2: S3 이벤트 -> Lambda (파일 처리 파이프라인)

```
User Upload
    |
    v
  S3 Bucket
  (raw-uploads/)
    |
    v
S3 Event Notification
    |
    v
  Lambda (Validator)
  [파일 형식 체크]
  [바이러스 스캔]
    |
  ┌─┴─┐
  v    v
 OK   NG
  |    |
  v    v
S3     SQS DLQ
(processed/)  (부정 파일 통지)
  |
  v
Lambda (Processor)
[이미지 리사이즈/PDF 변환/메타데이터 추출]
  |
  v
S3 (output/) + DynamoDB (메타데이터)
  |
  v
SNS (처리 완료 통지)
```

- S3의 PutObject 이벤트로 Lambda를 자동 기동
- 검증 -> 처리 -> 저장의 파이프라인
- 실패 파일은 DLQ로 관리
- /tmp 디렉토리(최대 10GB)로 임시 파일 처리
- 큰 파일은 S3 presigned URL로 다운로드/업로드

### 패턴3: Step Functions 오케스트레이션 (복잡한 워크플로우)

```
API Gateway
    |
    v
Step Functions (Standard)
    |
    v
┌─ Task: 입력 검증 (Lambda)
│     |
│  Choice: 검증 결과
│  ├─ OK → Task: 결제 처리 (Lambda)
│  │         |
│  │      Choice: 결제 결과
│  │      ├─ 성공 → Parallel:
│  │      │         ├─ Task: 재고 업데이트 (Lambda → DynamoDB)
│  │      │         ├─ Task: 배송 수배 (Lambda → SQS)
│  │      │         └─ Task: 통지 전송 (Lambda → SES)
│  │      │              |
│  │      │           Succeed
│  │      └─ 실패 → Task: 에러 통지 (SNS)
│  │                   |
│  │                 Fail
│  └─ NG → Task: 검증 에러 통지
│              |
│           Fail
│
└─ Retry: Lambda.ServiceException (3회, Backoff 2.0)
   Catch: States.ALL → Task: 에러 핸들링
```

- 복수의 Lambda 함수를 순서대로 실행
- Choice 스테이트로 조건 분기
- Parallel 스테이트로 병렬 처리
- Retry/Catch로 에러 핸들링을 워크플로우 레벨에서 관리
- 실행 이력이 Step Functions 콘솔에서 가시화

### 패턴4: 팬아웃 패턴 (SNS -> 복수 Lambda)

```
    EventBridge
    (주문 완료 이벤트)
         |
         v
    SNS Topic
    (order-events)
    ┌────┬────┬────┬────┐
    v    v    v    v    v
  SQS  SQS  Lambda Lambda Kinesis
  (재고) (배송) (메일) (감사) (분석)
    |    |    |      |      |
    v    v    v      v      v
 Lambda Lambda SES  DynamoDB Firehose
 (처리)  (처리)       (로그)  → S3
```

- 하나의 이벤트에서 복수의 컨슈머에 동시 배포
- SQS 버퍼링으로 처리 속도 차이를 흡수
- Lambda 직접 호출(경량 처리)과 SQS 경유(무거운 처리)를 구분하여 사용
- 각 컨슈머는 독립적으로 스케일/배포 가능
- SNS 메시지 필터링으로 관련 이벤트만 배포

### 패턴5: 이벤트 구동 아키텍처 (EventBridge -> Lambda)

```
┌─────────────────────────────┐
│       Event Sources         │
│  ┌─────┐ ┌─────┐ ┌──────┐  │
│  │ S3  │ │ EC2 │ │Custom│  │
│  │Event│ │State│ │ App  │  │
│  └──┬──┘ └──┬──┘ └──┬───┘  │
└─────┼───────┼───────┼──────┘
      └───────┼───────┘
              v
        EventBridge
        (Custom Event Bus)
              |
     ┌────────┼────────┐
     v        v        v
  Rule A   Rule B   Rule C
  (S3)     (EC2)    (Custom)
     |        |        |
     v        v        v
  Lambda   Lambda   Step Functions
  (파일     (통지    (비즈니스
   처리)    전송)    워크플로우)
     |        |        |
     v        v        v
  DynamoDB  Slack   복수 Lambda
              +      + DynamoDB
            PagerDuty + S3
```

- EventBridge로 이벤트를 일원 관리
- 규칙 기반의 라우팅으로 적절한 타겟에 분배
- 프로듀서와 컨슈머의 완전한 느슨한 결합
- Archive & Replay로 디버그와 복구
- Schema Registry로 이벤트 구조를 관리

## SAA 시험 포인트

| 토픽 | 출제 포인트 | 키워드 |
|------|-----------|--------|
| Lambda 제한값 | 타임아웃 최대 15분(900초), 메모리 128MB~10GB, 동기 페이로드 6MB, 비동기 페이로드 256KB, 배포 패키지 50MB(zip)/250MB(해제 후), /tmp 최대 10GB | 15분, 10GB, 6MB, 256KB |
| Cold Start 최적화 | Provisioned Concurrency, 메모리 증가, 패키지 크기 축소, SnapStart(Java), Layers 활용, VPC 외부 배치 | Provisioned Concurrency, SnapStart |
| API Gateway 스로틀링 | 기본 10,000 RPS(요청/초), 버스트 5,000. 계정 레벨의 제한. 사용량 플랜과 API 키로 클라이언트별 제한. 429 Too Many Requests | 10,000 RPS, 429, 사용량 플랜 |
| Step Functions Standard vs Express | Standard: 최대 1년, exactly-once, 상태 전이 과금. Express: 최대 5분, at-least-once, 실행 시간 과금. Express 동기/비동기 | 1년 vs 5분, exactly-once vs at-least-once |
| Lambda@Edge 제한 | Viewer: 최대 5초, 128MB. Origin: 최대 30초, 10GB. Node.js/Python 대응. us-east-1에서 배포 필수 | 5초/30초, us-east-1 |
| Provisioned vs Reserved Concurrency | Provisioned: Cold Start 제거, 유료, Auto Scaling 연계. Reserved: 동시 실행 할당량 확보, 무료, Cold Start 있음 | Provisioned=워밍업, Reserved=예약 |
| Lambda 실행 역할 vs 리소스 기반 정책 | 실행 역할: Lambda -> 다른 서비스로의 접근 권한(IAM Role). 리소스 기반 정책: 다른 서비스 -> Lambda 호출 권한 | 실행 역할=나가는 것, 리소스 정책=들어오는 것 |
| VPC Lambda Cold Start 완화 | Hyperplane ENI(2019년 도입), 복수 AZ 서브넷 지정, NAT Gateway/VPC 엔드포인트, Provisioned Concurrency | Hyperplane ENI, NAT Gateway |
| Lambda Layers | 최대 5 Layers/함수, 합계 250MB(해제 후). 공통 라이브러리 공유, 런타임 커스터마이즈. /opt/ 디렉토리에 마운트 | 5 Layers, 250MB, /opt/ |
| X-Ray 트레이싱 통합 | Lambda Active Tracing 활성화, X-Ray SDK로 서브세그먼트 생성, 환경 변수 AWS_XRAY_TRACING_NAME, 샘플링 규칙 적용 | Active Tracing, X-Ray SDK |
| API Gateway 캐싱 | REST API만 지원(HTTP API는 미지원). TTL: 0~3600초(기본 300초). 스테이지 단위로 활성화. 캐시 용량 0.5~237GB | REST API만, TTL 300초 |
| Lambda 동시 실행 계산 | 동시 실행 수 = 1초당 요청 수 x 평균 실행 시간(초). 예: 100 RPS x 0.5초 = 50 동시 실행 | RPS x 실행 시간 |

## 핸즈온 참조

**관련 CDK 프로젝트:** `cdk-projects/03-monitoring-observability/` (EventBridge + X-Ray 통합)

### 권장 핸즈온 절차

1. **Lambda 함수의 기본 작성:**
   - Node.js/Python의 Hello World 함수 작성
   - 메모리/타임아웃 설정과 동작 확인
   - 환경 변수의 설정과 참조
   - CloudWatch Logs에서의 실행 로그 확인

2. **API Gateway + Lambda 통합:**
   - HTTP API의 작성과 Lambda Proxy 통합의 설정
   - CORS 설정과 커스텀 도메인 설정
   - 스테이지(dev/prod) 작성과 배포
   - 스로틀링 설정의 테스트

3. **S3 이벤트 트리거:**
   - S3 버킷의 작성과 이벤트 통지 설정
   - Lambda 함수로 업로드 파일을 처리
   - DLQ의 설정과 에러 처리 확인
   - Lambda Destinations의 설정

4. **Step Functions 워크플로우:**
   - 간단한 순차 실행 워크플로우의 작성
   - Choice/Parallel 스테이트의 추가
   - Retry/Catch의 설정과 에러 핸들링 테스트
   - Map state에서의 배치 처리

5. **Lambda VPC 설정:**
   - VPC 내 Lambda 함수의 작성
   - NAT Gateway와 VPC 엔드포인트의 설정
   - RDS/ElastiCache로의 접근 확인
   - 보안 그룹의 설정

## Well-Architected 체크리스트

### Operational Excellence (운영 우수성)
- [ ] Lambda 함수의 로그가 CloudWatch Logs에 구조화 형식(JSON)으로 출력되고 있는가
- [ ] Lambda 함수에 X-Ray Active Tracing이 활성화되어 있는가
- [ ] Lambda Destinations 또는 DLQ가 비동기 호출 함수에 설정되어 있는가
- [ ] Step Functions의 워크플로우에 적절한 Retry/Catch 설정이 있는가
- [ ] API Gateway의 접근 로그와 CloudWatch 메트릭스가 활성화되어 있는가
- [ ] Lambda 함수의 배포가 CI/CD 파이프라인(CodePipeline, GitHub Actions 등)으로 자동화되어 있는가
- [ ] Lambda 함수의 Alias와 Versioning을 사용하여 블루/그린 배포가 가능한가

### Performance Efficiency (성능 효율)
- [ ] Lambda 함수의 메모리 설정이 AWS Lambda Power Tuning으로 최적화되어 있는가
- [ ] Cold Start가 허용 범위 내인가. 필요에 따라 Provisioned Concurrency가 설정되어 있는가
- [ ] Lambda Layers로 공통 라이브러리가 공유되어 배포 패키지가 최소화되어 있는가
- [ ] API Gateway의 캐싱이 적절히 설정되어 있는가(REST API의 경우)
- [ ] DynamoDB의 Read/Write Capacity가 워크로드에 적절한가(On-Demand vs Provisioned)
- [ ] Lambda 함수의 핸들러 외부에서 DB 연결이나 SDK 클라이언트를 초기화하여, 연결 재사용을 수행하고 있는가

### Cost Optimization (비용 최적화)
- [ ] Lambda 함수의 타임아웃이 적절히 설정되어 있는가(무한 실행 방지)
- [ ] API Gateway는 REST API와 HTTP API 중 어느 쪽이 적절한지 평가했는가(HTTP API는 70% 저렴)
- [ ] Step Functions는 Standard와 Express 중 어느 쪽이 적절한지 평가했는가
- [ ] VPC 내 Lambda의 NAT Gateway 비용을 최소화하기 위해 VPC 엔드포인트를 사용하고 있는가
- [ ] Lambda 함수의 실행 시간과 메모리를 정기적으로 재검토하여, 과도한 리소스 할당을 배제하고 있는가
- [ ] Provisioned Concurrency를 스케줄 기반으로 조정하여, 불필요한 시간대의 비용을 절감하고 있는가

### Reliability (신뢰성)
- [ ] Lambda 함수가 복수 AZ의 서브넷에 배치되어 있는가(VPC 내의 경우)
- [ ] 비동기 호출의 함수에 DLQ 또는 Destinations가 설정되어 있는가
- [ ] Step Functions의 워크플로우에 적절한 에러 핸들링(Retry/Catch)이 있는가
- [ ] Lambda 함수의 Reserved Concurrency가 설정되어, 다른 함수의 영향을 받지 않는가
- [ ] API Gateway의 스로틀링 설정으로 백엔드의 과부하를 방지하고 있는가
- [ ] SQS와 Lambda의 통합에서 batchSize, maxBatchingWindow, maxConcurrency가 적절히 설정되어 있는가

### Security (보안)
- [ ] Lambda 실행 역할이 최소 권한 원칙을 따르고 있는가(와일드카드 리소스 미사용)
- [ ] API Gateway에 적절한 인증/인가(Cognito, Lambda Authorizer, IAM)가 설정되어 있는가
- [ ] Lambda 함수의 환경 변수에서 시크릿 정보는 SSM Parameter Store(SecureString) 또는 Secrets Manager를 사용하고 있는가
- [ ] VPC 내 Lambda 함수의 보안 그룹이 최소한의 아웃바운드 규칙만 허용하고 있는가
- [ ] Lambda 함수의 리소스 기반 정책이 불필요한 호출자를 허용하고 있지 않은가
- [ ] API Gateway에 커스텀 도메인을 설정하고, TLS 1.2 이상을 강제하고 있는가
