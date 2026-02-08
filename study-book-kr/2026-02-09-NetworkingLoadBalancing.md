# 섹션06: 네트워크 & 로드 밸런싱
> Well-Architected Pillars: Reliability, Performance Efficiency
> Day: 2 | 난이도: 중급

## 개요

AWS의 네트워크와 로드 밸런싱은 고가용성 및 고성능 아키텍처의 기반을 구성한다. Elastic Load Balancing(ELB)은 트래픽을 여러 타깃에 분산하여, 단일 장애점을 제거한다. ALB(Application Load Balancer)는 HTTP/HTTPS 레벨의 인텔리전트한 라우팅을 제공하고, NLB(Network Load Balancer)는 초저지연의 TCP/UDP 분산을 담당한다.

Route 53은 AWS의 DNS 서비스이며, 도메인 이름의 해석에 더해 헬스 체크 기반의 페일오버, 지리적 라우팅, 가중 라우팅 등의 고급 트래픽 관리를 제공한다. 100% SLA를 보장하는 유일한 AWS 서비스이며, 글로벌 인프라스트럭처 위에서 동작한다.

SAA 시험에서는 ALB와 NLB의 사용 구분, Route 53의 라우팅 정책 선택, SSL/TLS의 종단 위치, 그리고 이러한 서비스를 조합한 고가용성 아키텍처의 설계가 자주 출제된다. OSI 모델의 이해가 ALB(Layer 7)와 NLB(Layer 4)의 판단 근거가 된다.

## 핵심 개념

### OSI 7계층 모델과 로드 밸런서의 동작 레이어

**정의:** OSI(Open Systems Interconnection) 참조 모델은 네트워크 통신을 7개의 계층으로 분류한 개념 모델이다. 각 계층은 독립된 기능을 가지며, 상위 계층은 하위 계층의 서비스를 이용한다. ALB는 Layer 7(애플리케이션 계층), NLB는 Layer 4(트랜스포트 계층)에서 동작한다.

**소크라테스식 심화:**
> Q: "OSI 7계층 모델이란 무엇인가? 왜 로드 밸런서의 이해에 필요한가?"
> A: 우편 시스템의 계층 구조에 비유하자. Layer 1(물리 계층)=도로 그 자체. 신호를 물리적으로 전송한다. Layer 2(데이터 링크 계층)=우편 트럭. 같은 도로 위의 인접 노드 간 통신을 관리한다(MAC 주소). Layer 3(네트워크 계층)=주소 체계(IP 주소). 어떤 경로로 전달할지 결정한다. Layer 4(트랜스포트 계층)=배송 센터의 분류(포트 번호). 같은 주소 내의 "누구 앞"인지 특정한다. Layer 7(애플리케이션 계층)=편지의 내용을 읽고 판단하는 계층(HTTP, URL, Cookie 등). NLB는 Layer 4에서 동작하며, 주소 라벨(IP와 포트)만 보고 분류한다. ALB는 Layer 7에서 편지 내용(HTTP 헤더, URL 경로)까지 읽어서 적절한 수신처로 분배한다.
> Q: "그럼, Layer 4만 보는 NLB의 장점은 무엇인가?"
> A: 편지 내용을 읽지 않으므로 처리가 압도적으로 빠르다. NLB는 수백만 리퀘스트/초를 처리할 수 있으며, 지연은 마이크로초 수준이다. ALB는 HTTP 헤더 해석이 필요하므로 밀리초 수준이다. 금융 거래 시스템이나 게임 서버처럼 1밀리초의 지연이 문제가 되는 경우에는 NLB가 적절하다. 반면, URL 경로나 호스트 이름에 기반한 분배가 필요한 웹 애플리케이션에는 ALB가 필수이다.

**현실 세계의 비유 (비IT 대상):**
> "공항의 수하물 분류. NLB는 목적지 태그(도쿄행, 오사카행)만 읽는 벨트 컨베이어. 고속이지만 내용물은 보지 않는다. ALB는 세관 검사관으로, 짐을 열어 내용물을 확인하고, 내용에 따라 특별한 처리(검역, 면세 수속 등)로 분류한다. 내용을 보기 때문에 시간이 걸리지만, 더 지능적인 판단이 가능하다."

