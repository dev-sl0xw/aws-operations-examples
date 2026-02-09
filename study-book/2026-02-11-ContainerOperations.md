# セクション14: コンテナ運用 (Container Operations)
> Well-Architected Pillars: Operational Excellence, Performance Efficiency, Security
> Day: 4 | 難易度: 中級〜上級

## 概要

コンテナ技術は、アプリケーションのパッケージング・デプロイ・スケーリングを根本的に変革した。Dockerコンテナは「一度ビルドすれば、どこでも動く」という原則を実現し、開発環境と本番環境の差異を最小化する。AWSはコンテナワークロードを運用するための包括的なサービス群を提供しており、Amazon ECS(Elastic Container Service)とAmazon EKS(Elastic Kubernetes Service)が二大オーケストレーションサービスとして位置づけられる。

ECSはAWSネイティブのコンテナオーケストレーターであり、AWSサービスとの深い統合が特徴。Task Definition、Service、Clusterの3層構造でコンテナを管理し、EC2起動タイプとFargate起動タイプの2つのコンピューティングモデルを選択できる。一方、EKSはKubernetesのマネージドサービスであり、オープンソースエコシステムとの互換性とマルチクラウドポータビリティが強み。AWS Fargateはサーバーレスコンピューティングエンジンとして、ECSとEKSの両方で利用でき、インフラストラクチャ管理から完全に解放される。

SAA試験では、ECSとEKSの使い分け、EC2起動タイプとFargateの比較、Task Definition/Service/Clusterの関係、コンテナネットワーキング(awsvpc)、IAMロールの分離(Task Execution RoleとTask Role)、ECRのライフサイクル管理、およびコンテナベースのCI/CDパイプラインの設計が出題される。コンテナは現代のクラウドアーキテクチャの中核であり、マイクロサービス、CI/CD、DevOpsの文脈で頻繁に登場する。

## キーコンセプト

### コンテナの基礎 (Docker)

**定義:** コンテナはアプリケーションとその依存関係(ライブラリ、ランタイム、設定ファイル等)を一つのパッケージにまとめた軽量な仮想化単位。Docker imageはコンテナの設計図(不変のテンプレート)、containerはimageから起動された実行インスタンス。Dockerfileはimageのビルド手順を記述したテキストファイル。image layerはDockerfileの各命令に対応する差分レイヤーで、キャッシュと再利用を可能にする。registryはimageを保管・配布するリポジトリ(ECR、Docker Hub等)。

**ソクラテス式 深堀り:**
> Q: 「コンテナと仮想マシン(VM)の違いは何か？なぜコンテナが急速に普及したのか？」
> A: VMはゲストOS全体を含む。1つのVMにWindows OSが丸ごと入っていて、その上にアプリケーションが動く。コンテナはホストOSのカーネルを共有し、アプリケーションとその依存関係のみを含む。結果として、コンテナはMB単位(VMはGB単位)、起動時間は秒単位(VMは分単位)、同じハードウェア上で遥かに多くのインスタンスを実行できる。VMが「一戸建て住宅」だとすれば、コンテナは「マンションの一室」。建物の基盤(OS カーネル)は共有するが、各部屋は独立している。
> Q: 「Dockerfileのイメージレイヤーとは何か？なぜ重要なのか？」
> A: Dockerfileの各命令(FROM, RUN, COPY等)は新しいレイヤーを作成する。レイヤーはケーキの層のようなもの。最初の層がベースOS、次の層にランタイムのインストール、次にアプリケーションコード、という具合に積み重なる。重要な点は、レイヤーはキャッシュされること。アプリケーションコードだけ変更した場合、ベースOSとランタイムのレイヤーはキャッシュから再利用され、変更されたレイヤーだけ再ビルドされる。これによりビルド時間が劇的に短縮される。ベストプラクティスとして、変更頻度の低い命令を上に、高い命令を下に配置する。

**現実世界のたとえ (非IT向け):**
> 「コンテナは引っ越しの段ボール箱。食器セット(アプリケーション)、梱包材(ライブラリ)、取り扱い説明書(設定)を一つの箱にまとめる。どの家(サーバー)に運んでも、箱を開ければそのまま使える。VMは家具付きの家を丸ごと引っ越すようなもので、はるかに時間と労力がかかる。」

