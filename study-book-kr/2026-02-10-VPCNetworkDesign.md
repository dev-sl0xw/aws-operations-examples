# 섹션10: VPC 네트워크 설계 (VPC Network Design)
> Well-Architected Pillars: Security, Reliability
> Day: 3 | 난이도: 중급

## 개요

VPC (Virtual Private Cloud)는 AWS 위에 구축하는 논리적으로 격리된 프라이빗 네트워크이다. 모든 AWS 리소스는 VPC 내에 배치되며, VPC의 설계는 보안, 가용성, 성능의 토대가 된다. 적절한 VPC 설계 없이는 안전하고 신뢰성 높은 아키텍처가 성립하지 않는다.

VPC 설계의 핵심은 CIDR 블록 설계, 서브넷 분할, 라우팅, 그리고 네트워크 액세스 제어이다. CIDR 블록은 한 번 생성하면 변경할 수 없으므로, 미래의 스케일링과 VPC 간 연결을 내다본 계획이 불가결하다. 서브넷은 Public, Private, Isolated의 3계층으로 나누고, 각각의 용도에 맞는 라우팅과 보안을 설정한다. Multi-AZ 배치는 신뢰성의 기본이며, 모든 프로덕션 워크로드에서 필수이다.

멀티 VPC 환경에서는 VPC Peering (1대1 연결), Transit Gateway (허브&스포크), VPC Endpoints (AWS 서비스로의 프라이빗 액세스)를 적절히 조합한다. 특히 VPC Endpoints는 보안 강화와 NAT 비용 절감 양쪽에 기여하므로, SAA 시험에서도 자주 출제되는 테마이다.

## 핵심 개념

### CIDR 설계 (CIDR Planning)

**정의:** CIDR (Classless Inter-Domain Routing)는 IP 주소 범위를 표기하는 방법이며, VPC에 할당하는 IP 주소 공간의 설계는 네트워크 아키텍처의 첫 번째 의사결정이 된다.

**소크라테스식 심화:**
> Q: "CIDR 표기법이란 무엇인가? /16이나 /24는 어떤 의미인가?"
> A: CIDR 표기법은 IP 주소의 범위를 '네트워크 주소/프리픽스 길이'로 나타낸다. 프리픽스 길이는 IP 주소의 선두 몇 비트가 네트워크 부분 (고정)인지를 나타낸다. IPv4는 32비트이므로 /16은 선두 16비트가 고정, 나머지 16비트가 호스트 부분 = 2^16 = 65,536 주소. /24는 선두 24비트가 고정, 나머지 8비트 = 2^8 = 256 주소. 프리픽스 숫자가 클수록 범위가 좁다.
> Q: "CIDR 설계를 잘못하면 어떻게 되는가?"
> A: (1) VPC의 CIDR는 생성 후 변경 불가 (확장은 Secondary CIDR로 가능하지만, 축소는 불가). (2) CIDR가 중복되는 VPC끼리는 Peering 연결할 수 없다. (3) CIDR가 너무 작으면 미래의 서브넷 추가나 IP 주소 부족에 빠진다. (4) 온프레미스 네트워크와 CIDR가 중복되면 VPN/Direct Connect 연결이 불가능해진다.

**현실 세계의 비유 (비IT 대상):**
> "거리의 주소 시스템. 10.0.0.0/16은 '10.0번지 블록 전체 (65,536호)'. /16은 처음 16비트가 고정 (거리 이름)이고, 나머지 16비트가 자유 (집 번호). /24라면 '10.0.1번지 구획 (256호)'. 숫자가 클수록 범위가 좁습니다"

**RFC 1918 프라이빗 IP 주소 범위:**

| 범위 | CIDR 블록 | 주소 수 | 일반적인 용도 |
|------|-------------|-----------|------------|
| Class A | 10.0.0.0/8 | 16,777,216 | 대규모 기업 네트워크 |
| Class B | 172.16.0.0/12 | 1,048,576 | 중규모 네트워크 |
| Class C | 192.168.0.0/16 | 65,536 | 소규모/가정용 네트워크 |

**AWS VPC의 CIDR 제약:**

