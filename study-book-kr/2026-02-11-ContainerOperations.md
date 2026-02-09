# 섹션14: 컨테이너 운영 (Container Operations)
> Well-Architected Pillars: Operational Excellence, Performance Efficiency, Security
> Day: 4 | 난이도: 중급~상급

## 개요

컨테이너 기술은 애플리케이션의 패키징, 배포, 스케일링을 근본적으로 변혁시켰다. Docker 컨테이너는 "한 번 빌드하면 어디서든 실행된다"는 원칙을 실현하여, 개발 환경과 운영 환경의 차이를 최소화한다. AWS는 컨테이너 워크로드를 운영하기 위한 포괄적인 서비스군을 제공하며, Amazon ECS(Elastic Container Service)와 Amazon EKS(Elastic Kubernetes Service)가 양대 오케스트레이션 서비스로 자리잡고 있다.

ECS는 AWS 네이티브 컨테이너 오케스트레이터로, AWS 서비스와의 깊은 통합이 특징이다. Task Definition, Service, Cluster의 3계층 구조로 컨테이너를 관리하며, EC2 시작 유형과 Fargate 시작 유형의 2가지 컴퓨팅 모델을 선택할 수 있다. 반면, EKS는 Kubernetes의 관리형 서비스로서, 오픈소스 에코시스템과의 호환성 및 멀티클라우드 이식성이 강점이다. AWS Fargate는 서버리스 컴퓨팅 엔진으로서 ECS와 EKS 모두에서 이용할 수 있으며, 인프라 관리로부터 완전히 해방된다.

SAA 시험에서는 ECS와 EKS의 사용 구분, EC2 시작 유형과 Fargate의 비교, Task Definition/Service/Cluster의 관계, 컨테이너 네트워킹(awsvpc), IAM 역할 분리(Task Execution Role과 Task Role), ECR의 수명주기 관리, 그리고 컨테이너 기반의 CI/CD 파이프라인 설계가 출제된다. 컨테이너는 현대 클라우드 아키텍처의 핵심이며, 마이크로서비스, CI/CD, DevOps의 맥락에서 빈번하게 등장한다.

## 핵심 개념

### 컨테이너 기초 (Docker)

**정의:** 컨테이너는 애플리케이션과 그 의존성(라이브러리, 런타임, 설정 파일 등)을 하나의 패키지로 묶은 경량 가상화 단위이다. Docker image는 컨테이너의 설계도(불변 템플릿), container는 image로부터 시작된 실행 인스턴스이다. Dockerfile은 image의 빌드 절차를 기술한 텍스트 파일이다. Image layer는 Dockerfile의 각 명령에 대응하는 차분 레이어로, 캐시와 재사용을 가능하게 한다. Registry는 image를 보관 및 배포하는 저장소(ECR, Docker Hub 등)이다.

**소크라테스식 심화:**
> Q: "컨테이너와 가상 머신(VM)의 차이는 무엇인가? 왜 컨테이너가 급속히 보급되었는가?"
> A: VM은 게스트 OS 전체를 포함한다. 하나의 VM에 Windows OS가 통째로 들어 있고, 그 위에서 애플리케이션이 동작한다. 컨테이너는 호스트 OS의 커널을 공유하며, 애플리케이션과 그 의존성만 포함한다. 결과적으로 컨테이너는 MB 단위(VM은 GB 단위), 시작 시간은 초 단위(VM은 분 단위)이며, 같은 하드웨어에서 훨씬 많은 인스턴스를 실행할 수 있다. VM이 "단독주택"이라면, 컨테이너는 "아파트의 한 세대"이다. 건물의 기초(OS 커널)는 공유하지만, 각 세대는 독립적이다.
> Q: "Dockerfile의 이미지 레이어란 무엇인가? 왜 중요한가?"
> A: Dockerfile의 각 명령(FROM, RUN, COPY 등)은 새로운 레이어를 생성한다. 레이어는 케이크의 층과 같다. 첫 번째 층이 베이스 OS, 다음 층에 런타임 설치, 다음에 애플리케이션 코드 순으로 쌓인다. 중요한 점은 레이어가 캐시된다는 것이다. 애플리케이션 코드만 변경한 경우, 베이스 OS와 런타임 레이어는 캐시에서 재사용되며, 변경된 레이어만 재빌드된다. 이를 통해 빌드 시간이 극적으로 단축된다. 모범 사례로서, 변경 빈도가 낮은 명령을 위에, 높은 명령을 아래에 배치한다.

**현실 세계의 비유 (비IT 대상):**
> "컨테이너는 이사할 때의 박스이다. 식기 세트(애플리케이션), 포장재(라이브러리), 사용 설명서(설정)를 하나의 박스에 담는다. 어느 집(서버)에 옮겨도 박스를 열면 바로 사용할 수 있다. VM은 가구가 딸린 집을 통째로 이사하는 것과 같아서, 훨씬 많은 시간과 노력이 든다."

---

### Amazon ECS (Elastic Container Service)