---

### Amazon ECS (Elastic Container Service)

**定義:** AWSネイティブの完全マネージドコンテナオーケストレーションサービス。Task Definitionでコンテナの設計図(イメージ、CPU/メモリ、ポート、環境変数等)を定義し、ServiceでTask Definitionに基づくタスクの実行数とデプロイ戦略を管理し、Clusterが論理的なグルーピングを提供する。起動タイプとしてEC2(自前のインスタンス管理)とFargate(サーバーレス)を選択できる。

**ソクラテス式 深堀り:**
> Q: 「ECSのTask Definition、Service、Clusterの関係は？」
> A: レストランに例える。Task Definitionは「レシピ」。料理(コンテナ)の材料(イメージ)、調理時間(CPU/メモリ)、盛り付け方(ポートマッピング)を記述する。Serviceは「シェフの指示書」。『この料理を常に3皿用意しておけ。1皿壊れたら自動的に作り直せ』という運用ルール。Clusterは「レストランそのもの」。キッチン設備(EC2インスタンスまたはFargate)と人員(タスク)を管理する論理的な単位。1つのTask Definitionから複数のServiceを作成でき、1つのClusterに複数のServiceを配置できる。
> Q: 「EC2起動タイプとFargate起動タイプの使い分けは？」
> A: EC2起動タイプはインスタンスを自分で管理する。GPUワークロード、特殊なカーネル設定が必要な場合、大量のコンテナによるコスト最適化が重要な場合に選択。Fargateは完全サーバーレスで、インフラ管理不要。バースト的なワークロード、小規模チーム、運用負荷の軽減が優先される場合に最適。コスト面ではEC2(特にReserved/Savings Plans適用時)が安価になることが多いが、EC2のパッチ適用・スケーリング・容量管理のオペレーション負荷を考慮する必要がある。

| 比較項目 | EC2起動タイプ | Fargate起動タイプ |
|----------|--------------|-------------------|
| インフラ管理 | EC2インスタンスの管理が必要 | 完全サーバーレス |
| GPU対応 | 対応 | 非対応 |
| 料金モデル | EC2料金 + ECS無料 | vCPU/メモリの秒単位課金 |
| スケーリング | Cluster Auto Scaling必要 | タスクレベルで自動 |
| ストレージ | EBS、インスタンスストア利用可 | エフェメラルストレージ(20GB〜200GB) |
| セキュリティ | ホストレベルの制御可能 | タスクレベルの分離 |
| カスタマイズ | OS、カーネル設定の自由度高 | 制限あり |
| 適用シーン | GPU、大規模、コスト最適化 | 小〜中規模、運用軽減 |

**現実世界のたとえ (非IT向け):**
> 「EC2起動タイプは自社所有の配送トラック。トラックの購入・メンテナンス・ドライバー雇用が必要だが、カスタマイズが自由で大量配送は安い。Fargateは宅配サービスの利用。荷物(コンテナ)を渡すだけで配送される。トラックの管理は一切不要だが、1件あたりの料金は割高。」

---

### AWS Fargate

**定義:** コンテナ向けのサーバーレスコンピューティングエンジン。ECSとEKSの両方で利用可能。EC2インスタンスのプロビジョニング・スケーリング・パッチ適用が不要。タスクレベルのネットワーキング(各タスクに専用ENI)とタスクレベルのリソース分離を提供する。エフェメラルストレージはデフォルト20GBで最大200GBまで拡張可能。

**ソクラテス式 深堀り:**
> Q: 「Fargateのタスクレベルネットワーキングとは何か？なぜ重要か？」
> A: Fargateでは各タスクに専用のENI(Elastic Network Interface)が割り当てられる。これはマンションで各部屋に専用の玄関(ネットワークインターフェース)があるようなもの。各タスクが独自のプライベートIPアドレスを持ち、Security Groupをタスクレベルで適用できる。EC2起動タイプのbridge/hostモードでは、複数のコンテナが同じEC2のネットワークを共有するため、きめ細かなアクセス制御が困難だった。
> Q: 「Fargateのエフェメラルストレージの制限は何か？」
> A: Fargateタスクのストレージはエフェメラル(一時的)で、タスク終了時にデータが消失する。デフォルト20GB、最大200GBまでTask Definition内で設定可能。永続化が必要なデータはEFS(Elastic File System)をマウントするか、S3に書き出す。EBSはFargateタスクにはアタッチできない(EC2起動タイプのみ)。試験では「Fargateで永続ストレージが必要な場合 → EFS」というパターンが頻出。