- 최소: /28 (16 IP 주소)
- 최대: /16 (65,536 IP 주소)
- AWS 예약 IP (각 서브넷당 5개):
  - `.0` - 네트워크 주소
  - `.1` - VPC 라우터
  - `.2` - DNS 서버
  - `.3` - 향후 사용을 위해 AWS가 예약
  - `.255` (마지막 IP) - 브로드캐스트 주소 (VPC에서는 브로드캐스트 불가하지만 예약)
- **예:** /24 서브넷 (256 IP)에서 사용 가능한 IP는 256 - 5 = 251개
- Secondary CIDR 블록으로 확장 가능 (기본 최대 5개, 한도 상향 가능)

---

### 서브넷 설계 패턴 (Subnet Design Patterns)

**정의:** 서브넷은 VPC 내의 IP 주소 범위 구획이며, 용도에 따라 Public, Private, Isolated의 3계층으로 분류한다. 각 서브넷은 1개의 Availability Zone에 속한다.

**소크라테스식 심화:**
> Q: "왜 서브넷을 계층 (티어)으로 나누는가?"
> A: 보안의 다층 방어 원칙에 기반한다. 모든 리소스를 같은 서브넷에 배치하면, 외부에서 액세스 가능한 웹 서버가 침해된 경우 같은 네트워크 내의 데이터베이스에 직접 액세스할 수 있게 된다. 서브넷을 계층으로 나누고, 각 계층 간의 통신을 Security Group과 NACL로 제어함으로써, 하나의 계층이 침해되어도 다른 계층으로의 횡방향 이동 (Lateral Movement)을 방지할 수 있다.
> Q: "Multi-AZ 배치는 왜 필요한가?"
> A: AWS의 AZ (Availability Zone)는 물리적으로 분리된 데이터센터 그룹이다. 1개의 AZ에서 장애가 발생해도 다른 AZ의 리소스는 영향을 받지 않는다. 프로덕션 환경에서는 최소 2개의 AZ에 서브넷을 배치하고 리소스를 분산시킴으로써, 단일 AZ 장애 시의 가용성을 확보한다.

**3계층 서브넷 설계:**

```
VPC: 10.0.0.0/16
│
├── Public Subnet (AZ-a): 10.0.1.0/24
│     ├── Route: 0.0.0.0/0 → Internet Gateway
│     ├── 리소스: ALB, NAT Gateway, Bastion Host
│     └── 특징: 퍼블릭 IP 자동 할당 활성화
│
├── Public Subnet (AZ-c): 10.0.2.0/24
│     └── (동일 - Multi-AZ 이중화)
│
├── Private Subnet (AZ-a): 10.0.11.0/24
│     ├── Route: 0.0.0.0/0 → NAT Gateway (AZ-a)
│     ├── 리소스: EC2, ECS, Lambda
│     └── 특징: 인터넷으로의 아웃바운드만 가능
│
├── Private Subnet (AZ-c): 10.0.12.0/24
│     └── (동일 - Multi-AZ 이중화)
│
├── Isolated Subnet (AZ-a): 10.0.21.0/24
│     ├── Route: 로컬 라우트만
│     ├── 리소스: RDS, ElastiCache
│     └── 특징: 인터넷 액세스 완전 불가
│
└── Isolated Subnet (AZ-c): 10.0.22.0/24
      └── (동일 - Multi-AZ 이중화)
```

---

### 라우트 테이블 (Route Tables)

**정의:** 서브넷 내의 트래픽의 목적지를 결정하는 규칙 세트. 각 서브넷은 1개의 라우트 테이블에 연결된다.

**라우트 우선순위:** Longest Prefix Match (최장 프리픽스 일치)가 적용된다. 더 구체적인 (프리픽스가 긴) 라우트가 우선된다.

```
예: 목적지가 10.0.1.50인 패킷
  - 10.0.0.0/16 → local        (일치: /16)
  - 10.0.1.0/24 → peering-xxx  (일치: /24)  ← 이쪽이 우선 (더 구체적)
  - 0.0.0.0/0   → igw-xxx      (일치: /0)
```

**Main Route Table vs Custom Route Table:**

| 특징 | Main Route Table | Custom Route Table |
|------|-----------------|-------------------|
| 생성 | VPC 생성 시 자동 | 수동으로 생성 |
| 연결 | 명시적으로 연결되지 않은 서브넷에 적용 | 명시적으로 서브넷에 연결 |
| 모범 사례 | 로컬 라우트만 남김 | 서브넷의 용도에 맞는 라우트를 설정 |