**정의:** AWS 네이티브의 완전 관리형 컨테이너 오케스트레이션 서비스이다. Task Definition에서 컨테이너의 설계도(이미지, CPU/메모리, 포트, 환경 변수 등)를 정의하고, Service에서 Task Definition에 기반한 태스크의 실행 수와 배포 전략을 관리하며, Cluster가 논리적 그룹핑을 제공한다. 시작 유형으로 EC2(자체 인스턴스 관리)와 Fargate(서버리스)를 선택할 수 있다.

**소크라테스식 심화:**
> Q: "ECS의 Task Definition, Service, Cluster의 관계는?"
> A: 레스토랑에 비유하자. Task Definition은 "레시피"이다. 요리(컨테이너)의 재료(이미지), 조리 시간(CPU/메모리), 플레이팅 방법(포트 매핑)을 기술한다. Service는 "주방장의 지시서"이다. '이 요리를 항상 3접시 준비해 둬라. 1접시가 깨지면 자동으로 다시 만들어라'라는 운영 규칙이다. Cluster는 "레스토랑 그 자체"이다. 주방 설비(EC2 인스턴스 또는 Fargate)와 인력(태스크)을 관리하는 논리적 단위이다. 하나의 Task Definition으로 여러 Service를 생성할 수 있고, 하나의 Cluster에 여러 Service를 배치할 수 있다.
> Q: "EC2 시작 유형과 Fargate 시작 유형의 사용 구분은?"
> A: EC2 시작 유형은 인스턴스를 직접 관리한다. GPU 워크로드, 특수한 커널 설정이 필요한 경우, 대량의 컨테이너에 의한 비용 최적화가 중요한 경우에 선택한다. Fargate는 완전 서버리스로 인프라 관리가 불필요하다. 버스트성 워크로드, 소규모 팀, 운영 부하 경감이 우선되는 경우에 최적이다. 비용 면에서는 EC2(특히 Reserved/Savings Plans 적용 시)가 저렴해지는 경우가 많지만, EC2의 패치 적용, 스케일링, 용량 관리의 운영 부담을 고려해야 한다.

| 비교 항목 | EC2 시작 유형 | Fargate 시작 유형 |
|----------|--------------|-------------------|
| 인프라 관리 | EC2 인스턴스의 관리가 필요 | 완전 서버리스 |
| GPU 지원 | 지원 | 미지원 |
| 요금 모델 | EC2 요금 + ECS 무료 | vCPU/메모리의 초 단위 과금 |
| 스케일링 | Cluster Auto Scaling 필요 | 태스크 수준에서 자동 |
| 스토리지 | EBS, 인스턴스 스토어 이용 가능 | 임시 스토리지(20GB~200GB) |
| 보안 | 호스트 수준의 제어 가능 | 태스크 수준의 격리 |
| 사용자 정의 | OS, 커널 설정의 자유도 높음 | 제한 있음 |
| 적용 시나리오 | GPU, 대규모, 비용 최적화 | 소~중규모, 운영 부담 경감 |

**현실 세계의 비유 (비IT 대상):**
> "EC2 시작 유형은 자사 소유의 배송 트럭이다. 트럭의 구매, 정비, 운전기사 고용이 필요하지만 맞춤화가 자유롭고 대량 배송은 저렴하다. Fargate는 택배 서비스 이용이다. 짐(컨테이너)을 넘기기만 하면 배송된다. 트럭 관리는 전혀 불필요하지만, 건당 요금은 다소 비싸다."

---

### AWS Fargate

**정의:** 컨테이너용 서버리스 컴퓨팅 엔진이다. ECS와 EKS 모두에서 이용 가능하다. EC2 인스턴스의 프로비저닝, 스케일링, 패치 적용이 불필요하다. 태스크 수준의 네트워킹(각 태스크에 전용 ENI)과 태스크 수준의 리소스 격리를 제공한다. 임시 스토리지는 기본 20GB로 최대 200GB까지 확장 가능하다.

**소크라테스식 심화:**
> Q: "Fargate의 태스크 수준 네트워킹이란 무엇인가? 왜 중요한가?"
> A: Fargate에서는 각 태스크에 전용 ENI(Elastic Network Interface)가 할당된다. 이는 아파트에서 각 세대에 전용 현관(네트워크 인터페이스)이 있는 것과 같다. 각 태스크가 고유한 프라이빗 IP 주소를 가지며, Security Group을 태스크 수준에서 적용할 수 있다. EC2 시작 유형의 bridge/host 모드에서는 여러 컨테이너가 같은 EC2의 네트워크를 공유하므로, 세밀한 접근 제어가 어려웠다.
> Q: "Fargate의 임시 스토리지 제한은 무엇인가?"
> A: Fargate 태스크의 스토리지는 임시적(ephemeral)이며, 태스크 종료 시 데이터가 소실된다. 기본 20GB, 최대 200GB까지 Task Definition 내에서 설정 가능하다. 영속화가 필요한 데이터는 EFS(Elastic File System)를 마운트하거나, S3에 기록한다. EBS는 Fargate 태스크에 연결할 수 없다(EC2 시작 유형만 가능). 시험에서는 "Fargate에서 영속 스토리지가 필요한 경우 → EFS"라는 패턴이 자주 출제된다.