### DNS (Domain Name System)

**정의:** DNS는 도메인 이름(예: example.com)을 IP 주소(예: 93.184.216.34)로 변환하는 분산형 네이밍 시스템이다. Route 53은 AWS가 제공하는 고가용성 및 고확장성 DNS 서비스로, 도메인 등록, DNS 해석, 헬스 체크 기능을 통합한다.

**소크라테스식 심화:**
> Q: "DNS란 무엇인가? 왜 인터넷에 불가결한가?"
> A: 인터넷의 전화번호부이다. 이름(google.com)은 기억할 수 있지만, 네트워크(전화망)는 번호(142.250.80.46)가 필요하다. DNS가 이름에서 번호로의 변환을 담당한다. 전화번호부가 없으면 모든 웹사이트의 IP 주소를 암기해야 한다. DNS의 해석 프로세스는 다음과 같다: 브라우저 → 로컬 캐시 → ISP의 DNS 리졸버 → 루트 네임 서버(.com 담당을 안내) → TLD 네임 서버(example.com 담당을 안내) → 권위 네임 서버(IP 주소를 반환).
> Q: "그럼, Route 53의 Hosted Zone이란 무엇인가?"
> A: 전화번호부의 "섹션"과 같은 것이다. Public Hosted Zone은 인터넷상의 누구나 조회할 수 있는 공개 전화번호부이다. Private Hosted Zone은 VPC 내부에서만 조회할 수 있는 사내 전화번호부이다. 같은 도메인 이름이라도, 사외에서와 사내에서 다른 IP를 반환할 수 있다(Split-horizon DNS).

**현실 세계의 비유 (비IT 대상):**
> "전화번호 안내(114)와 같은 것이다. '김철수 씨의 전화번호는?'이라고 물으면 번호를 알려준다. Route 53은 초고속 및 고신뢰의 전화번호 안내 서비스로, 나아가 '김 씨가 전화를 받지 않으면, 대신 이 씨에게 연결'(페일오버)과 같은 고급 기능도 가지고 있다."

### SSL/TLS 와 로드 밸런서에서의 종단

**정의:** TLS(Transport Layer Security)는 통신을 암호화하는 프로토콜이다. SSL(Secure Sockets Layer)은 TLS의 전신으로 비권장이지만 명칭은 관용적으로 사용된다. TLS 종단(Termination)이란 로드 밸런서에서 TLS 암호화를 복호화하고, 백엔드로는 평문(또는 재암호화)으로 통신하는 구성을 말한다.

**소크라테스식 심화:**
> Q: "SSL/TLS란 무엇인가? 왜 중요한가?"
> A: 수업 중에 잠금 장치가 달린 상자로 메모를 전달하는 것과 같다. 당신과 친구만 열쇠를 가지고 있다. 선생님(패킷을 가로채는 자)이 상자를 잡아도 안의 메모는 읽을 수 없다. TLS(Transport Layer Security)는 현대판, SSL(Secure Sockets Layer)은 구명칭이지만 구어적으로 남아 있다. TLS 핸드셰이크는 처음에 키를 교환하는 악수 의식으로, 다음 단계로 진행한다: (1) Client Hello(사용 가능한 암호 방식 제시) → (2) Server Hello(암호 방식 결정 + 인증서 전송) → (3) 키 교환 → (4) 암호화 통신 개시.
> Q: "그럼, 로드 밸런서에서 TLS를 종단하는 장점은 무엇인가?"
> A: 백엔드의 EC2 인스턴스에서 TLS 처리(암호화 및 복호화)의 부하를 제거할 수 있다. TLS 처리는 CPU 부하가 높기 때문에, 이를 로드 밸런서에 오프로드함으로써, 백엔드는 비즈니스 로직에 집중할 수 있다. 또한, SSL 인증서 관리가 로드 밸런서 한 곳에서 완료되며, ACM(AWS Certificate Manager)과의 통합으로 인증서 자동 갱신도 가능해진다.

**현실 세계의 비유 (비IT 대상):**
> "회사 접수처에서 방문자의 ID 체크(TLS)를 일괄적으로 수행하여, 각 부서(백엔드)는 업무에 집중할 수 있다. 각 부서가 개별적으로 ID 체크하는 것보다 효율적이며, ID 체크 절차 변경도 접수처 한 곳에서 대응하면 된다."