---

### NAT Gateway vs NAT Instance

**정의:** NAT (Network Address Translation)는 프라이빗 서브넷 내의 리소스가 인터넷에 아웃바운드 통신할 때 프라이빗 IP를 퍼블릭 IP로 변환하는 메커니즘이다.

**소크라테스식 심화:**
> Q: "NAT Gateway란 무엇인가? 왜 프라이빗 서브넷에 필요한가?"
> A: 프라이빗 서브넷의 인스턴스는 퍼블릭 IP를 가지지 않으므로 직접 인터넷과 통신할 수 없다. 그러나 소프트웨어 업데이트나 외부 API 호출 등 아웃바운드 통신이 필요한 경우가 있다. NAT Gateway는 프라이빗 인스턴스 대신 인터넷과 통신하고, 응답을 원래의 인스턴스로 전달한다. 외부에서 프라이빗 인스턴스로의 직접 액세스는 계속 불가능하므로 보안이 유지된다.

**현실 세계의 비유 (비IT 대상):**
> "회사의 대표 전화번호와 같은 것입니다. 사내의 각 직원 (프라이빗 인스턴스)이 외부에 전화 (인터넷 통신)할 때 상대방에게는 회사의 대표번호만 보입니다. 외부에서 직원에게 직접 전화를 걸 수는 없습니다. 이것이 프라이빗 서브넷의 보안입니다"

**비교표:**

| 특징 | NAT Gateway | NAT Instance |
|------|-------------|--------------|
| 가용성 | AZ 내에서 이중화 (관리형) | 직접 Multi-AZ 구성을 설계 |
| 대역폭 | 최대 100 Gbps (자동 스케일) | 인스턴스 타입에 의존 |
| 유지보수 | AWS 관리 (패치 불필요) | 직접 OS/패치 관리 |
| 비용 | 시간 과금 + 데이터 처리 과금 | 인스턴스 과금만 |
| Security Group | 불가 (NACL만) | 적용 가능 |
| Bastion Host 겸용 | 불가 | 가능 |
| 포트 포워딩 | 불가 | 가능 |

**권장:** 프로덕션 환경에서는 NAT Gateway 일택. NAT Instance는 학습 목적 또는 비용 극소화가 필요한 검증 환경에서만 검토한다. Multi-AZ 구성에서는 AZ마다 NAT Gateway를 배치한다.

---

### Network ACLs vs Security Groups

**정의:** AWS에는 서브넷 레벨 (NACL)과 인스턴스 레벨 (Security Group)의 2계층 네트워크 필터링이 존재한다.

**소크라테스식 심화:**
> Q: "Stateful과 Stateless의 차이는 무엇인가?"
> A: Stateful (Security Group)은 통신의 '상태'를 기억한다. 인바운드로 허용한 통신의 리턴 트래픽 (응답)은 아웃바운드 규칙에 관계없이 자동으로 허용된다. Stateless (NACL)는 상태를 기억하지 않는다. 인바운드로 허용해도 응답의 아웃바운드는 별도로 명시적으로 허용해야 한다.
> Q: "둘 다 필요한가? Security Group만으로는 불충분한가?"
> A: Security Group은 '허용' 규칙만 있고 '거부' 규칙을 가질 수 없다. 특정 IP 주소로부터의 액세스를 명시적으로 차단하고 싶은 경우에는 NACL이 필요하다. 또한 NACL은 서브넷 전체에 적용되므로, Security Group의 설정 실수가 있어도 방어의 제2 계층으로 기능한다.

**현실 세계의 비유 (비IT 대상):**
> "클럽의 바운서 (입구 경비원). Stateful 바운서 (Security Group)는 당신이 들어온 것을 기억합니다. 나갈 때는 자동으로 통과시킵니다 (리턴 트래픽 허용). Stateless 바운서 (NACL)는 기억력이 없습니다. 들어올 때 신분증 확인, 나갈 때도 또 신분증 확인. 양쪽 규칙을 명시적으로 설정해야 합니다"

**상세 비교:**