**현실 세계의 비유 (비IT 대상):**
> "Fargate는 택시 서비스이다. 목적지(태스크)를 말하기만 하면, 차량(인프라)의 정비나 주차장 확보는 전혀 불필요하다. 승차 중 트렁크(임시 스토리지)는 이용할 수 있지만, 하차 후에 짐을 남길 수 없다. 큰 짐을 영구적으로 보관하고 싶다면, 창고(EFS/S3)에 맡겨야 한다."

---

### Amazon EKS (Elastic Kubernetes Service)

**정의:** Kubernetes의 완전 관리형 서비스이다. Kubernetes의 컨트롤 플레인(API server, etcd, scheduler, controller manager)을 AWS가 관리한다. 워커 노드로서 Managed Node Groups(AWS가 EC2를 관리), Self-managed Node Groups(사용자가 EC2를 관리), Fargate Profiles(서버리스)의 3가지를 선택할 수 있다. Kubernetes 에코시스템의 도구(Helm, kubectl, Istio 등)를 그대로 활용할 수 있으며, 멀티클라우드 및 하이브리드 클라우드의 이식성이 높다.

**소크라테스식 심화:**
> Q: "EKS의 Managed Node Groups와 Self-managed Node Groups, Fargate Profiles의 차이는?"
> A: Managed Node Groups는 AWS가 EC2 인스턴스의 프로비저닝, AMI 업데이트, 노드의 드레인을 자동 관리한다. 가장 균형 잡힌 선택지이다. Self-managed Node Groups는 사용자가 완전히 제어한다. 커스텀 AMI, 특수한 인스턴스 유형, 기존 Auto Scaling Group 통합이 필요한 경우에 선택한다. Fargate Profiles는 Namespace와 라벨에 기반하여 Pod를 Fargate 위에서 실행한다. DaemonSet 미지원, GPU 워크로드 미지원이라는 제약이 있지만, 노드 관리가 완전히 불필요하다.
> Q: "ECS와 EKS의 근본적인 차이는 무엇인가?"
> A: ECS는 "AWS에 최적화된 독자적인 오케스트레이터"이다. AWS 서비스와의 통합이 깊고, 학습 곡선이 완만하다. EKS는 "업계 표준 Kubernetes의 관리형 버전"이다. Kubernetes의 전 기능(Custom Resource, Operator 등)을 이용할 수 있으며, 다른 클라우드나 온프레미스와의 호환성이 높다. ECS는 "AWS의 표준어", EKS는 "국제 공용어(Kubernetes)의 AWS 방언"이라고 생각하면 이해하기 쉽다.

| 비교 항목 | ECS | EKS |
|----------|-----|-----|
| 오케스트레이터 | AWS 독자적 | Kubernetes (OSS) |
| 학습 곡선 | 완만 | 가파름 |
| AWS 통합 | 깊음(네이티브) | 플러그인 경유 |
| 멀티클라우드 | AWS 전용 | GKE, AKS와 호환 |
| 에코시스템 | AWS 고유 | Helm, Istio, Argo 등 |
| 요금 | 컨트롤 플레인 무료 | $0.10/시간 (약 $72/월) |
| Fargate 지원 | 있음 | 있음 |
| 운영 부하 | 낮음 | 중~높음 |
| 적용 시나리오 | AWS 중심, 심플 | K8s 경험자, 멀티클라우드 |

**현실 세계의 비유 (비IT 대상):**
> "ECS는 Apple의 iOS이다. Apple 제품 간의 연동은 뛰어나지만, Apple 이외의 세계에는 옮기기 어렵다. EKS는 Android(Kubernetes)이다. 어떤 제조사의 스마트폰에서든 작동하는 앱을 만들 수 있지만, 설정 항목이 많아서 활용하려면 지식이 필요하다."

---

### Amazon ECR (Elastic Container Registry)

**정의:** AWS의 완전 관리형 Docker 컨테이너 레지스트리이다. 컨테이너 이미지의 저장, 관리, 배포를 수행한다. 프라이빗 리포지토리와 퍼블릭 리포지토리(ECR Public Gallery)를 제공한다. 수명주기 정책으로 오래된 이미지를 자동 삭제하고, 이미지 스캔으로 취약점을 검출하며, 교차 리전 복제로 DR에 대응할 수 있다.