**現実世界のたとえ (非IT向け):**
> 「Fargateはタクシーサービス。行き先(タスク)を伝えるだけで、車(インフラ)の整備や駐車場の確保は一切不要。乗車中のトランク(エフェメラルストレージ)は使えるが、降車後に荷物は残せない。大きな荷物を永久に保管したい場合は、倉庫(EFS/S3)に預ける必要がある。」

---

### Amazon EKS (Elastic Kubernetes Service)

**定義:** Kubernetesのフルマネージドサービス。Kubernetesのコントロールプレーン(API server, etcd, scheduler, controller manager)をAWSが管理する。ワーカーノードとしてManaged Node Groups(AWSがEC2を管理)、Self-managed Node Groups(ユーザーがEC2を管理)、Fargate Profiles(サーバーレス)の3種類を選択できる。Kubernetesエコシステムのツール(Helm, kubectl, Istio等)をそのまま利用でき、マルチクラウド・ハイブリッドクラウドのポータビリティが高い。

**ソクラテス式 深堀り:**
> Q: 「EKSのManaged Node GroupsとSelf-managed Node Groups、Fargate Profilesの違いは？」
> A: Managed Node GroupsはAWSがEC2インスタンスのプロビジョニング、AMIの更新、ノードのドレインを自動管理する。最もバランスの取れた選択肢。Self-managed Node Groupsはユーザーが完全に制御する。カスタムAMI、特殊なインスタンスタイプ、既存のAuto Scaling Group統合が必要な場合に選択。Fargate ProfilesはNamespaceとラベルに基づいてPodをFargate上で実行する。DaemonSet非対応、GPUワークロード非対応という制約があるが、ノード管理が完全に不要。
> Q: 「ECSとEKSの根本的な違いは何か？」
> A: ECSは「AWSに最適化された独自のオーケストレーター」。AWSサービスとの統合が深く、学習曲線が緩やか。EKSは「業界標準のKubernetesのマネージド版」。Kubernetesの全機能(Custom Resource、Operator等)が利用可能で、他クラウドやオンプレミスとの互換性が高い。ECSは「AWSの標準語」、EKSは「国際共通語(Kubernetes)のAWS方言」と考えるとわかりやすい。

| 比較項目 | ECS | EKS |
|----------|-----|-----|
| オーケストレーター | AWS独自 | Kubernetes (OSS) |
| 学習曲線 | 緩やか | 急勾配 |
| AWS統合 | 深い(ネイティブ) | プラグイン経由 |
| マルチクラウド | AWS専用 | GKE, AKSと互換 |
| エコシステム | AWS固有 | Helm, Istio, Argo等 |
| 料金 | コントロールプレーン無料 | $0.10/時間 (≒$72/月) |
| Fargate対応 | あり | あり |
| 運用負荷 | 低 | 中〜高 |
| 適用シーン | AWSメイン、シンプル | K8s経験者、マルチクラウド |

**現実世界のたとえ (非IT向け):**
> 「ECSはAppleのiOS。Apple製品間の連携は抜群だが、Apple以外の世界には持ち出しにくい。EKSはAndroid(Kubernetes)。どのメーカーのスマートフォンでも動くアプリが作れるが、設定項目が多く、使いこなすには知識が必要。」

---

### Amazon ECR (Elastic Container Registry)

**定義:** AWSのフルマネージドDockerコンテナレジストリ。コンテナイメージの保存、管理、デプロイを行う。プライベートリポジトリとパブリックリポジトリ(ECR Public Gallery)を提供する。ライフサイクルポリシーで古いイメージの自動削除、イメージスキャンで脆弱性検出、クロスリージョンレプリケーションでDR対応が可能。