| 특징 | Security Group | Network ACL |
|------|---------------|-------------|
| 레벨 | 인스턴스 (ENI) | 서브넷 |
| 상태 | Stateful | Stateless |
| 규칙 | 허용만 | 허용 AND 거부 |
| 평가 방법 | 모든 규칙을 평가 | 번호 순서로 평가 (첫 번째 일치로 결정) |
| 기본값 | 전 인바운드 거부, 전 아웃바운드 허용 | 전 인바운드 허용, 전 아웃바운드 허용 |
| 적용 | 명시적으로 인스턴스에 할당 | 서브넷 내의 모든 인스턴스에 자동 적용 |
| 규칙 수 | 기본 60 (상향 가능) | 20 (상향 가능) |

**NACL 규칙의 평가 순서:**

```
Rule 100: Allow TCP 443 from 0.0.0.0/0       ← HTTPS를 허용
Rule 200: Deny  TCP 443 from 203.0.113.0/24   ← 이 특정 IP 범위에서는 거부
Rule  *:  Deny  ALL  ALL from 0.0.0.0/0       ← 기본 거부

결과: 203.0.113.0/24로부터의 443 액세스는 Rule 100에서 먼저 매치되므로 허용됨!
→ 특정 IP를 거부하려면 허용 규칙보다 작은 번호 (예: Rule 50)에 거부 규칙을 배치한다
```

---

### VPC Flow Logs

**정의:** VPC 내의 네트워크 인터페이스 (ENI)를 흐르는 IP 트래픽의 메타데이터를 기록하는 서비스. 패킷의 내용이 아니라 헤더 정보 (송신원/수신처 IP, 포트, 프로토콜, 허용/거부)를 기록한다.

**캡처 포맷 (기본값):**

```
version account-id interface-id srcaddr dstaddr srcport dstport protocol packets bytes start end action log-status

2 123456789012 eni-abc123 10.0.1.50 10.0.2.100 49152 3306 6 20 4000 1620140661 1620140721 ACCEPT OK
```

**필드 설명:**
- `srcaddr / dstaddr`: 송신원/수신처 IP 주소
- `srcport / dstport`: 송신원/수신처 포트 (3306 = MySQL)
- `protocol`: 프로토콜 번호 (6 = TCP, 17 = UDP, 1 = ICMP)
- `action`: ACCEPT (허용) 또는 REJECT (거부)

**전송처 옵션:**

| 전송처 | 사용 사례 | 비용 고려 |
|--------|------------|-----------|
| CloudWatch Logs | 리얼타임 분석, Logs Insights로 쿼리 | 로그 수집 + 저장 요금 |
| S3 | 장기 보존, Athena로 분석 | S3 스토리지 요금 (저렴) |
| Kinesis Data Firehose | 리얼타임 스트리밍 분석 | Firehose 처리 요금 |

**CloudWatch Logs Insights 쿼리 예:**

```
-- 거부된 트래픽의 Top 10 송신원
fields @timestamp, srcAddr, dstAddr, dstPort, action
| filter action = "REJECT"
| stats count(*) as numRejections by srcAddr
| sort numRejections desc
| limit 10
```

---

### VPC Peering

**정의:** 2개의 VPC 간에 프라이빗 IP 주소를 사용하여 직접 통신을 가능하게 하는 연결. 트래픽은 AWS 백본 네트워크 내에 머물며 인터넷을 경유하지 않는다.

**중요한 제약:**
- **비전이적 (Non-transitive):** VPC-A <-> VPC-B의 피어링과 VPC-B <-> VPC-C의 피어링이 있어도 VPC-A -> VPC-C의 통신은 VPC-B 경유로는 불가. 직접 피어링이 필요.
- **CIDR 중복 불가:** 피어링하는 2개의 VPC의 CIDR 블록이 중복되어서는 안 된다.
- **크로스 리전:** 다른 리전 간의 피어링을 지원.
- **크로스 계정:** 다른 AWS 계정 간의 피어링을 지원.

**N개의 VPC인 경우 필요한 피어링 수:** N x (N-1) / 2. VPC가 10개라면 45개의 피어링 연결이 필요. 관리가 번잡해지므로 대규모 환경에서는 Transit Gateway를 검토한다.

---

### Transit Gateway

**정의:** 여러 VPC, VPN, Direct Connect를 허브&스포크 토폴로지로 연결하는 네트워크 트랜짓 허브. 모든 VPC가 Transit Gateway에 1개 연결만 하면 상호 통신이 가능해진다.