### ALB (Application Load Balancer)

**정의:** Layer 7에서 동작하는 로드 밸런서. HTTP/HTTPS 리퀘스트의 내용(URL 경로, 호스트 헤더, HTTP 메서드, 쿼리 문자열 등)에 기반한 인텔리전트한 라우팅을 제공한다. 리스너(Listener)에서 포트와 프로토콜을 수신하고, 룰(Rule)로 조건을 평가하며, 타깃 그룹(Target Group)에 트래픽을 분배한다.

**소크라테스식 심화:**
> Q: "ALB의 경로 기반 라우팅과 호스트 기반 라우팅의 사용 구분은?"
> A: 경로 기반은 "같은 도메인의 다른 URL"로 분배. `example.com/api/*` → API 서버군, `example.com/static/*` → 정적 콘텐츠 서버군. 호스트 기반은 "다른 서브도메인"으로 분배. `api.example.com` → API 서버군, `web.example.com` → 웹 서버군. 마이크로서비스 아키텍처에서는 둘 다 조합하는 경우가 많다.
> Q: "ALB의 Sticky Session은 왜 필요하지만, 왜 피해야 하는가?"
> A: 레거시 애플리케이션이 세션 정보를 서버 메모리에 보유하는 경우, 같은 사용자의 리퀘스트를 같은 서버에 보낼 필요가 있다(Sticky Session). 그러나 이로 인해 특정 서버에 부하가 편중되고, 그 서버가 다운되면 세션 정보가 유실된다. 베스트 프랙티스는 ElastiCache(Redis/Memcached)나 DynamoDB에 외부 세션 스토어를 구축하여, 스테이트리스 아키텍처로 만드는 것이다.

**현실 세계의 비유 (비IT 대상):**
> "종합병원의 종합 접수처. 증상(URL 경로)을 듣고 내과(백엔드A), 외과(백엔드B), 안과(백엔드C)로 분배한다. 소개장의 도메인(호스트명)을 보고 다른 병원으로 전송하는 것도 가능하다."

### NLB (Network Load Balancer)

**정의:** Layer 4에서 동작하는 로드 밸런서. TCP/UDP/TLS 프로토콜에 기반한 초고속 트래픽 분산을 제공한다. 정적 IP 주소의 할당, Elastic IP의 연결이 가능하다. 수백만 리퀘스트/초를 처리할 수 있으며, 지연은 마이크로초 수준이다.

**소크라테스식 심화:**
> Q: "NLB가 정적 IP를 가질 수 있는 것이 왜 중요한가?"
> A: 방화벽의 화이트리스트를 생각해 보자. 기업의 보안 정책에서 "특정 IP 주소로부터의 통신만 허용"이라고 정해져 있는 경우, ALB는 IP가 동적으로 변하기 때문에 대응할 수 없다. NLB는 각 AZ에 정적 IP를 가질 수 있으므로, 방화벽 규칙에 고정 IP를 등록할 수 있다. 또한, DNS 이름이 아닌 IP 주소로 직접 접속해야 하는 레거시 시스템과의 연계에도 불가결하다.
> Q: "NLB의 소스 IP 보존이란 무엇인가?"
> A: ALB는 클라이언트의 실제 IP 주소를 X-Forwarded-For 헤더로 교체한다(프록시 동작). NLB는 클라이언트의 원본 IP 주소를 그대로 백엔드에 전달한다. 액세스 로그에서 클라이언트의 실제 IP가 필요한 경우나, IP 제한을 수행하는 경우에 NLB가 유리하다.

**현실 세계의 비유 (비IT 대상):**
> "고속도로의 톨게이트. 차의 번호판(IP)과 목적지 출구 번호(포트)만 보고, 가장 여유 있는 레인으로 분배한다. 짐의 내용물은 확인하지 않으므로 처리가 매우 빠르다."

### ALB vs NLB 판단 매트릭스

**정의:** 워크로드의 특성에 따라 ALB와 NLB를 적절히 선택하기 위한 판단 기준.