**ソクラテス式 深堀り:**
> Q: 「ECRのライフサイクルポリシーはなぜ重要か？」
> A: CI/CDパイプラインで頻繁にイメージをビルドすると、古いイメージが蓄積しストレージコストが増大する。ライフサイクルポリシーで「最新10個のイメージだけ保持」「30日以上古いイメージは削除」といったルールを設定し、自動的にクリーンアップできる。本棚の整理と同じ。新しい本(イメージ)を買うたびに古い本を捨てないと、いずれ棚(ストレージ)があふれる。
> Q: 「ECRのイメージスキャンにはどのような種類があるか？」
> A: 2種類ある。Basic scanning(無料)はClair OSSベースで、プッシュ時または手動でスキャン。CVE(Common Vulnerabilities and Exposures)データベースに基づく脆弱性検出。Enhanced scanning(有料)はAmazon Inspectorと統合し、OS・プログラミング言語パッケージの両方を継続的にスキャン。新しい脆弱性が発見されると自動的に再スキャンされる。本番環境ではEnhanced scanningが推奨。

**現実世界のたとえ (非IT向け):**
> 「ECRは倉庫型の書庫。設計図(イメージ)を安全に保管し、必要なときにすぐ取り出せる。ライフサイクルポリシーは『3年以上前の設計図は廃棄する』という社内ルール。イメージスキャンは定期的な防虫検査で、問題のある書類を早期発見する仕組み。」

---

### ECS Service Discovery

**定義:** AWS Cloud Mapと統合したサービス検出機能。マイクロサービス間の通信で、他のサービスのIPアドレスやポートを動的に検出する仕組み。DNS名前空間(Namespace)を作成し、各ECS Serviceをサービス名で登録する。他のサービスはDNS名(例: `api.local`)で通信先を解決できる。

**ソクラテス式 深堀り:**
> Q: 「なぜService Discoveryが必要なのか？ロードバランサーだけでは不十分か？」
> A: マイクロサービスアーキテクチャでは数十〜数百のサービスが相互に通信する。全てのサービス間通信にALBを配置するとコストが膨大になる。Service DiscoveryはDNSベースの軽量な解決手段を提供する。社内のサービスAがサービスBを呼ぶ場合、`service-b.internal`というDNS名で直接通信できる。ALBが必要なのは外部からのトラフィック受信のみ。社内のメンバー同士は内線電話(Service Discovery)、外部からの着信だけ受付(ALB)を通す、というイメージ。
> Q: 「Cloud Mapの名前空間にはどのような種類があるか？」
> A: HTTP名前空間(API呼び出しベース)、Public DNS名前空間(インターネットから解決可能)、Private DNS名前空間(VPC内のみで解決)の3種類。ECS Service Discoveryでは通常Private DNS名前空間を使用し、VPC内部でのサービス間通信をDNS名で行う。

**現実世界のたとえ (非IT向け):**
> 「社内の内線電話番号簿。新しい部署(サービス)ができたら自動的に番号簿に登録され、他の部署は部署名で電話できる。部署が移転(IPアドレス変更)しても番号簿が自動更新されるので、古い番号にかけてしまう心配がない。」

---

### コンテナネットワーキング

**定義:** ECSタスクのネットワーキングモードは、awsvpcモード、bridgeモード、hostモードの3種類。awsvpcモードが推奨であり、Fargateでは唯一のオプション。各タスクに専用のENI(Elastic Network Interface)が割り当てられ、Security Groupをタスクレベルで適用できる。

**ソクラテス式 深堀り:**
> Q: 「3つのネットワーキングモードの違いは何か？」
> A: bridgeモード：Docker標準のブリッジネットワーク。ホストEC2のENIを共有し、ポートマッピングでコンテナにアクセスする。同じポートを使う複数のコンテナが同居しにくい(ポート競合)。hostモード：コンテナがホストEC2のネットワークスタックを直接使用する。ポートマッピング不要だが、同じポートを使うコンテナは1つだけ。awsvpcモード：各タスクに専用のENIとプライベートIPが割り当てられる。Security Groupをタスク単位で適用でき、他のAWSサービスとの通信がシンプルになる。
> Q: 「awsvpcモードの制約は何か？」
> A: 各タスクにENIが必要なため、EC2インスタンスタイプごとのENI上限に達する可能性がある。例えば、t3.microは最大2 ENI(ホスト用1 + タスク用1)のため、1インスタンスあたり1タスクしか実行できない。ENI数が多いインスタンスタイプを選ぶか、ENI trunking(awsvpc trunking)を有効化して上限を拡大する。Fargateではこの制約は存在しない(各タスクに自動的にENIが割り当てられる)。