**소크라테스식 심화:**
> Q: "ECR의 수명주기 정책은 왜 중요한가?"
> A: CI/CD 파이프라인에서 빈번하게 이미지를 빌드하면, 오래된 이미지가 축적되어 스토리지 비용이 증가한다. 수명주기 정책으로 "최신 10개의 이미지만 유지", "30일 이상 된 이미지는 삭제"와 같은 규칙을 설정하여, 자동으로 정리할 수 있다. 책장 정리와 같다. 새 책(이미지)을 살 때마다 오래된 책을 버리지 않으면, 결국 선반(스토리지)이 넘친다.
> Q: "ECR의 이미지 스캔에는 어떤 종류가 있는가?"
> A: 2가지가 있다. Basic scanning(무료)은 Clair OSS 기반으로, 푸시 시 또는 수동으로 스캔한다. CVE(Common Vulnerabilities and Exposures) 데이터베이스에 기반한 취약점 검출이다. Enhanced scanning(유료)은 Amazon Inspector와 통합되어, OS 및 프로그래밍 언어 패키지 모두를 지속적으로 스캔한다. 새로운 취약점이 발견되면 자동으로 재스캔된다. 운영 환경에서는 Enhanced scanning이 권장된다.

**현실 세계의 비유 (비IT 대상):**
> "ECR은 창고형 문서 보관소이다. 설계도(이미지)를 안전하게 보관하고, 필요할 때 바로 꺼낼 수 있다. 수명주기 정책은 '3년 이상 된 설계도는 폐기한다'는 사내 규정이다. 이미지 스캔은 정기적인 방충 검사로, 문제 있는 서류를 조기에 발견하는 구조이다."

---

### ECS Service Discovery

**정의:** AWS Cloud Map과 통합된 서비스 검색 기능이다. 마이크로서비스 간 통신에서 다른 서비스의 IP 주소나 포트를 동적으로 검색하는 구조이다. DNS 네임스페이스(Namespace)를 생성하고, 각 ECS Service를 서비스 이름으로 등록한다. 다른 서비스는 DNS 이름(예: `api.local`)으로 통신 대상을 해석할 수 있다.

**소크라테스식 심화:**
> Q: "왜 Service Discovery가 필요한가? 로드 밸런서만으로는 부족한가?"
> A: 마이크로서비스 아키텍처에서는 수십~수백 개의 서비스가 상호 통신한다. 모든 서비스 간 통신에 ALB를 배치하면 비용이 막대해진다. Service Discovery는 DNS 기반의 경량 해결 수단을 제공한다. 사내의 서비스A가 서비스B를 호출할 경우, `service-b.internal`이라는 DNS 이름으로 직접 통신할 수 있다. ALB가 필요한 것은 외부로부터의 트래픽 수신뿐이다. 사내 구성원끼리는 내선전화(Service Discovery), 외부 착신만 접수처(ALB)를 통하는 이미지이다.
> Q: "Cloud Map의 네임스페이스에는 어떤 종류가 있는가?"
> A: HTTP 네임스페이스(API 호출 기반), Public DNS 네임스페이스(인터넷에서 해석 가능), Private DNS 네임스페이스(VPC 내에서만 해석)의 3가지이다. ECS Service Discovery에서는 보통 Private DNS 네임스페이스를 사용하여, VPC 내부에서의 서비스 간 통신을 DNS 이름으로 수행한다.

**현실 세계의 비유 (비IT 대상):**
> "사내 내선전화 번호부이다. 새로운 부서(서비스)가 생기면 자동으로 번호부에 등록되며, 다른 부서는 부서명으로 전화할 수 있다. 부서가 이전(IP 주소 변경)해도 번호부가 자동 갱신되므로, 이전 번호로 전화할 걱정이 없다."

---

### 컨테이너 네트워킹

**정의:** ECS 태스크의 네트워킹 모드는 awsvpc 모드, bridge 모드, host 모드의 3가지이다. awsvpc 모드가 권장되며, Fargate에서는 유일한 옵션이다. 각 태스크에 전용 ENI(Elastic Network Interface)가 할당되어, Security Group을 태스크 수준에서 적용할 수 있다.

**소크라테스식 심화:**
> Q: "3가지 네트워킹 모드의 차이는 무엇인가?"
> A: bridge 모드: Docker 표준의 브리지 네트워크이다. 호스트 EC2의 ENI를 공유하며, 포트 매핑으로 컨테이너에 접근한다. 같은 포트를 사용하는 여러 컨테이너가 공존하기 어렵다(포트 충돌). host 모드: 컨테이너가 호스트 EC2의 네트워크 스택을 직접 사용한다. 포트 매핑이 불필요하지만, 같은 포트를 사용하는 컨테이너는 하나뿐이다. awsvpc 모드: 각 태스크에 전용 ENI와 프라이빗 IP가 할당된다. Security Group을 태스크 단위로 적용할 수 있으며, 다른 AWS 서비스와의 통신이 단순해진다.
> Q: "awsvpc 모드의 제약은 무엇인가?"
> A: 각 태스크에 ENI가 필요하므로, EC2 인스턴스 유형별 ENI 상한에 도달할 가능성이 있다. 예를 들어, t3.micro는 최대 2 ENI(호스트용 1 + 태스크용 1)이므로 인스턴스당 태스크 1개만 실행할 수 있다. ENI 수가 많은 인스턴스 유형을 선택하거나, ENI trunking(awsvpc trunking)을 활성화하여 상한을 확대한다. Fargate에서는 이 제약이 존재하지 않는다(각 태스크에 자동으로 ENI가 할당된다).

