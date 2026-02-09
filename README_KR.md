> 이 문서는 [README.md](README.md)의 한국어 버전입니다.

# AWS Operations Examples

AWS SAA 수준의 지식을 기반으로, **Well-Architected Framework 6가지 기둥**을 바탕으로 한 백오피스 지원 및 Operations 업무를 위한 학습 프로젝트.

## 학습 리소스

- [Classmethod: Cloud Operations on AWS Day1 - IaC](https://dev.classmethod.jp/articles/aws-cloud-operations-on-aws-day1-iac/)
- [Classmethod: Cloud Operations on AWS Day2](https://dev.classmethod.jp/articles/aws-cloud-operations-on-aws-day2/)
- [Classmethod: Cloud Operations on AWS Day3](https://dev.classmethod.jp/articles/aws-cloud-operations-on-aws-day3/)

## 프로젝트 구조

```
├── study-book/          # 학습 노트 (소크라테스식 + 현실 비유)
├── cdk-projects/        # AWS CDK Hands-on (TypeScript & Python)
├── diagrams/            # Mermaid 아키텍처 다이어그램
└── scripts/             # 셋업 헬퍼
```

## Prerequisites

- Node.js >= 18
- Python >= 3.9
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS CLI configured with credentials

## 학습 경로

### Day 1: IaC & Access Control
1. [IaC 기초](study-book-kr/2026-02-08-IaCFoundations.md)
2. [IAM 심층 분석](study-book-kr/2026-02-08-IAMDeepDive.md) (JWT, OIDC)
3. [Organizations & Compliance](study-book-kr/2026-02-08-OrganizationsCompliance.md)
4. [Systems Manager](study-book-kr/2026-02-08-SystemsManager.md)

### Day 2: 운영 & Monitoring
5. [모니터링 운영](study-book-kr/2026-02-09-OperationsMonitoring.md)
6. [네트워크 & LB](study-book-kr/2026-02-09-NetworkingLoadBalancing.md) (OSI, DNS, SSL)
7. [Auto Scaling](study-book-kr/2026-02-09-AutoScalingResilience.md)
8. [Event 기반 & Observability](study-book-kr/2026-02-09-EventDrivenObservability.md)

### Day 3: Security, 네트워크 & Storage
9. [보안 통제](study-book-kr/2026-02-10-SecurityControls.md)
10. [VPC 설계](study-book-kr/2026-02-10-VPCNetworkDesign.md) (VPC Endpoint, CIDR)
11. [Edge & CDN](study-book-kr/2026-02-10-EdgeSecurityCDN.md)
12. [Storage & Backup](study-book-kr/2026-02-10-StorageBackup.md)

### Day 4: Serverless, Container & DevOps
13. [Lambda & 서버리스 운영](study-book-kr/2026-02-11-LambdaServerless.md)
14. [컨테이너 운영](study-book-kr/2026-02-11-ContainerOperations.md) (ECS, EKS, Fargate)
15. [데이터베이스 운영](study-book-kr/2026-02-11-DatabaseOperations.md) (RDS, Aurora, DynamoDB)
16. [CI/CD & DevOps](study-book-kr/2026-02-11-CICDDevOps.md)

## CDK Hands-on

| # | 프로젝트 | 언어 | 셋업 |
|---|---------|------|------|
| 01 | IAM Org Governance | TypeScript | `./scripts/setup-ts-project.sh cdk-projects/01-iam-org-governance` |
| 02 | SSM Operations | Python | `./scripts/setup-py-project.sh cdk-projects/02-ssm-operations` |
| 03 | Monitoring & Observability | TypeScript | `./scripts/setup-ts-project.sh cdk-projects/03-monitoring-observability` |
| 04 | Networking & LB | TypeScript | `./scripts/setup-ts-project.sh cdk-projects/04-networking-loadbalancing` |
| 05 | Security & Edge | Python | `./scripts/setup-py-project.sh cdk-projects/05-security-edge` |
| 06 | Storage & Backup | Python | `./scripts/setup-py-project.sh cdk-projects/06-storage-backup` |

### CDK 프로젝트 상세

<details>
<summary><strong>01 - IAM Org Governance</strong> (TypeScript)</summary>

- **학습 내용**: IAM Role 설계, Permission Boundaries, OIDC Federation, AWS Config Rules
- **주요 Stack**:
  - `IamRolesStack` - 최소 권한 원칙에 기반한 Role 설계
  - `PermissionBoundaryStack` - 권한의 상한을 설정하는 Boundary Policy
  - `OidcFederationStack` - GitHub Actions 등과의 신뢰 관계 구축
  - `ConfigRemediationStack` - 비준수 리소스의 자동 수정 규칙
- **관련 학습 노트**: Section 02 (IAM 심층 분석), Section 03 (Organizations)
</details>

<details>
<summary><strong>02 - SSM Operations</strong> (Python)</summary>

- **학습 내용**: SSM Inventory 관리, Patch 관리, Parameter Store 계층 설계
- **주요 Stack**:
  - `SsmInventoryStack` - EC2 Instance의 자동 Inventory 수집
  - `PatchManagementStack` - Patch Baseline과 Maintenance Window
  - `ParameterStoreStack` - 환경별 파라미터의 계층 관리 (`/app/prod/db/host`)
- **관련 학습 노트**: Section 04 (Systems Manager)
</details>

<details>
<summary><strong>03 - Monitoring & Observability</strong> (TypeScript)</summary>

- **학습 내용**: CloudWatch Dashboard, EventBridge 자동화, X-Ray 분산 트레이싱
- **주요 Stack**:
  - `DashboardStack` - Custom Metrics Dashboard 구축
  - `AlarmStack` - Composite Alarm과 SNS 알림
  - `EventBridgeStack` - Event Rule을 통한 자동 대응
  - `XRayTracingStack` - Lambda/API Gateway의 분산 트레이싱
- **관련 학습 노트**: Section 05 (모니터링 운영), Section 08 (Event 기반)
</details>

<details>
<summary><strong>04 - Networking & LB</strong> (TypeScript)</summary>

- **학습 내용**: Multi-AZ VPC 설계, ALB/NLB Routing, Auto Scaling Policy
- **주요 Stack**:
  - `VpcStack` - Public/Private/Isolated Subnet의 3계층 VPC
  - `AlbStack` - Path 기반 및 Host 기반 Routing
  - `NlbStack` - TCP/UDP 레벨의 Load Balancing
  - `AutoScalingStack` - Target Tracking 및 Step Scaling
- **관련 학습 노트**: Section 06 (네트워크), Section 07 (Auto Scaling), Section 10 (VPC 설계)
</details>

<details>
<summary><strong>05 - Security & Edge</strong> (Python)</summary>

- **학습 내용**: CloudTrail 감사 로그, GuardDuty 위협 탐지, CloudFront + WAF + ACM
- **주요 Stack**:
  - `CloudTrailStack` - 전체 Region API 감사 로그의 통합 관리
  - `GuardDutyStack` - 기계 학습 기반의 위협 탐지 및 알림
  - `CloudFrontWafStack` - CDN 배포 + WAF Rule (SQLi, XSS, Rate Limiting)
  - `AcmStack` - SSL/TLS 인증서의 자동 관리
- **관련 학습 노트**: Section 09 (보안 통제), Section 11 (Edge & CDN)
</details>

<details>
<summary><strong>06 - Storage & Backup</strong> (Python)</summary>

- **학습 내용**: S3 Lifecycle 관리, EBS Snapshot (DLM), AWS Backup
- **주요 Stack**:
  - `S3LifecycleStack` - Storage Class 자동 전환 (Standard -> IA -> Glacier)
  - `IntelligentTieringStack` - 액세스 패턴 자동 최적화
  - `EbsDlmStack` - Data Lifecycle Manager를 통한 Snapshot 자동화
  - `BackupPlanStack` - AWS Backup을 통한 통합 백업 관리
- **관련 학습 노트**: Section 12 (Storage & Backup)
</details>

## 아키텍처 다이어그램

`diagrams/` 폴더에 Mermaid 형식의 아키텍처 다이어그램을 저장하고 있습니다.

> **Note**: Mermaid `.mmd` 파일은 GitHub에서 자동으로 렌더링됩니다. 로컬에서 확인하려면 VS Code의 [Mermaid Preview](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid) 확장 기능을 사용하세요.

| 다이어그램 | 파일 | 설명 |
|-----------|------|------|
| Well-Architected 개요 | [`well-architected-overview.mmd`](diagrams/well-architected-overview.mmd) | 6가지 기둥과 각 CDK 프로젝트의 매핑 (마인드맵) |
| VPC 네트워크 구성 | [`vpc-network-topology.mmd`](diagrams/vpc-network-topology.mmd) | Multi-AZ VPC의 Subnet 구성과 트래픽 흐름 |
| 모니터링 데이터 흐름 | [`monitoring-flow.mmd`](diagrams/monitoring-flow.mmd) | Event Source에서 Monitoring, Action까지의 데이터 흐름 |
| 보안 다층 방어 | [`security-layers.mmd`](diagrams/security-layers.mmd) | Edge -> 네트워크 -> Compute -> Data의 방어 계층 |

## 학습 시간 가이드

| 카테고리 | 소요 시간 | 비고 |
|---------|----------|------|
| 학습 노트 (1 Section) | 30 - 45분 | 소크라테스식 Q&A 형식으로 이해를 심화 |
| CDK Hands-on (1 프로젝트) | 1 - 2시간 | 코드 이해 + 배포 + 동작 확인 |
| Day 1 전체 | 3 - 4시간 | 노트 4개 + CDK 01, 02 |
| Day 2 전체 | 3 - 4시간 | 노트 4개 + CDK 03, 04 |
| Day 3 전체 | 3 - 4시간 | 노트 4개 + CDK 05, 06 |
| Day 4 전체 | 3 - 4시간 | 노트 4개 (응용 토픽) |
| **전체 합계** | **약 13 - 16시간** | 4일간의 집중 학습을 상정 |

## 핵심 개념 색인

학습 노트에 등장하는 주요 개념과, 이해를 돕는 현실 비유 목록입니다.

| 개념 | Section | 비유 (Analogy) |
|------|---------|---------------|
| IaC (Infrastructure as Code) | Section 01 | 레시피대로 요리를 재현하기 |
| JWT (JSON Web Token) | Section 02 | 봉인된 위변조 방지 봉투 |
| OIDC (OpenID Connect) | Section 02 | 호텔에서의 정부 발행 신분증 제시 |
| Permission Boundary | Section 02 | 방 열쇠는 주지만 건물 밖으로는 나갈 수 없음 |
| SCP (Service Control Policy) | Section 03 | 회사 전체의 규칙집 |
| SSM Parameter Store | Section 04 | 금고가 달린 정리 선반 |
| CloudWatch Metrics | Section 05 | 공장의 계기판 |
| OSI 7계층 모델 | Section 06 | 우편 시스템의 계층 (봉투, 주소, 배달) |
| DNS | Section 06 | 전화번호부 (이름 -> 번호 변환) |
| SSL/TLS | Section 06 | 봉랍이 찍힌 편지 (암호화 + 인증) |
| Auto Scaling | Section 07 | 성수기의 계산대 증설 |
| EventBridge | Section 08 | 사내 메일의 자동 분류 규칙 |
| X-Ray | Section 08 | 택배 추적 번호 (분산 트레이싱) |
| GuardDuty | Section 09 | AI 보안 카메라 |
| VPC Endpoint | Section 10 | 사내 메일 vs 공공 우편 |
| CIDR | Section 10 | 주소의 블록 할당 |
| CloudFront | Section 11 | 편의점의 지역 물류 창고 (Edge Cache) |
| WAF | Section 11 | 빌딩 입구 보안 게이트 |
| S3 Lifecycle | Section 12 | 서류의 창고 이동 (책상 -> 창고 -> 장기 보관) |
| AWS Backup | Section 12 | 통합 백업 금고 |
| Lambda Cold Start | Section 13 | 폐점 중인 레스토랑이 주문을 받고 나서 개점하기 |
| Step Functions | Section 13 | 요리 레시피 (공정의 순서 관리) |
| ECS Fargate | Section 14 | 관리인 딸린 아파트 (서버 관리 불필요) |
| ECS vs EKS | Section 14 | 전용 택시 vs 노선 버스 |
| RDS Multi-AZ | Section 15 | 정·부 금고 (자동 전환) |
| DynamoDB | Section 15 | 거대한 해시맵 (Key-Value) |
| Blue/Green Deploy | Section 16 | 무대 장면 전환 (관객 모르게 전환) |
| CodePipeline | Section 16 | 공장 조립 라인 (자동화) |