| ネットワークモード | ENI | Security Group | ポートマッピング | Fargate対応 |
|-------------------|-----|----------------|-----------------|-------------|
| awsvpc | タスク専用 | タスクレベル | 不要 | 対応(唯一) |
| bridge | ホスト共有 | ホストレベル | 必要(動的/静的) | 非対応 |
| host | ホスト共有 | ホストレベル | 不要(ホストポート使用) | 非対応 |

**現実世界のたとえ (非IT向け):**
> 「awsvpcは各テナントに専用の玄関と郵便受けがあるマンション。bridgeはシェアハウスで、玄関は共有だが部屋番号(ポートマッピング)で振り分ける。hostは同居で、家の設備を直接使うが自由度が低い。」

---

### Container Insights

**定義:** Amazon CloudWatchの機能で、コンテナ化されたアプリケーションのパフォーマンス監視とログ収集を提供する。CPU/メモリ使用率、ネットワークI/O、ストレージI/Oをクラスター・サービス・タスクレベルで可視化する。ログ収集にはFireLens(Fluent Bit/Fluentd統合)を使用し、CloudWatch Logs、S3、Elasticsearch等に転送できる。

**ソクラテス式 深堀り:**
> Q: 「Container InsightsとCloudWatch標準メトリクスの違いは何か？」
> A: CloudWatch標準メトリクスはECSサービスレベルのCPU/メモリ使用率のみ。Container Insightsはタスクレベル、コンテナレベルの詳細なメトリクスを提供する。ダッシュボードで個々のタスクのリソース消費を確認でき、パフォーマンス問題の原因特定が容易になる。追加料金が発生するが、本番環境では必須の可視化ツール。
> Q: 「FireLensとは何か？なぜCloudWatch Logs直接出力ではなく使うのか？」
> A: FireLensはECSのログルーターで、Fluent BitまたはFluentdをサイドカーコンテナとして実行する。利点は柔軟なログ転送先の設定。CloudWatch Logsだけでなく、S3、Kinesis Data Firehose、Elasticsearch、外部のSplunk等に同時にログを送信できる。また、ログのフィルタリング、パース、エンリッチメント(メタデータ追加)が可能。CloudWatch Logs直接出力(awslogs driver)はシンプルだが、転送先や加工の柔軟性に欠ける。

**現実世界のたとえ (非IT向け):**
> 「Container Insightsは工場の監視カメラシステム。各生産ライン(タスク)の稼働率、エラー率をリアルタイムで監視する。FireLensは郵便物の仕分けセンター。社内の各部署(コンテナ)からの報告書(ログ)を、宛先別(CloudWatch、S3、外部システム)に自動仕分けして配送する。」

---

### コンテナのAuto Scaling

**定義:** ECSではService Auto Scalingでタスク数を動的に調整する。Target Tracking(メトリクスの目標値維持)、Step Scaling(閾値に応じた段階的スケーリング)、Scheduled Scaling(スケジュールベース)の3種類がある。EC2起動タイプではCluster Auto Scaling(Capacity Provider)がEC2インスタンスの追加/削除を管理し、タスクスケーリングとインフラスケーリングの2層構造になる。

**ソクラテス式 深堀り:**
> Q: 「ECS Service Auto ScalingとCluster Auto Scalingの関係は？」
> A: Service Auto Scalingは「何人の従業員(タスク)が必要か」を決める。Cluster Auto Scaling(Capacity Provider)は「何台の机(EC2インスタンス)が必要か」を決める。従業員を増やしても座る机がなければ仕事ができない。Capacity Providerは、タスクが座る場所がないことを検知し、自動的にEC2インスタンスを追加する。Fargateでは机の管理が不要(タスクレベルで自動スケーリング)。
> Q: 「Target Tracking Scalingの典型的な設定は？」
> A: 最も一般的なのはECSServiceAverageCPUUtilization(CPU使用率の平均)を70%に維持する設定。CPU使用率が70%を超えるとタスクが追加され、下回ると削除される。メモリ使用率(ECSServiceAverageMemoryUtilization)や、ALBのリクエスト数(ALBRequestCountPerTarget)も使用可能。Target Trackingは「エアコンのサーモスタット」のように、目標値に自動的に調整される。