| 네트워크 모드 | ENI | Security Group | 포트 매핑 | Fargate 지원 |
|-------------|-----|----------------|----------|-------------|
| awsvpc | 태스크 전용 | 태스크 수준 | 불필요 | 지원(유일) |
| bridge | 호스트 공유 | 호스트 수준 | 필요(동적/정적) | 미지원 |
| host | 호스트 공유 | 호스트 수준 | 불필요(호스트 포트 사용) | 미지원 |

**현실 세계의 비유 (비IT 대상):**
> "awsvpc는 각 세대에 전용 현관과 우편함이 있는 아파트이다. bridge는 셰어하우스로, 현관은 공유하지만 방 번호(포트 매핑)로 구분한다. host는 동거로, 집의 설비를 직접 사용하지만 자유도가 낮다."

---

### Container Insights

**정의:** Amazon CloudWatch의 기능으로, 컨테이너화된 애플리케이션의 성능 모니터링과 로그 수집을 제공한다. CPU/메모리 사용률, 네트워크 I/O, 스토리지 I/O를 클러스터, 서비스, 태스크 수준에서 시각화한다. 로그 수집에는 FireLens(Fluent Bit/Fluentd 통합)를 사용하며, CloudWatch Logs, S3, Elasticsearch 등으로 전송할 수 있다.

**소크라테스식 심화:**
> Q: "Container Insights와 CloudWatch 표준 메트릭의 차이는 무엇인가?"
> A: CloudWatch 표준 메트릭은 ECS 서비스 수준의 CPU/메모리 사용률만 제공한다. Container Insights는 태스크 수준, 컨테이너 수준의 상세한 메트릭을 제공한다. 대시보드에서 개별 태스크의 리소스 소비를 확인할 수 있어, 성능 문제의 원인 특정이 용이해진다. 추가 비용이 발생하지만, 운영 환경에서는 필수적인 가시화 도구이다.
> Q: "FireLens란 무엇인가? 왜 CloudWatch Logs 직접 출력 대신 사용하는가?"
> A: FireLens는 ECS의 로그 라우터로, Fluent Bit 또는 Fluentd를 사이드카 컨테이너로 실행한다. 장점은 유연한 로그 전송처 설정이다. CloudWatch Logs뿐만 아니라, S3, Kinesis Data Firehose, Elasticsearch, 외부의 Splunk 등에 동시에 로그를 전송할 수 있다. 또한 로그의 필터링, 파싱, 보강(메타데이터 추가)이 가능하다. CloudWatch Logs 직접 출력(awslogs driver)은 심플하지만, 전송처나 가공의 유연성이 부족하다.

**현실 세계의 비유 (비IT 대상):**
> "Container Insights는 공장의 감시 카메라 시스템이다. 각 생산 라인(태스크)의 가동률, 에러율을 실시간으로 감시한다. FireLens는 우편물 분류 센터이다. 사내 각 부서(컨테이너)의 보고서(로그)를 수신처별(CloudWatch, S3, 외부 시스템)로 자동 분류하여 배송한다."

---

### 컨테이너의 Auto Scaling

**정의:** ECS에서는 Service Auto Scaling으로 태스크 수를 동적으로 조정한다. Target Tracking(메트릭의 목표값 유지), Step Scaling(임계값에 따른 단계적 스케일링), Scheduled Scaling(스케줄 기반)의 3가지가 있다. EC2 시작 유형에서는 Cluster Auto Scaling(Capacity Provider)이 EC2 인스턴스의 추가/삭제를 관리하며, 태스크 스케일링과 인프라 스케일링의 2계층 구조가 된다.

**소크라테스식 심화:**
> Q: "ECS Service Auto Scaling과 Cluster Auto Scaling의 관계는?"
> A: Service Auto Scaling은 "몇 명의 직원(태스크)이 필요한가"를 결정한다. Cluster Auto Scaling(Capacity Provider)은 "몇 대의 책상(EC2 인스턴스)이 필요한가"를 결정한다. 직원을 늘려도 앉을 책상이 없으면 일할 수 없다. Capacity Provider는 태스크가 앉을 곳이 없음을 감지하고, 자동으로 EC2 인스턴스를 추가한다. Fargate에서는 책상 관리가 불필요하다(태스크 수준에서 자동 스케일링).
> Q: "Target Tracking Scaling의 전형적인 설정은?"
> A: 가장 일반적인 것은 ECSServiceAverageCPUUtilization(CPU 사용률 평균)을 70%로 유지하는 설정이다. CPU 사용률이 70%를 초과하면 태스크가 추가되고, 하회하면 삭제된다. 메모리 사용률(ECSServiceAverageMemoryUtilization)이나, ALB의 요청 수(ALBRequestCountPerTarget)도 사용 가능하다. Target Tracking은 "에어컨의 온도 조절기"처럼, 목표값에 자동으로 조정된다.