**소크라테스식 심화:**
> Q: "Transit Gateway란 무엇인가? VPC Peering과의 차이는 무엇인가?"
> A: VPC Peering은 1대1 직접 연결이며, VPC 수가 늘어나면 풀메시 연결의 관리가 폭발적으로 복잡해진다. Transit Gateway는 중앙 허브로서 모든 VPC를 집약하고, 라우트 테이블로 통신 경로를 제어한다. VPC가 3개 이상인 환경, 또는 온프레미스와의 연결이 있는 환경에서는 Transit Gateway가 권장된다.

**현실 세계의 비유 (비IT 대상):**
> "공항의 허브 (환승 거점)와 같은 것입니다. VPC Peering은 도시 간의 직항편 (1대1). VPC가 10개 있으면 45개의 직항편 (피어링)이 필요합니다. Transit Gateway는 중앙 허브 공항 - 모든 도시 (VPC)가 허브에 1개 연결만 하면 어디든 환승할 수 있습니다"

**Transit Gateway의 주요 기능:**

| 기능 | 설명 |
|------|------|
| Route Tables | Transit Gateway 독자적인 라우트 테이블로 통신 경로를 제어 |
| Associations | VPC나 VPN을 라우트 테이블에 연결 |
| Propagations | 연결처로부터 라우트를 자동 학습 |
| Cross-Region Peering | 다른 리전의 Transit Gateway끼리 연결 |
| Multicast | 멀티캐스트 통신 지원 |
| ECMP | 여러 VPN 연결의 대역폭을 집약 |

---

### VPC Endpoints

**정의:** VPC 내의 리소스가 인터넷을 경유하지 않고 AWS 서비스에 액세스하기 위한 프라이빗 연결. Gateway Endpoint와 Interface Endpoint (PrivateLink)의 2종류가 있다.

**소크라테스식 심화:**
> Q: "VPC Endpoint란 무엇인가? 왜 중요한가?"
> A: 통상적으로 VPC 내의 EC2가 S3에 액세스하는 경우, 트래픽은 NAT Gateway -> Internet Gateway -> 퍼블릭 인터넷 -> S3 엔드포인트라는 경로를 따른다. VPC Endpoint를 사용하면 트래픽은 AWS 프라이빗 네트워크 내에 머문다. 장점은 3가지: (1) 보안 향상 (트래픽이 인터넷에 나가지 않음), (2) 레이턴시 감소, (3) NAT 비용 절감 (NAT의 데이터 처리 요금이 불필요).
> Q: "Gateway Endpoint와 Interface Endpoint의 차이는?"
> A: Gateway Endpoint는 S3와 DynamoDB만 대응하며 무료이다. 라우트 테이블에 엔트리가 추가되는 형태로 동작한다. Interface Endpoint는 100개 이상의 AWS 서비스에 대응하지만 ENI 기반으로 유료이다. 서브넷 내에 ENI가 생성되고 프라이빗 IP가 할당된다.

**현실 세계의 비유 (비IT 대상):**
> "사내 메일 시스템 vs 공공 우편. S3에 API 호출을 보낼 때 통상은 공공 인터넷 (우체국)을 경유합니다. VPC Endpoint는 사무실에서 S3 빌딩으로의 전용 통로 (프라이빗 복도)를 만듭니다. 편지는 회사 캠퍼스 (AWS 네트워크)에서 한 발자국도 나가지 않습니다. 장점: 고속, 안전, 인터넷 게이트웨이 불필요"

**비교표:**

| 특징 | Gateway Endpoint | Interface Endpoint (PrivateLink) |
|------|-----------------|----------------------------------|
| 대응 서비스 | S3, DynamoDB만 | 100개 이상의 AWS 서비스 + 커스텀 서비스 |
| 요금 | **무료** | 시간 과금 + 데이터 처리 과금 |
| 메커니즘 | 라우트 테이블에 엔트리 추가 | 서브넷 내에 ENI 생성 |
| Security Group | 불필요 | **필요** (ENI에 적용) |
| 액세스 제어 | Endpoint Policy | Endpoint Policy + Security Group |
| DNS | 변경 없음 | 프라이빗 DNS 활성화로 자동 해석 |
| 온프레미스에서 | Direct Connect/VPN 경유 액세스 불가 | Direct Connect/VPN 경유 액세스 가능 |