**現実世界のたとえ (非IT向け):**
> 「レストランの人員管理。Service Auto Scalingはランチタイムにウェイターを増やし、閑散時に減らす(タスク数の調整)。Cluster Auto Scalingはウェイターが増えすぎたらテーブルと椅子を追加する(EC2の追加)。Fargateの場合はフードコートのように、お客さんが来るたびに空いた席に案内するだけで、テーブルの準備は不要。」

---

### ECS vs EKS 判断基準

**定義:** ECSとEKSの選択は、チームの技術力、既存のKubernetes経験、マルチクラウド要件、運用の複雑さ、コスト、エコシステムのニーズに基づいて判断する。

**ソクラテス式 深堀り:**
> Q: 「どのような組織がECSを選び、どのような組織がEKSを選ぶか？」
> A: ECSを選ぶ場合：(1) AWSのみを使用し、マルチクラウドの予定がない (2) チームにKubernetes経験者がいない (3) シンプルなコンテナ運用で十分 (4) AWSサービスとの深い統合が優先 (5) コントロールプレーンのコストを抑えたい(ECS無料 vs EKS $72/月)。EKSを選ぶ場合：(1) 既にKubernetesの知識とツールチェーンがある (2) マルチクラウドやハイブリッドクラウドの予定がある (3) Kubernetes固有の機能(Custom Resource, Operator, Service Mesh)が必要 (4) OSSエコシステム(Helm, Argo CD, Prometheus)を活用したい (5) オンプレミスからの移行でKubernetesを使用中。
> Q: 「ECSからEKSへの移行は容易か？」
> A: Task DefinitionはKubernetesのPod specと概念的に類似するが、直接的な互換性はない。移行ツール(aws-containers/amazon-ecs-to-eks等)は存在するが、ネットワーキング、サービスディスカバリ、IAM統合、CI/CDパイプラインの全てを再設計する必要がある。最初の選択が重要。

**現実世界のたとえ (非IT向け):**
> 「ECSは日本語のワープロ専用機。日本での文書作成に最適化されていて使いやすいが、海外では使えない。EKSはMicrosoft Word。世界中で使えるが、機能が豊富すぎて使いこなすには研修が必要。小さな事務所にはワープロ、グローバル企業にはWordが適している。」

---

## アーキテクチャパターン

### パターン1: マイクロサービス on ECS Fargate + ALB

```
インターネット → ALB (HTTPS:443)
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

- ALBのパスベースルーティングで各マイクロサービスにトラフィックを分散
- Fargateにより、インフラ管理不要でサービスごとに独立スケーリング
- 各サービスに専用のTask Role(IAM)を付与し、最小権限の原則を適用
- Service DiscoveryでEast-West(サービス間)通信を実現
- awsvpcモードで各タスクにSecurity Groupを適用

### パターン2: EKS + Managed Node Groups + Cluster Autoscaler

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
    → Node数の自動調整

    Horizontal Pod Autoscaler
    → Pod数の自動調整
```

- EKS Managed Node GroupsでEC2ノードの自動管理(AMI更新、ドレイン)
- Cluster Autoscalerが需要に応じてノードを追加/削除
- HPAがCPU/メモリ使用率に応じてPod数を調整
- マルチAZに分散してHigh Availability(高可用性)を確保
- IAM Roles for Service Accounts(IRSA)でPodレベルのIAM制御

### パターン3: CI/CD Pipeline with ECR + CodePipeline + ECS Blue/Green

```
開発者 → CodeCommit/GitHub
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
    (新イメージ)
         |
         v
    CodeDeploy
    (Blue/Green)
         |
    ┌────┴────┐
    v         v
  Blue TG   Green TG
  (現行)     (新版)
    └────┬────┘
         v
        ALB
    (トラフィック切替)
```