**소크라테스식 심화:**
> Q: "어떤 경우에 ALB를 선택하고, 어떤 경우에 NLB를 선택하는가?"
> A: 다음의 판단 기준으로 선택한다. ALB를 선택하는 경우: (1) HTTP/HTTPS 트래픽 (2) URL 경로나 호스트명에 의한 라우팅이 필요 (3) WebSocket 대응이 필요 (4) WAF와의 통합이 필요 (5) Cognito 인증의 통합이 필요. NLB를 선택하는 경우: (1) TCP/UDP 프로토콜 (2) 초저지연이 요구됨 (3) 정적 IP가 필요 (4) 수백만 리퀘스트/초의 처리가 필요 (5) 소스 IP의 보존이 필요 (6) VPC 엔드포인트(PrivateLink)에서의 공개가 필요.
> Q: "둘 다 사용하는 경우가 있는가?"
> A: 있다. NLB 뒤에 ALB를 배치하는 패턴. NLB의 정적 IP + ALB의 Layer 7 라우팅이 모두 필요한 경우에 사용한다. 예를 들어, 방화벽의 화이트리스트에 고정 IP가 필요하지만, 경로 기반 라우팅도 수행하고 싶은 케이스.

### Route 53 라우팅 정책

**정의:** Route 53이 DNS 쿼리에 응답할 때의 레코드 선택 방식. 트래픽 관리 요구 사항에 따라 6가지 라우팅 정책에서 선택한다.

**소크라테스식 심화:**
> Q: "6가지 라우팅 정책의 사용 구분은?"
> A: (1) Simple(심플): 하나의 리소스로의 표준 라우팅. 헬스 체크 없음. (2) Weighted(가중): 트래픽의 비율을 지정. Blue/Green 배포에서 새 버전에 10%, 구 버전에 90% 등. (3) Latency(레이턴시): 가장 지연이 적은 리전으로 라우팅. 글로벌 애플리케이션 대상. (4) Failover(페일오버): 프라이머리가 비정상인 경우 세컨더리로 전환. DR(재해 복구) 구성. (5) Geolocation(지리): 사용자의 물리적 위치에 기반하여 라우팅. 콘텐츠의 로컬라이즈나 법적 규제 대응. (6) Multivalue Answer(다중값 응답): 최대 8개의 정상 레코드를 랜덤으로 반환. 간이적인 로드 밸런싱.
> Q: "Latency와 Geolocation의 차이는?"
> A: Latency는 네트워크 지연에 기반한다. 도쿄의 사용자라도, ap-northeast-1보다 us-west-2의 지연이 낮은 경우 us-west-2로 라우팅된다. Geolocation은 물리적 위치에 기반한다. 일본의 사용자는 반드시 ap-northeast-1로 라우팅된다(그렇게 설정한 경우). 법적으로 데이터를 특정 리전에 보관해야 하는 경우에는 Geolocation을 사용한다.

**현실 세계의 비유 (비IT 대상):**
> "고객 지원 전화 분배. Simple=한 명의 담당자에게 전체 콜. Weighted=신입에게 20%, 베테랑에게 80%. Latency=가장 빨리 응답할 수 있는 오퍼레이터에게 접속. Failover=메인 담당이 부재 시 대리에게 돌린다. Geolocation=한국어 사용자는 한국 오퍼레이터에게, 영어 사용자는 미국 오퍼레이터에게."

### Alias Record (에일리어스 레코드)

**정의:** Route 53 고유의 레코드 타입. AWS 리소스(ELB, CloudFront, S3 정적 웹사이트, 별도의 Route 53 레코드 등)를 직접 가리키는 DNS 레코드. CNAME과 달리, Zone Apex(네이키드 도메인)에서도 사용 가능하며, AWS 리소스로의 쿼리 요금이 무료이다.