**현실 세계의 비유 (비IT 대상):**
> "레스토랑의 인력 관리이다. Service Auto Scaling은 점심시간에 웨이터를 늘리고, 한산한 시간에 줄인다(태스크 수 조정). Cluster Auto Scaling은 웨이터가 너무 많아지면 테이블과 의자를 추가한다(EC2 추가). Fargate의 경우는 푸드코트처럼, 손님이 올 때마다 빈자리에 안내하기만 하면 되고, 테이블 준비는 불필요하다."

---

### ECS vs EKS 판단 기준

**정의:** ECS와 EKS의 선택은 팀의 기술력, 기존의 Kubernetes 경험, 멀티클라우드 요구 사항, 운영의 복잡성, 비용, 에코시스템 요구에 기반하여 판단한다.

**소크라테스식 심화:**
> Q: "어떤 조직이 ECS를 선택하고, 어떤 조직이 EKS를 선택하는가?"
> A: ECS를 선택하는 경우: (1) AWS만 사용하며, 멀티클라우드 예정이 없다 (2) 팀에 Kubernetes 경험자가 없다 (3) 심플한 컨테이너 운영으로 충분하다 (4) AWS 서비스와의 깊은 통합이 우선이다 (5) 컨트롤 플레인 비용을 억제하고 싶다(ECS 무료 vs EKS $72/월). EKS를 선택하는 경우: (1) 이미 Kubernetes의 지식과 툴체인이 있다 (2) 멀티클라우드나 하이브리드 클라우드 예정이 있다 (3) Kubernetes 고유의 기능(Custom Resource, Operator, Service Mesh)이 필요하다 (4) OSS 에코시스템(Helm, Argo CD, Prometheus)을 활용하고 싶다 (5) 온프레미스에서의 마이그레이션으로 Kubernetes를 사용 중이다.
> Q: "ECS에서 EKS로의 마이그레이션은 용이한가?"
> A: Task Definition은 Kubernetes의 Pod spec과 개념적으로 유사하지만, 직접적인 호환성은 없다. 마이그레이션 도구(aws-containers/amazon-ecs-to-eks 등)가 존재하지만, 네트워킹, 서비스 디스커버리, IAM 통합, CI/CD 파이프라인 전체를 재설계해야 한다. 최초의 선택이 중요하다.

**현실 세계의 비유 (비IT 대상):**
> "ECS는 한국어 전용 워드프로세서이다. 한국 내 문서 작성에 최적화되어 있어 사용하기 편리하지만, 해외에서는 사용할 수 없다. EKS는 Microsoft Word이다. 전 세계에서 사용할 수 있지만, 기능이 너무 풍부해서 활용하려면 교육이 필요하다. 작은 사무실에는 워드프로세서, 글로벌 기업에는 Word가 적합하다."

---

## 아키텍처 패턴

### 패턴1: 마이크로서비스 on ECS Fargate + ALB

```
인터넷 → ALB (HTTPS:443)
                    |
    ┌───────────────┼───────────────┐
    |               |               |
    v               v               v
Target Group A  Target Group B  Target Group C
(User Service)  (Order Service) (Payment Service)
[Fargate Task]  [Fargate Task]  [Fargate Task]
[Fargate Task]  [Fargate Task]  [Fargate Task]
    |               |               |
    v               v               v
  RDS             DynamoDB        RDS
(Users DB)      (Orders Table)  (Payments DB)
```

- ALB의 경로 기반 라우팅으로 각 마이크로서비스에 트래픽을 분산
- Fargate를 통해 인프라 관리 불필요, 서비스별 독립 스케일링
- 각 서비스에 전용 Task Role(IAM)을 부여하여 최소 권한 원칙 적용
- Service Discovery로 East-West(서비스 간) 통신 실현
- awsvpc 모드로 각 태스크에 Security Group 적용

### 패턴2: EKS + Managed Node Groups + Cluster Autoscaler

```
kubectl / CI/CD → EKS Control Plane (AWS Managed)
                        |
            ┌───────────┼───────────┐
            |           |           |
            v           v           v
      Managed Node   Managed Node  Managed Node
      Group (AZ-a)   Group (AZ-c)  Group (AZ-d)
      [m5.xlarge]    [m5.xlarge]   [m5.xlarge]
      [Pod][Pod]     [Pod][Pod]    [Pod][Pod]
            |
            v
    Cluster Autoscaler (Pod)
    → Node 수의 자동 조정

    Horizontal Pod Autoscaler
    → Pod 수의 자동 조정
```

- EKS Managed Node Groups로 EC2 노드의 자동 관리(AMI 업데이트, 드레인)
- Cluster Autoscaler가 수요에 따라 노드를 추가/삭제
- HPA가 CPU/메모리 사용률에 따라 Pod 수를 조정
- 멀티AZ에 분산하여 High Availability(고가용성) 확보
- IAM Roles for Service Accounts(IRSA)로 Pod 수준의 IAM 제어