- CodeBuildでDockerイメージをビルドしECRにプッシュ
- CodeDeployのBlue/Greenデプロイメントで安全にリリース
- テストリスナー(ポート8443等)で新バージョンを事前検証
- 問題発生時はALBのターゲットグループ切り替えで即座にロールバック
- ECRのライフサイクルポリシーで古いイメージを自動クリーンアップ

### パターン4: サイドカーパターン (Envoy Proxy, Log Router)

```
ECS Task Definition
┌─────────────────────────────────┐
│                                 │
│  ┌──────────────┐               │
│  │ App Container│ ← メインアプリ │
│  │ (Port 8080)  │               │
│  └───────┬──────┘               │
│          │                      │
│  ┌───────┴──────┐               │
│  │ Envoy Proxy  │ ← サイドカー  │
│  │ (Port 9901)  │  (トラフィック │
│  └──────────────┘   管理)       │
│                                 │
│  ┌──────────────┐               │
│  │ Fluent Bit   │ ← サイドカー  │
│  │ (Log Router) │  (ログ転送)   │
│  └──────────────┘               │
│                                 │
│  共有ボリューム                   │
└─────────────────────────────────┘
```

- メインコンテナ + 補助コンテナを同一タスクに配置
- Envoy Proxyでサービスメッシュのデータプレーンを構成
- Fluent Bit(FireLens)でログの収集・フィルタリング・転送
- 共有ボリュームでコンテナ間のデータ共有
- 各コンテナは独立したライフサイクルで更新可能

### パターン5: Service Mesh (App Mesh / EKS with Istio)

```
┌────────────────────────────────────┐
│          AWS App Mesh              │
│     (コントロールプレーン)            │
│                                    │
│  Virtual Node A    Virtual Node B  │
│  ┌────────────┐   ┌────────────┐  │
│  │ App A      │   │ App B      │  │
│  │ + Envoy    │──→│ + Envoy    │  │
│  └────────────┘   └────────────┘  │
│        |                |          │
│  Virtual Service   Virtual Router  │
│  (DNS名で解決)     (トラフィック    │
│                     ルール)        │
│                                    │
│  Virtual Gateway                   │
│  (外部トラフィック受信)              │
└────────────────────────────────────┘
```

- App MeshはAWSマネージドのサービスメッシュ(ECS/EKS/EC2対応)
- Envoyプロキシを自動注入し、サービス間通信を制御
- mTLS(相互TLS)でサービス間の暗号化と認証
- トラフィックルーティング(カナリアリリース、A/Bテスト)
- 分散トレーシング(X-Ray統合)でリクエストフローの可視化
- EKSではIstioも選択可能(より豊富な機能、OSSエコシステム)

## SAA試験のポイント

| トピック | 出題ポイント | キーワード |
|---------|-------------|-----------|
| ECS起動タイプ比較 | EC2はGPU対応・コスト最適化、FargateはサーバーレスでOps不要 | EC2 vs Fargate, GPU, Savings Plans |
| Task Definition vs Service vs Cluster | Task Definitionはコンテナの設計図、Serviceは実行管理、Clusterは論理グループ | Task Definition, Desired Count, Cluster |
| awsvpcネットワークモード | Fargateでは唯一のモード。タスクごとにENI・Security Group適用 | ENI, Security Group per task, VPC |
| ECRライフサイクルポリシー | 古いイメージの自動削除でコスト最適化。ルールの優先度に注意 | Lifecycle Policy, Image Retention |
| EKS Managed vs Self-managed | Managed Node GroupsはAMI自動更新・ドレイン自動化。Self-managedはカスタムAMI | Managed Node Group, AMI Update |
| Fargateエフェメラルストレージ | デフォルト20GB、最大200GB。永続化にはEFS | 20GB default, 200GB max, EFS |
| IAMロール分離 | Task Execution Role(ECR pull, ログ送信) vs Task Role(アプリのAWSアクセス) | Execution Role, Task Role |
| コンテナヘルスチェック | Task Definitionで定義。ELBヘルスチェックとは独立 | HEALTHCHECK, healthCheck |
| ECS Capacity Providers | EC2インスタンスの自動スケーリング。Target Capacityで使用率を設定 | Capacity Provider, Target Capacity |
| Blue/Greenデプロイ | CodeDeployと統合。ALBの2つのTarget Groupを切り替え | CodeDeploy, Target Group Switch |
| Service Discovery | Cloud Map統合。DNS名でサービス間通信。ALB不要のEast-West通信 | Cloud Map, DNS, Namespace |
| ECRクロスリージョンレプリケーション | DR対策。プライマリリージョンのイメージをセカンダリに自動複製 | Cross-region Replication, DR |
| コンテナログ収集 | awslogs(シンプル) vs FireLens(柔軟)。FireLensはFluent Bit/Fluentd | awslogs, FireLens, Fluent Bit |