**소크라테스식 심화:**
> Q: "Alias 레코드와 CNAME의 차이는 무엇인가?"
> A: 전화의 단축 다이얼과 같은 것이다. CNAME은 "김 씨의 번호는 이 씨와 같습니다"라고 하고, 이 씨의 번호를 별도로 조회해야 한다(추가 DNS 쿼리). Alias는 직접 "김 씨의 번호는 010-xxxx-xxxx입니다"라고 반환한다(추가 쿼리 불필요). 나아가 중요한 차이: (1) Alias는 zone apex(example.com 자체)에서 사용할 수 있지만, CNAME은 사용할 수 없다(RFC 제약). (2) AWS 리소스를 가리키는 Alias 쿼리는 무료. (3) Alias는 AWS 리소스의 IP 주소 변경을 자동 추적한다.
> Q: "zone apex에서 CNAME을 사용할 수 없는 것이 왜 중요한가?"
> A: example.com(네이키드 도메인)을 ELB로 향하게 하고 싶은 경우, CNAME은 사용할 수 없다. Alias라면 가능하다. www.example.com이라면 CNAME으로도 되지만, example.com 자체에는 Alias가 필수이다. 시험에서는 "도메인의 apex를 ELB로 향하게 하는 방법"으로 출제된다.

**현실 세계의 비유 (비IT 대상):**
> "회사의 대표 전화와 같은 것이다. CNAME은 '대표 전화에 걸면, 영업부(다른 번호)로 전송됩니다'라는 전송 설정. Alias는 '대표 전화를 받으면, 직접 영업부가 응답합니다'라는 직통 설정. 전송 단계가 없는 만큼 빨리 연결된다."

## 아키텍처 패턴

### 패턴1: 멀티AZ 고가용성 웹 애플리케이션

```
사용자 → Route 53 (Alias Record)
              |
              v
        ALB (Multi-AZ)
        /          \
       v            v
  AZ-a Target    AZ-c Target
  Group          Group
  [EC2, EC2]    [EC2, EC2]
```

- Route 53의 Alias 레코드로 ALB를 지정
- ALB는 여러 AZ에 배포(Cross-Zone Load Balancing은 기본 활성화)
- 각 AZ에 최소 2대의 인스턴스 배치
- 헬스 체크로 비정상 인스턴스를 자동 제외

### 패턴2: 마이크로서비스의 경로 기반 라우팅

```
ALB Listener (HTTPS:443)
    |
    ├── Rule: /api/users/*  → Target Group A (User Service)
    ├── Rule: /api/orders/* → Target Group B (Order Service)
    ├── Rule: /static/*     → Target Group C (S3 via Lambda)
    └── Default Action      → Target Group D (Frontend)
```

- 하나의 ALB로 여러 마이크로서비스에 라우팅
- 각 서비스는 독립된 Target Group으로 관리
- 서비스별로 스케일링 정책 설정 가능
- ACM의 인증서를 ALB에 설정하여 TLS를 종단

### 패턴3: 멀티 리전 페일오버

```
Route 53 (Failover Routing)
    |
    ├── Primary: us-east-1 ALB (Health Check: Healthy)
    │       └── EC2 instances
    └── Secondary: us-west-2 ALB (Standby)
            └── EC2 instances

Route 53 Health Check → Primary ALB의 헬스 체크 엔드포인트
  └── Unhealthy → Failover → Secondary ALB
```

- 프라이머리 리전의 헬스 체크가 실패하면 세컨더리로 자동 전환
- Route 53의 페일오버 라우팅으로 실현
- TTL을 짧게 설정하여 페일오버 시간을 단축
- RTO(Recovery Time Objective)는 TTL + 헬스 체크 간격에 의존

### 패턴4: NLB + PrivateLink 에서의 서비스 공개

```
서비스 프로바이더 측:
  NLB → Target Group → EC2 instances
    |
    v
  VPC Endpoint Service (PrivateLink)

서비스 컨슈머 측:
  Application → VPC Endpoint (Interface) → PrivateLink → NLB
```

- NLB를 전면에 배치한 서비스를 PrivateLink로 다른 어카운트에 공개
- 인터넷을 경유하지 않고, AWS 네트워크 내에서 안전하게 통신
- ALB에서는 PrivateLink를 직접 사용할 수 없음(NLB가 필요)

## SAA 시험 포인트

1. **ALB vs NLB의 선택:** HTTP/HTTPS라면 ALB, TCP/UDP라면 NLB. 정적 IP가 필요하면 NLB. WAF 통합이 필요하면 ALB. PrivateLink가 필요하면 NLB.

2. **Route 53 Alias vs CNAME:** Zone Apex에는 Alias 필수. AWS 리소스에는 Alias 권장(무료). 비AWS 리소스에는 CNAME. Alias의 타깃에 IP 주소를 직접 지정할 수 없다.