**Endpoint Policy 예 (특정 버킷만 액세스 허용):**

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-specific-bucket/*"
    }
  ]
}
```

## 아키텍처 패턴

### 패턴1: 표준적인 3계층 VPC 설계

```
Region: ap-northeast-1
VPC: 10.0.0.0/16

┌─────────── AZ-a ───────────┐  ┌─────────── AZ-c ───────────┐
│ Public: 10.0.1.0/24        │  │ Public: 10.0.2.0/24        │
│   [ALB] [NAT-GW]           │  │   [ALB] [NAT-GW]           │
├─────────────────────────────┤  ├─────────────────────────────┤
│ Private: 10.0.11.0/24      │  │ Private: 10.0.12.0/24      │
│   [EC2] [ECS]              │  │   [EC2] [ECS]              │
├─────────────────────────────┤  ├─────────────────────────────┤
│ Isolated: 10.0.21.0/24     │  │ Isolated: 10.0.22.0/24     │
│   [RDS Primary]            │  │   [RDS Standby]            │
└─────────────────────────────┘  └─────────────────────────────┘

Route Tables:
  Public:   0.0.0.0/0 → IGW
  Private:  0.0.0.0/0 → NAT-GW (same AZ)
  Isolated: local only

VPC Endpoints:
  S3 Gateway Endpoint (무료)
  DynamoDB Gateway Endpoint (무료)
  ECR Interface Endpoint (컨테이너 이미지 가져오기용)
```

### 패턴2: Transit Gateway 멀티 VPC 연결

```
                    ┌─────────────────────┐
                    │   Transit Gateway   │
                    │   Route Tables:     │
                    │   - Production RT   │
                    │   - NonProd RT      │
                    │   - Shared RT       │
                    └──────┬──┬──┬────────┘
                           │  │  │
         ┌─────────────────┘  │  └─────────────────┐
         │                    │                     │
   ┌─────┴─────┐     ┌───────┴──────┐     ┌───────┴──────┐
   │ Prod VPC  │     │ Dev VPC      │     │ Shared VPC   │
   │ 10.1.0/16 │     │ 10.2.0.0/16 │     │ 10.0.0.0/16  │
   │           │     │              │     │ [DNS]        │
   │ [App]     │     │ [App]        │     │ [Active Dir] │
   │ [DB]      │     │ [DB]         │     │ [Monitoring] │
   └───────────┘     └──────────────┘     └──────────────┘
         │
   ┌─────┴──────┐
   │  VPN / DX  │
   │ On-Premise │
   └────────────┘

라우팅 제어:
  Production RT: Prod VPC + Shared VPC만 (Dev VPC로의 통신은 불가)
  NonProd RT: Dev VPC + Shared VPC만 (Prod VPC로의 통신은 불가)
  Shared RT: 전체 VPC로의 통신을 허용
```

### 패턴3: VPC Endpoint에 의한 안전한 AWS 서비스 액세스

```
Private Subnet의 인스턴스에서 S3로의 액세스:

WITHOUT VPC Endpoint:
  EC2 → NAT Gateway → Internet Gateway → Public Internet → S3
  비용: NAT GW 시간 과금 + NAT 데이터 처리 ($0.062/GB)
  보안: 트래픽이 일시적으로 인터넷에 나감

WITH S3 Gateway Endpoint:
  EC2 → VPC Router → S3 (AWS 프라이빗 네트워크 내)
  비용: 무료
  보안: 트래픽이 AWS 네트워크에서 나가지 않음

비용 절감 예:
  월간 S3 전송량 1TB의 경우
  NAT Gateway 데이터 처리: 1,000 GB × $0.062 = $62/월
  S3 Gateway Endpoint: $0/월
  연간 절감액: $744
```

## SAA 시험 포인트

- **서브넷의 AWS 예약 IP**는 각 서브넷에서 5개 (처음 4개 + 마지막 1개). /24 (256 IP)에서는 사용 가능 251개. /28 (16 IP)에서는 11개.
- **Security Group은 Stateful, NACL은 Stateless**가 가장 빈출 포인트. Security Group에서 허용한 인바운드의 응답은 자동 허용된다. NACL은 인바운드/아웃바운드 양쪽 명시적으로 설정이 필요.
- **NACL의 규칙 평가 순서**는 번호가 작은 순서. 첫 번째 매치된 규칙으로 결정. 특정 IP를 차단하려면 허용 규칙보다 작은 번호에 거부 규칙을 배치한다.
- **NAT Gateway는 AZ 내에서만 이중화**된다. Multi-AZ 환경에서는 AZ마다 NAT Gateway를 배치한다. 1개의 NAT Gateway가 장애를 일으켜도 다른 AZ의 인스턴스는 영향을 받지 않도록 한다.
- **VPC Peering은 비전이적 (Non-transitive)**. A-B 간과 B-C 간의 피어링이 있어도 A-C 간의 통신은 B 경유로는 불가능.
- **S3와 DynamoDB의 VPC Endpoint는 Gateway형으로 무료**. 다른 AWS 서비스는 Interface Endpoint (유료). 비용 최적화 문제에서는 S3 Gateway Endpoint가 빈출.
- **Transit Gateway vs VPC Peering:** 3개 이상의 VPC를 연결하는 경우 또는 온프레미스와의 연결이 있는 경우에는 Transit Gateway가 적절. 2개의 VPC 간의 심플한 연결이라면 VPC Peering으로 충분.
- **VPC Flow Logs는 패킷 캡처가 아니다.** 메타데이터 (헤더)만 기록한다. 패킷의 내용을 확인하려면 트래픽 미러링을 사용한다.
- **Interface Endpoint에는 프라이빗 호스트 존** (Private DNS) 설정이 있다. 활성화하면 AWS 서비스의 기본 DNS 이름이 자동으로 프라이빗 IP로 해석된다.
- **CIDR 블록이 중복되는 VPC는 Peering 불가.** 네트워크 설계 시 CIDR의 중복을 피하는 것이 매우 중요. Secondary CIDR로의 확장도 중복 체크가 필요.

## 핸즈온 참조

- CDK 프로젝트: `cdk-projects/04-networking-loadbalancing/`
- 구축하는 주요 리소스:
  - VPC (3계층 서브넷 구성: Public / Private / Isolated)
  - NAT Gateway (Multi-AZ)
  - Security Groups (ALB용, App용, DB용)
  - VPC Endpoints (S3 Gateway, DynamoDB Gateway)
  - VPC Flow Logs (CloudWatch Logs 전송)
  - Route Tables (Public, Private, Isolated)
- 확인 포인트:
  - Private Subnet의 EC2에서 인터넷에 액세스할 수 있는 것을 확인 (NAT Gateway 경유)
  - Isolated Subnet의 RDS에 인터넷에서 액세스할 수 없는 것을 확인
  - S3 Gateway Endpoint 경유로 S3에 액세스할 수 있는 것을 확인
  - VPC Flow Logs에서 통신 로그가 기록되는 것을 확인
  - Security Group의 Stateful 동작을 확인 (인바운드 허용만으로 응답이 돌아오는 것)

## Well-Architected 체크리스트

### Security
- [ ] 서브넷이 용도에 따라 Public / Private / Isolated로 분리되어 있는가
- [ ] Security Group이 최소 권한 원칙을 따르고 있는가 (필요한 포트/소스만 허용)
- [ ] NACL로 서브넷 레벨의 추가 방어가 설정되어 있는가
- [ ] VPC Flow Logs가 전 VPC에서 활성화되어 분석 기반이 정비되어 있는가
- [ ] VPC Endpoint를 사용하여 AWS 서비스로의 트래픽이 프라이빗 네트워크 내에 머무르고 있는가
- [ ] Endpoint Policy로 액세스를 필요 최소한의 리소스로 제한하고 있는가

### Reliability
- [ ] 서브넷이 최소 2개의 AZ에 걸쳐 배치되어 있는가
- [ ] NAT Gateway가 AZ마다 배치되어 Single AZ 장애 시의 영향이 제한되는가
- [ ] CIDR 블록에 미래의 스케일링 여유가 있는가
- [ ] Transit Gateway의 라우트 테이블로 적절한 세그멘테이션이 실현되어 있는가
- [ ] VPC Peering 또는 Transit Gateway 연결에서 CIDR 중복이 없는가
- [ ] Secondary CIDR 블록에 의한 확장 계획이 수립되어 있는가