## ハンズオン参照

### 推奨ハンズオン手順

1. **ECRリポジトリの構築:**
   - プライベートリポジトリの作成
   - ライフサイクルポリシーの設定(最新5イメージ保持)
   - イメージスキャンの有効化(Basic scanning)
   - Dockerイメージのビルドとプッシュ

2. **ECS Fargate Serviceの構築:**
   - Clusterの作成
   - Task Definitionの作成(Fargateタイプ)
   - Task Execution RoleとTask Roleの設定
   - Serviceの作成(Desired Count: 2)
   - ALBとの統合
   - Service Auto Scalingの設定(CPU 70%)

3. **Service Discoveryの設定:**
   - Cloud Map Namespaceの作成(Private DNS)
   - ECS ServiceとのService Discovery統合
   - サービス間のDNSベース通信テスト

4. **CI/CDパイプラインの構築:**
   - CodeBuildプロジェクト(Dockerビルド + ECRプッシュ)
   - CodeDeploy(Blue/Greenデプロイメント)
   - CodePipeline(ソース → ビルド → デプロイの自動化)

## Well-Architected チェックリスト

### Operational Excellence (運用上の優秀性)

- [ ] Task Definitionがバージョン管理され、コードとして管理されているか(IaC)
- [ ] CI/CDパイプラインが構築され、デプロイが自動化されているか
- [ ] Container Insightsが有効化され、パフォーマンスメトリクスが可視化されているか
- [ ] ログ収集戦略(awslogs or FireLens)が定義され、構造化ログが実装されているか
- [ ] Blue/Greenデプロイメントでロールバック手順が確立されているか
- [ ] ECRライフサイクルポリシーで古いイメージが自動クリーンアップされているか

### Performance Efficiency (パフォーマンス効率)

- [ ] タスクのCPU/メモリリソースが適切にサイジングされているか(過剰/不足なし)
- [ ] Service Auto Scalingが設定され、需要変動に自動対応できるか
- [ ] EC2起動タイプの場合、Capacity Providerでクラスターレベルのスケーリングが設定されているか
- [ ] awsvpcモードを使用し、タスクレベルのネットワーキングが適用されているか
- [ ] Fargateのエフェメラルストレージサイズが適切に設定されているか

### Security (セキュリティ)

- [ ] Task Execution RoleとTask Roleが分離され、最小権限の原則が適用されているか
- [ ] ECRのイメージスキャンが有効化され、脆弱性のあるイメージがデプロイされないか
- [ ] Security Groupがタスクレベルで適用され、必要なポートのみ開放されているか
- [ ] ECRリポジトリにリソースベースポリシーが設定され、不正アクセスが防止されているか
- [ ] コンテナが非rootユーザーで実行されているか
- [ ] Secrets Manager/Parameter StoreでシークレットがTask Definitionに安全に注入されているか

### Reliability (信頼性)

- [ ] タスクが複数AZに分散配置されているか
- [ ] ヘルスチェック(ELB + コンテナレベル)が適切に設定されているか
- [ ] Desired Countが2以上に設定され、単一障害点が排除されているか
- [ ] ECRクロスリージョンレプリケーションでイメージのDR対策がされているか

### Cost Optimization (コスト最適化)

- [ ] ワークロード特性に応じてEC2/Fargateを適切に選択しているか
- [ ] Fargate SpotやEC2 Spot Instancesでコスト削減を検討しているか
- [ ] ECRライフサイクルポリシーでストレージコストを最適化しているか
- [ ] タスクのリソース割り当て(CPU/メモリ)が実使用量に基づいて適正化されているか