### 패턴3: CI/CD Pipeline with ECR + CodePipeline + ECS Blue/Green

```
개발자 → CodeCommit/GitHub
              |
              v
         CodePipeline
              |
         ┌────┴────┐
         v         v
    CodeBuild    CodeBuild
    (Build)      (Test)
         |
         v
    ECR Push
    (새 이미지)
         |
         v
    CodeDeploy
    (Blue/Green)
         |
    ┌────┴────┐
    v         v
  Blue TG   Green TG
  (현행)     (신규)
    └────┬────┘
         v
        ALB
    (트래픽 전환)
```

- CodeBuild로 Docker 이미지를 빌드하고 ECR에 푸시
- CodeDeploy의 Blue/Green 배포로 안전하게 릴리스
- 테스트 리스너(포트 8443 등)로 새 버전을 사전 검증
- 문제 발생 시 ALB의 Target Group 전환으로 즉시 롤백
- ECR의 수명주기 정책으로 오래된 이미지를 자동 정리

### 패턴4: 사이드카 패턴 (Envoy Proxy, Log Router)

```
ECS Task Definition
┌─────────────────────────────────┐
│                                 │
│  ┌──────────────┐               │
│  │ App Container│ ← 메인 앱     │
│  │ (Port 8080)  │               │
│  └───────┬──────┘               │
│          │                      │
│  ┌───────┴──────┐               │
│  │ Envoy Proxy  │ ← 사이드카    │
│  │ (Port 9901)  │  (트래픽      │
│  └──────────────┘   관리)       │
│                                 │
│  ┌──────────────┐               │
│  │ Fluent Bit   │ ← 사이드카    │
│  │ (Log Router) │  (로그 전송)  │
│  └──────────────┘               │
│                                 │
│  공유 볼륨                       │
└─────────────────────────────────┘
```

- 메인 컨테이너 + 보조 컨테이너를 동일 태스크에 배치
- Envoy Proxy로 서비스 메시의 데이터 플레인 구성
- Fluent Bit(FireLens)으로 로그 수집, 필터링, 전송
- 공유 볼륨으로 컨테이너 간 데이터 공유
- 각 컨테이너는 독립된 라이프사이클로 업데이트 가능

### 패턴5: Service Mesh (App Mesh / EKS with Istio)

```
┌────────────────────────────────────┐
│          AWS App Mesh              │
│     (컨트롤 플레인)                  │
│                                    │
│  Virtual Node A    Virtual Node B  │
│  ┌────────────┐   ┌────────────┐  │
│  │ App A      │   │ App B      │  │
│  │ + Envoy    │──→│ + Envoy    │  │
│  └────────────┘   └────────────┘  │
│        |                |          │
│  Virtual Service   Virtual Router  │
│  (DNS명으로 해석)   (트래픽         │
│                     규칙)          │
│                                    │
│  Virtual Gateway                   │
│  (외부 트래픽 수신)                  │
└────────────────────────────────────┘
```

- App Mesh는 AWS 관리형 서비스 메시(ECS/EKS/EC2 지원)
- Envoy 프록시를 자동 주입하여 서비스 간 통신을 제어
- mTLS(상호 TLS)로 서비스 간 암호화 및 인증
- 트래픽 라우팅(카나리 릴리스, A/B 테스트)
- 분산 트레이싱(X-Ray 통합)으로 요청 플로우의 가시화
- EKS에서는 Istio도 선택 가능(더 풍부한 기능, OSS 에코시스템)

## SAA 시험 포인트

| 토픽 | 출제 포인트 | 키워드 |
|------|-----------|--------|
| ECS 시작 유형 비교 | EC2는 GPU 지원 및 비용 최적화, Fargate는 서버리스로 Ops 불필요 | EC2 vs Fargate, GPU, Savings Plans |
| Task Definition vs Service vs Cluster | Task Definition은 컨테이너 설계도, Service는 실행 관리, Cluster는 논리 그룹 | Task Definition, Desired Count, Cluster |
| awsvpc 네트워크 모드 | Fargate에서는 유일한 모드. 태스크마다 ENI 및 Security Group 적용 | ENI, Security Group per task, VPC |
| ECR 수명주기 정책 | 오래된 이미지의 자동 삭제로 비용 최적화. 규칙의 우선순위에 주의 | Lifecycle Policy, Image Retention |
| EKS Managed vs Self-managed | Managed Node Groups는 AMI 자동 업데이트 및 드레인 자동화. Self-managed는 커스텀 AMI | Managed Node Group, AMI Update |
| Fargate 임시 스토리지 | 기본 20GB, 최대 200GB. 영속화에는 EFS | 20GB default, 200GB max, EFS |
| IAM 역할 분리 | Task Execution Role(ECR pull, 로그 전송) vs Task Role(앱의 AWS 접근) | Execution Role, Task Role |
| 컨테이너 헬스 체크 | Task Definition에서 정의. ELB 헬스 체크와는 독립적 | HEALTHCHECK, healthCheck |
| ECS Capacity Providers | EC2 인스턴스의 자동 스케일링. Target Capacity로 사용률 설정 | Capacity Provider, Target Capacity |
| Blue/Green 배포 | CodeDeploy와 통합. ALB의 2개 Target Group을 전환 | CodeDeploy, Target Group Switch |
| Service Discovery | Cloud Map 통합. DNS 이름으로 서비스 간 통신. ALB 불필요의 East-West 통신 | Cloud Map, DNS, Namespace |
| ECR 교차 리전 복제 | DR 대책. 프라이머리 리전의 이미지를 세컨더리에 자동 복제 | Cross-region Replication, DR |
| 컨테이너 로그 수집 | awslogs(심플) vs FireLens(유연). FireLens는 Fluent Bit/Fluentd | awslogs, FireLens, Fluent Bit |