3. **Route 53 라우팅 정책:** DR에는 Failover. 글로벌 저지연에는 Latency. 카나리 배포에는 Weighted. 컴플라이언스 요구 사항에는 Geolocation.

4. **헬스 체크:** Route 53의 헬스 체크는 엔드포인트, 다른 헬스 체크(계산형), CloudWatch 알람의 3종류. ELB의 헬스 체크는 Target Group 레벨에서 설정.

5. **Cross-Zone Load Balancing:** ALB는 기본 활성화(무료). NLB는 기본 비활성화(활성화하면 AZ 간 통신 비용 발생).

6. **SSL 인증서:** ACM(AWS Certificate Manager)에서 무료 SSL 인증서를 취득하여, ALB/NLB에 설정. ACM의 인증서는 EC2에 직접 설치할 수 없다(ELB 또는 CloudFront 경유).

7. **Sticky Session:** ALB만. Application-based cookie(커스텀명)과 Duration-based cookie(AWSALB)의 2종류. NLB에는 Sticky Session 개념이 없다.

8. **Connection Draining (Deregistration Delay):** 타깃의 등록 해제 시 기존 연결을 완료시키기 위한 대기 시간. 기본 300초. 스케일링 시 기존 리퀘스트 보호에 중요.

9. **Route 53의 100% SLA:** Route 53은 100% 가용성 SLA를 보장하는 유일한 AWS 서비스. 글로벌로 분산된 DNS 인프라스트럭처로 실현.

10. **SNI (Server Name Indication):** ALB는 여러 SSL 인증서를 지원(SNI). 하나의 ALB로 여러 도메인(예: app1.com, app2.com)의 HTTPS 트래픽을 처리 가능.

## 핸즈온 참조

**CDK 프로젝트:** `cdk-projects/04-networking-loadbalancing/`

### 권장 핸즈온 절차

1. **ALB 구축:**
   - 리스너(HTTP:80, HTTPS:443) 설정
   - 타깃 그룹 생성과 EC2 등록
   - 경로 기반 라우팅 룰 추가
   - ACM 인증서 설정과 HTTP→HTTPS 리다이렉트

2. **NLB 구축:**
   - TCP:80 리스너 설정
   - Elastic IP 연결
   - 타깃 그룹 생성(IP 타깃 타입)

3. **Route 53 설정:**
   - Public Hosted Zone 생성
   - Alias 레코드(ALB를 가리키는) 생성
   - 헬스 체크 설정
   - 페일오버 라우팅 구성

4. **통합 테스트:**
   - curl 커맨드로 경로 기반 라우팅 확인
   - 특정 인스턴스 정지에 의한 헬스 체크 동작 확인
   - DNS 해석 테스트(`dig` 커맨드)

## Well-Architected 체크리스트

### Reliability (신뢰성)

- [ ] 로드 밸런서를 여러 AZ에 배포하고 있는가
- [ ] 헬스 체크가 적절히 설정되어, 비정상 타깃이 자동 제외되는가
- [ ] Route 53의 페일오버 라우팅으로 DR 구성을 구현하고 있는가
- [ ] Connection Draining이 활성화되어, 스케일링 시 기존 리퀘스트가 보호되는가
- [ ] Route 53의 헬스 체크 간격과 TTL이 적절히 설정되어 있는가

### Performance Efficiency (퍼포먼스 효율)

- [ ] 워크로드 특성에 따라 ALB/NLB를 적절히 선택하고 있는가
- [ ] Cross-Zone Load Balancing 설정이 트래픽 분산 패턴에 적절한가
- [ ] Route 53의 Latency 라우팅으로 글로벌 사용자의 지연을 최소화하고 있는가
- [ ] ALB의 Slow Start가 설정되어, 새로운 타깃으로의 급격한 부하를 방지하고 있는가

### Security (보안)

- [ ] ALB에 ACM의 SSL 인증서를 설정하여 HTTPS 통신을 강제하고 있는가
- [ ] ALB의 시큐리티 그룹이 적절히 제한되어 있는가
- [ ] WAF가 ALB에 연결되어, 일반적인 공격으로부터 보호되고 있는가
- [ ] HTTP→HTTPS 리다이렉트가 설정되어 있는가