## 핸즈온 참조

### 권장 핸즈온 절차

1. **ECR 리포지토리 구축:**
   - 프라이빗 리포지토리 생성
   - 수명주기 정책 설정(최신 5개 이미지 유지)
   - 이미지 스캔 활성화(Basic scanning)
   - Docker 이미지 빌드 및 푸시

2. **ECS Fargate Service 구축:**
   - Cluster 생성
   - Task Definition 생성(Fargate 유형)
   - Task Execution Role과 Task Role 설정
   - Service 생성(Desired Count: 2)
   - ALB와의 통합
   - Service Auto Scaling 설정(CPU 70%)

3. **Service Discovery 설정:**
   - Cloud Map Namespace 생성(Private DNS)
   - ECS Service와의 Service Discovery 통합
   - 서비스 간 DNS 기반 통신 테스트

4. **CI/CD 파이프라인 구축:**
   - CodeBuild 프로젝트(Docker 빌드 + ECR 푸시)
   - CodeDeploy(Blue/Green 배포)
   - CodePipeline(소스 → 빌드 → 배포의 자동화)

## Well-Architected 체크리스트

### Operational Excellence (운영 우수성)

- [ ] Task Definition이 버전 관리되고, 코드로 관리되고 있는가(IaC)
- [ ] CI/CD 파이프라인이 구축되어, 배포가 자동화되어 있는가
- [ ] Container Insights가 활성화되어, 성능 메트릭이 가시화되어 있는가
- [ ] 로그 수집 전략(awslogs 또는 FireLens)이 정의되고, 구조화 로그가 구현되어 있는가
- [ ] Blue/Green 배포로 롤백 절차가 확립되어 있는가
- [ ] ECR 수명주기 정책으로 오래된 이미지가 자동 정리되고 있는가

### Performance Efficiency (성능 효율)

- [ ] 태스크의 CPU/메모리 리소스가 적절히 사이징되어 있는가(과잉/부족 없음)
- [ ] Service Auto Scaling이 설정되어, 수요 변동에 자동 대응할 수 있는가
- [ ] EC2 시작 유형의 경우, Capacity Provider로 클러스터 수준의 스케일링이 설정되어 있는가
- [ ] awsvpc 모드를 사용하여, 태스크 수준의 네트워킹이 적용되어 있는가
- [ ] Fargate의 임시 스토리지 크기가 적절히 설정되어 있는가

### Security (보안)

- [ ] Task Execution Role과 Task Role이 분리되어, 최소 권한 원칙이 적용되어 있는가
- [ ] ECR의 이미지 스캔이 활성화되어, 취약점 있는 이미지가 배포되지 않는가
- [ ] Security Group이 태스크 수준에서 적용되어, 필요한 포트만 개방되어 있는가
- [ ] ECR 리포지토리에 리소스 기반 정책이 설정되어, 무단 접근이 방지되어 있는가
- [ ] 컨테이너가 non-root 사용자로 실행되고 있는가
- [ ] Secrets Manager/Parameter Store로 시크릿이 Task Definition에 안전하게 주입되어 있는가

### Reliability (신뢰성)

- [ ] 태스크가 여러 AZ에 분산 배치되어 있는가
- [ ] 헬스 체크(ELB + 컨테이너 수준)가 적절히 설정되어 있는가
- [ ] Desired Count가 2 이상으로 설정되어, 단일 장애점이 제거되어 있는가
- [ ] ECR 교차 리전 복제로 이미지의 DR 대책이 되어 있는가

### Cost Optimization (비용 최적화)

- [ ] 워크로드 특성에 따라 EC2/Fargate를 적절히 선택하고 있는가
- [ ] Fargate Spot이나 EC2 Spot Instances로 비용 절감을 검토하고 있는가
- [ ] ECR 수명주기 정책으로 스토리지 비용을 최적화하고 있는가
- [ ] 태스크의 리소스 할당(CPU/메모리)이 실사용량에 기반하여 적정화되어 있는가
