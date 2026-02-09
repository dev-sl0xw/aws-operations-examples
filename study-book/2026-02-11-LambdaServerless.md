# セクション13: Lambda & サーバーレス運用 (Lambda & Serverless Operations)
> Well-Architected Pillars: Operational Excellence, Performance Efficiency, Cost Optimization
> Day: 4 | 難易度: 中級〜上級

## 概要

AWS Lambdaは、サーバーのプロビジョニングや管理なしにコードを実行できるサーバーレスコンピューティングサービスである。イベント駆動型のアーキテクチャにおいて中核的な役割を果たし、API Gateway、S3、DynamoDB Streams、EventBridge等の多様なイベントソースと統合される。Lambda関数はリクエスト単位で課金され、使用しない時間にはコストが発生しないため、バッチ処理やマイクロサービスの実行基盤として極めてコスト効率が高い。

サーバーレスアーキテクチャは、Lambda単体ではなく、API Gateway（HTTPエンドポイント）、Step Functions（オーケストレーション）、DynamoDB（NoSQLデータストア）、S3（オブジェクトストレージ）、SQS/SNS（メッセージング）等のマネージドサービスを組み合わせて構築される。この組み合わせにより、インフラ管理の負荷を最小化しながら、高いスケーラビリティと可用性を実現できる。Well-Architected Frameworkの観点では、運用の優秀性（自動スケーリング、デプロイの自動化）、パフォーマンス効率（メモリ設定の最適化、Provisioned Concurrency）、コスト最適化（リクエスト単位課金、アイドルコストゼロ）の3つの柱が特に重要となる。

SAA試験では、Lambdaの実行モデル（Cold Start、同期/非同期呼び出し）、API Gatewayの種類と機能、Step Functionsのワークフロー設計、Lambda@EdgeとCloudFront Functionsの使い分け、およびVPC内Lambda関数のネットワーク設計が頻出テーマとなる。特にLambdaの制限値（タイムアウト15分、メモリ10GB、ペイロードサイズ等）は正確に記憶しておく必要がある。

## キーコンセプト

### AWS Lambda 実行モデル

**定義:** Lambda関数はコンテナベースの実行環境で動作する。初回呼び出し時にコンテナが作成され（Cold Start）、以降の呼び出しでは既存のコンテナが再利用される（Warm Start）。実行コンテキスト（メモリ上の変数、/tmpディレクトリのファイル、DB接続等）はWarm Start時に保持されるが、保証はされない。Lambdaランタイムは関数コードを実行環境にロードし、初期化フェーズ（INIT）→呼び出しフェーズ（INVOKE）→シャットダウンフェーズ（SHUTDOWN）のライフサイクルで管理される。

**ソクラテス式 深堀り:**
> Q: 「Cold StartとWarm Startの違いは何か？パフォーマンスにどう影響するか？」
> A: Cold Startは新しいコンテナを一から作る過程。レストランの開店準備に例えると、厨房を掃除し、食材を並べ、オーブンを予熱するところから始める（数百ms〜数秒）。Warm Startは既に営業中のレストランに新しい注文が入るようなもの（数ms）。Cold Startの所要時間はランタイム（Java/C#は遅い、Python/Node.jsは速い）、メモリサイズ（大きいほど高速CPU割り当て）、パッケージサイズ（依存ライブラリの量）、VPC接続の有無に依存する。VPC内のLambdaは以前はENI作成で+10秒程度のCold Startがあったが、現在はHyperplane ENIの導入により大幅に改善されている。
> Q: 「実行コンテキストの再利用とは具体的に何を意味するか？」
> A: ハンドラ関数の外側で初期化した変数、DB接続、SDKクライアントは、次の呼び出し時にメモリ上に残っている可能性がある。/tmpディレクトリ（最大10GB）のファイルも保持される。これを利用してDB接続プールやSDKクライアントをハンドラ外で初期化する「接続の再利用」パターンが推奨される。ただし、実行コンテキストの再利用は保証されないため、常に初期化が必要な前提でコードを書く必要がある。グローバル変数に状態を保持すると、異なるリクエスト間で状態が漏洩するリスクがある。

**現実世界のたとえ (非IT向け):**
> 「タクシー乗り場の仕組み。Cold Start=電話で呼んだタクシーが遠くの車庫から来る（待ち時間が長い）。Warm Start=目の前の乗り場に既に待機しているタクシーにすぐ乗れる（待ち時間ほぼゼロ）。忙しい時間帯（高頻度のリクエスト）にはタクシーが常に待機しているが、深夜（低頻度）には車庫から呼ぶ必要がある。」

---

### Lambda 設定パラメータ

**定義:** Lambda関数の動作を制御する主要な設定値。メモリ（128MB〜10,240MB、1MB刻み）はCPUパワーに比例して割り当てられ、タイムアウト（最大15分=900秒）は関数の最大実行時間を制限する。同時実行数（Concurrency）はReserved Concurrency（他の関数から確保）とProvisioned Concurrency（事前にコンテナを暖機）の2種類がある。環境変数、Layers、エフェメラルストレージ(/tmp)も重要な設定要素。

**ソクラテス式 深堀り:**
> Q: 「メモリ設定がCPUパワーに影響するとはどういうことか？」
> A: Lambdaではメモリとは別にCPU設定項目がない。メモリを増やすとCPUパワーも比例して増加する。1,769MBで1 vCPU相当、10,240MBで6 vCPU相当が割り当てられる。つまりメモリ設定は「コンピューティングパワー全体のダイヤル」である。CPU負荷が高い処理（画像処理、データ変換等）ではメモリを増やすことで実行時間が短縮され、結果的にコストが下がる場合もある。AWS Lambda Power Tuningツールで最適なメモリ設定を自動的に見つけることができる。
> Q: 「Reserved ConcurrencyとProvisioned Concurrencyの違いと使い分けは？」
> A: Reserved Concurrencyは「この関数用に同時実行枠を予約する」設定。アカウント全体の同時実行上限（デフォルト1,000）から指定した数を確保し、他の関数が使えないようにする。ただしCold Startは発生する。コストは無料。Provisioned Concurrencyは「事前にコンテナを暖機しておく」設定。Cold Startを完全に排除する。ただし暖機しているコンテナ分のコストが常に発生する。使い分け：(1) 一定のスループットを保証したいだけならReserved (2) レイテンシ要件が厳しい（P99 < 100ms等）ならProvisioned (3) 予測可能なトラフィックパターンにはApplication Auto Scalingと組み合わせてProvisioned Concurrencyを動的に調整。

**現実世界のたとえ (非IT向け):**
> 「Reserved Concurrency=レストランの予約席。他の客に取られないが、着席してからの料理提供時間（Cold Start）は通常通り。Provisioned Concurrency=VIP専用のプリペアドテーブル。料理が既に準備されており、着席と同時にすぐ提供される。ただしVIPテーブルの維持費用が常にかかる。」

---

### Lambda トリガーとイベントソース

**定義:** Lambda関数を起動するイベントソースは、同期呼び出し（Synchronous）、非同期呼び出し（Asynchronous）、ストリームベース呼び出し（Stream-based/Polling）の3種類に分類される。呼び出し方式によってエラーハンドリング、リトライ動作、スケーリング特性が異なる。

**ソクラテス式 深堀り:**
> Q: 「同期呼び出しと非同期呼び出しの違いは何か？」
> A: **同期呼び出し:** 呼び出し元がLambdaの実行完了を待つ。API Gateway、ALB、CloudFront（Lambda@Edge）、Cognito等。エラー時のリトライは呼び出し元の責任。レスポンスが直接返される。電話のようなもの（相手の応答を待つ）。**非同期呼び出し:** 呼び出し元はイベントをキューに入れて即座にレスポンス（202 Accepted）を受け取る。S3イベント、SNS、EventBridge、CloudWatch Logs、SES、CodeCommit等。Lambda側でリトライ（デフォルト2回）が行われ、失敗時はDLQ（Dead Letter Queue）またはDestinationsに送信される。手紙のようなもの（投函したら結果を待たない）。**ストリームベース:** Lambda自体がストリームをポーリングしてレコードを取得する。Kinesis Data Streams、DynamoDB Streams、SQS。バッチ処理で効率的にレコードを処理。ストリーム内の位置（イテレータ）を管理。回転寿司のベルトコンベア（データが流れてくるのを取る）。
> Q: 「SQSはストリームベースだが、SNSは非同期呼び出し。なぜ違うのか？」
> A: SQSはLambdaのEvent Source Mapping（ESM）がキューをポーリングしてメッセージをバッチで取得する。つまりLambda側がpullする。SNSはトピックからLambda関数を直接呼び出す（pushする）。この違いはスケーリングとエラーハンドリングに影響する。SQSでは処理失敗時にメッセージがキューに戻り（Visibility Timeout後）、再処理される。SNSでは非同期呼び出しのリトライポリシーに従う。SQSのバッチウィンドウやバッチサイズの調整で処理効率を最適化できる。

**現実世界のたとえ (非IT向け):**
> 「同期=電話注文（相手が応答するまで待つ）。非同期=注文用紙をFAXで送信（送ったら結果は後で確認）。ストリームベース=回転寿司のベルトコンベア（流れてくる皿を自分のタイミングで取る）。それぞれ、応答速度、エラー対応、処理効率の特性が異なる。」

---

### API Gateway

**定義:** API Gatewayは、REST API、HTTP API、WebSocket APIを作成・管理するフルマネージドサービス。Lambda関数のHTTPエンドポイントとして機能し、認証・認可、レート制限（スロットリング）、キャッシング、カスタムドメイン、ステージ管理等の機能を提供する。REST APIとHTTP APIの2種類があり、用途に応じて選択する。

**ソクラテス式 深堀り:**
> Q: 「REST APIとHTTP APIの違いと使い分けは？」
> A: **REST API:** フル機能版。APIキー、使用量プラン、リソースポリシー、WAF統合、キャッシング、リクエスト/レスポンス変換（マッピングテンプレート）、カナリアデプロイをサポート。料金が高い（$3.50/100万リクエスト）。**HTTP API:** 軽量版。Lambda統合とHTTPプロキシに特化。JWT認可、CORS設定、自動デプロイをサポート。REST APIの約70%安い（$1.00/100万リクエスト）。レイテンシも低い。**使い分け:** APIキー管理、WAF統合、キャッシング、リクエスト変換が必要→REST API。シンプルなLambdaプロキシ、コスト重視、低レイテンシ重視→HTTP API。新規プロジェクトではHTTP APIが推奨されるが、エンタープライズ機能が必要ならREST API。
> Q: 「Lambda Proxy統合とNon-Proxy統合の違いは？」
> A: **Proxy統合:** API Gatewayがリクエスト全体（ヘッダー、クエリパラメータ、ボディ、コンテキスト）をそのままLambdaに渡す。レスポンスもLambdaが完全に制御する（ステータスコード、ヘッダー、ボディ）。設定が簡単で最も一般的。**Non-Proxy統合:** API Gatewayでリクエスト/レスポンスの変換（マッピングテンプレート、VTL）を行う。Lambdaは変換後のデータを受け取る。レガシーバックエンドとの統合や、複数のバックエンドへのルーティングに使用。設定が複雑だがAPI層での柔軟な変換が可能。SAA試験では主にProxy統合が出題される。

**現実世界のたとえ (非IT向け):**
> 「API Gateway=ホテルのフロントデスク。REST API=フルサービスのフロント（コンシェルジュ、荷物預かり、レストラン予約、ルームサービス注文など全て対応）。HTTP API=セルフサービスのチェックインキオスク（基本的なチェックイン/チェックアウトに特化、速くて安い）。Proxy統合=お客の要望をそのまま担当部署に伝える。Non-Proxy統合=フロントが要望を翻訳・整理してから担当部署に伝える。」

---

### Step Functions

**定義:** Step Functionsは、複数のAWSサービスをワークフロー（ステートマシン）として編成するサーバーレスオーケストレーションサービス。Amazon States Language（ASL）というJSONベースの言語でワークフローを定義する。Standard（最大1年実行、正確に1回実行）とExpress（最大5分、最少1回実行）の2種類のワークフロータイプがある。

**ソクラテス式 深堀り:**
> Q: 「Step FunctionsのStandardとExpressの違いと使い分けは？」
> A: **Standard Workflow:** 最大実行期間1年。実行状態が完全に記録され、実行履歴をStep Functionsコンソールで確認可能。正確に1回(exactly-once)の実行を保証。料金は状態遷移ごとに課金（$0.025/1,000状態遷移）。長時間の承認フロー、エラーリカバリが必要なバッチ処理、人間の介入を含むワークフローに適する。**Express Workflow:** 最大実行期間5分。実行状態はCloudWatch Logsに記録。最少1回(at-least-once)の実行。料金はリクエスト数と実行時間に基づく（高スループット向けに安価）。IoTデータ処理、ストリーミングデータ変換、高頻度の短時間処理に適する。Express Workflowにはさらに同期（Synchronous）と非同期（Asynchronous）の実行モードがある。
> Q: 「Step Functionsのエラーハンドリング（Retry/Catch）はどのように機能するか？」
> A: **Retry:** 特定のエラータイプに対してリトライ回数、バックオフレート、最大間隔を定義。例えば「Lambda.ServiceException」に対して3回リトライ、バックオフレート2.0（1秒→2秒→4秒の指数バックオフ）。**Catch:** リトライ後も失敗した場合のフォールバック先を定義。エラーハンドリング用のステート（通知送信、クリーンアップ処理等）に遷移。**エラータイプ:** States.ALL（全エラー）、States.Timeout（タイムアウト）、States.TaskFailed（タスク失敗）、カスタムエラー等。Retry→Catchの順で評価される。これによりLambda関数内でのエラーハンドリングをStep Functionsに委任でき、関数コードがシンプルになる。

**現実世界のたとえ (非IT向け):**
> 「Step Functions=工場の組立ライン管理システム。Standard=家を建てるプロジェクト（数ヶ月、各工程の記録が重要、失敗したらやり直しが必要）。Express=お弁当の製造ライン（数分、高速大量生産、1つ失敗しても次を作ればよい）。Retry=部品が不良品だった場合、同じ業者に再発注（最大3回）。Catch=再発注しても入手できない場合、代替業者に発注する。」

---

### Step Functions ステートタイプ

**定義:** Step Functionsのステートマシンは、Task（処理実行）、Choice（条件分岐）、Parallel（並列実行）、Map（繰り返し処理）、Wait（待機）、Pass（パススルー）、Succeed/Fail（成功/失敗の終端）の各ステートタイプで構成される。

**ソクラテス式 深堀り:**
> Q: 「MapステートとParallelステートの違いは何か？」
> A: **Parallelステート:** 異なる処理を同時に実行する。例えば注文処理で「在庫確認」「決済処理」「配送手配」を並列に実行する。各ブランチは異なるステートマシンを持つ。全ブランチが完了するまで次に進まない。**Mapステート:** 同じ処理を配列の各要素に対して繰り返し実行する。例えば100件の注文に対して同じ検証処理を並列実行する。Inline Map（ステートマシン内でインライン実行）とDistributed Map（大規模データセット向け、S3から直接読み取り、最大10,000の並列実行）がある。Distributed Mapは数百万のS3オブジェクトに対するETL処理に適する。
> Q: 「Choiceステートでの条件分岐のパターンは？」
> A: 文字列比較（StringEquals、StringGreaterThan等）、数値比較（NumericEquals、NumericGreaterThan等）、ブール比較（BooleanEquals）、タイムスタンプ比較（TimestampEquals等）、存在チェック（IsPresent）を組み合わせる。And、Or、Not による複合条件も可能。Defaultブランチは必須（どの条件にもマッチしない場合のフォールバック）。

**現実世界のたとえ (非IT向け):**
> 「Parallel=レストランで前菜、メイン、デザートを同時に調理する（異なる料理を並行作業）。Map=100人分の同じカレーを10人のシェフが分担して作る（同じ作業を並列化）。Choice=アレルギー情報に応じてメニューを変更する（条件分岐）。Wait=オーブンで30分焼く（時間待ち）。」

---

### Lambda@Edge & CloudFront Functions

**定義:** Lambda@EdgeはCloudFrontのエッジロケーションでLambda関数を実行する機能。CloudFront Functionsは軽量で高速なエッジコンピューティング機能。両者はViewer Request、Viewer Response、Origin Request、Origin Responseの4つのイベントタイプで呼び出される。

**ソクラテス式 深堀り:**
> Q: 「Lambda@EdgeとCloudFront Functionsの違いと使い分けは？」
> A: **CloudFront Functions:** 軽量・高速（サブミリ秒）。JavaScript限定。最大実行時間1ms。最大メモリ2MB。最大パッケージサイズ10KB。Viewer Request/Responseのみ対応。1/6のコスト。用途：HTTPヘッダー操作、URLリライト/リダイレクト、キャッシュキーの正規化、簡単なA/Bテスト。**Lambda@Edge:** フル機能のLambda。Node.js/Python対応。Viewer Request/Response: 最大5秒、128MB。Origin Request/Response: 最大30秒、10GB。ネットワークアクセス、外部API呼び出し、他のAWSサービスとの連携が可能。用途：認証/認可（JWT検証）、動的コンテンツ生成、A/Bテスト（外部設定参照）、画像の動的リサイズ、オリジン選択。
> Q: 「4つのイベントタイプはどのように使い分けるか？」
> A: **Viewer Request:** クライアントからCloudFrontに到達した時点。認証チェック、URLリライト、ヘッダー追加。キャッシュの前に実行されるので全リクエストに対して実行される（コスト注意）。**Origin Request:** CloudFrontがオリジンにリクエストを転送する時点。キャッシュミス時のみ実行。オリジン選択、リクエスト変換。**Origin Response:** オリジンからCloudFrontにレスポンスが返る時点。レスポンスヘッダーの追加・変更、エラーページのカスタマイズ。**Viewer Response:** CloudFrontからクライアントにレスポンスを返す時点。セキュリティヘッダーの追加（HSTS等）、レスポンスのカスタマイズ。

**現実世界のたとえ (非IT向け):**
> 「CloudFront Functions=空港のセキュリティゲート（パスポートの確認、搭乗券のスキャンなど、高速で単純な処理）。Lambda@Edge=空港のカスタム入国審査官（ビザの詳細確認、追加書類の要求、外部データベースの参照など、複雑で時間のかかる処理）。Viewer Request=空港到着時の最初のチェック。Origin Request=搭乗ゲートでの最終確認。」

---

### Dead Letter Queue (DLQ) & Lambda Destinations

**定義:** 非同期呼び出しのLambda関数が失敗した場合のエラーハンドリング機構。DLQ（Dead Letter Queue）はSQSキューまたはSNSトピックに失敗したイベントを送信する従来の仕組み。Lambda Destinationsは成功時・失敗時の両方でイベントを別のサービス（Lambda、SQS、SNS、EventBridge）に送信できる新しい仕組み。

**ソクラテス式 深堀り:**
> Q: 「DLQとLambda Destinationsの違いと推奨はどちらか？」
> A: **DLQ（レガシー）:** 失敗したイベントのみをSQSまたはSNSに送信。元のイベントペイロードのみが含まれる。Lambda関数のリソースとして設定。**Lambda Destinations（推奨）:** 成功時と失敗時の両方でイベントを送信可能。送信先はLambda、SQS、SNS、EventBridgeの4つ。イベントには元のペイロードに加え、リクエストコンテキスト、レスポンス/エラー情報が含まれる。AWSはDestinationsの使用を推奨している。**重要な違い:** DLQは非同期呼び出しのリトライ後の最終的な失敗にのみ機能する。DestinationsはEvent Source Mapping（SQS、Kinesis等）のバッチ処理失敗にも対応する（OnFailure Destination）。
> Q: 「非同期呼び出しのリトライ動作はどうなっているか？」
> A: Lambda関数が非同期で呼び出されると、イベントは内部キューに格納される。初回実行が失敗すると、デフォルトで最大2回リトライされる（MaximumRetryAttempts: 0〜2で設定可能）。リトライ間隔は1分→2分（指数バックオフ）。イベントの最大保持期間はMaximumEventAgeで設定（60秒〜6時間、デフォルト6時間）。保持期間内にリトライが全て失敗すると、DLQまたはDestinationsのOnFailureに送信される。どちらも設定されていない場合、イベントは破棄される。

**現実世界のたとえ (非IT向け):**
> 「DLQ=郵便局の不在通知ボックス。配達失敗した郵便物を一時保管し、後で再配達する。Lambda Destinations=高度な配送追跡システム。配達成功時は受取確認を送信者に通知、配達失敗時は不在通知+失敗理由+再配達オプションを含む詳細レポートを送信者と管理者に送る。」

---

### Lambda VPC 設定

**定義:** Lambda関数をVPC内のリソース（RDS、ElastiCache、内部ALB等）にアクセスさせるための設定。Lambda関数にVPCのサブネットとセキュリティグループを指定すると、ENI（Elastic Network Interface）がVPC内に作成され、プライベートリソースへのアクセスが可能になる。ただし、VPC内のLambdaはデフォルトではインターネットアクセスができない。

**ソクラテス式 深堀り:**
> Q: 「VPC内のLambda関数がインターネットにアクセスするにはどうすればよいか？」
> A: VPC内のLambdaはパブリックサブネットに配置してもインターネットアクセスできない（パブリックIPが付与されないため）。インターネットアクセスが必要な場合、プライベートサブネットにLambdaを配置し、パブリックサブネットにNAT Gatewayを設置してルーティングする。AWSサービス（S3、DynamoDB、SQS等）へのアクセスにはVPCエンドポイント（Gateway/Interface）を使用するとNAT Gatewayのコストを節約できる。**重要:** Lambdaが外部APIやAWSサービスにアクセスする必要がなく、VPC内リソースにのみアクセスする場合は、VPCエンドポイントで十分。
> Q: 「VPC Lambda のCold Startへの影響は？」
> A: 以前はVPC内LambdaのCold Startにはに10秒以上かかることがあったが、2019年にHyperplane ENIが導入されて大幅に改善された。現在はENIの作成がアカウントレベルで共有され、Cold Start時のオーバーヘッドは大幅に削減されている。それでもVPC外のLambdaよりはわずかに遅い。複数のAZ（Availability Zone）のサブネットを指定することで高可用性を確保する。セキュリティグループは最小権限の原則に従い、必要なポートのみを開放する。

**現実世界のたとえ (非IT向け):**
> 「VPC内Lambda=社員専用の社内ネットワークに接続された端末。社内サーバー（RDS）にはアクセスできるが、外のインターネットには直接出られない。NAT Gateway=社内ネットワークから外部インターネットに出るための代理ゲート（プロキシサーバー）。VPCエンドポイント=特定のAWSサービスに直通の専用通路（プロキシを通さず直接接続）。」

---

## アーキテクチャパターン

### パターン1: API Gateway + Lambda + DynamoDB（サーバーレスREST API）

```
Client (Browser/Mobile)
         |
         v
    API Gateway
    (REST API / HTTP API)
    [認証: Cognito/JWT]
    [スロットリング: 10,000 RPS]
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
    Lambda (後処理)
    ┌────┴────┐
    v         v
  SNS    CloudWatch
  (通知)   (メトリクス)
```

- 完全サーバーレスのREST API構成
- API Gatewayで認証・認可、レート制限を一元管理
- DynamoDB On-Demandで自動スケーリング
- DynamoDB Streamsで変更をリアルタイムに処理（CQRS パターン）
- Lambda関数はマイクロサービスとして機能ごとに分離

### パターン2: S3イベント → Lambda（ファイル処理パイプライン）

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
  [ファイル形式チェック]
  [ウイルススキャン]
    |
  ┌─┴─┐
  v    v
 OK   NG
  |    |
  v    v
S3     SQS DLQ
(processed/)  (不正ファイル通知)
  |
  v
Lambda (Processor)
[画像リサイズ/PDF変換/メタデータ抽出]
  |
  v
S3 (output/) + DynamoDB (メタデータ)
  |
  v
SNS (処理完了通知)
```

- S3のPutObjectイベントでLambdaを自動起動
- バリデーション→処理→保存のパイプライン
- 失敗ファイルはDLQで管理
- /tmpディレクトリ（最大10GB）で一時ファイル処理
- 大きなファイルはS3 presigned URLでダウンロード/アップロード

### パターン3: Step Functions オーケストレーション（複雑なワークフロー）

```
API Gateway
    |
    v
Step Functions (Standard)
    |
    v
┌─ Task: 入力検証 (Lambda)
│     |
│  Choice: 検証結果
│  ├─ OK → Task: 決済処理 (Lambda)
│  │         |
│  │      Choice: 決済結果
│  │      ├─ 成功 → Parallel:
│  │      │         ├─ Task: 在庫更新 (Lambda → DynamoDB)
│  │      │         ├─ Task: 配送手配 (Lambda → SQS)
│  │      │         └─ Task: 通知送信 (Lambda → SES)
│  │      │              |
│  │      │           Succeed
│  │      └─ 失敗 → Task: エラー通知 (SNS)
│  │                   |
│  │                 Fail
│  └─ NG → Task: バリデーションエラー通知
│              |
│           Fail
│
└─ Retry: Lambda.ServiceException (3回, Backoff 2.0)
   Catch: States.ALL → Task: エラーハンドリング
```

- 複数のLambda関数を順序付きで実行
- Choiceステートで条件分岐
- Parallelステートで並列処理
- Retry/Catchでエラーハンドリングをワークフローレベルで管理
- 実行履歴がStep Functionsコンソールで可視化

### パターン4: ファンアウトパターン（SNS → 複数Lambda）

```
    EventBridge
    (注文完了イベント)
         |
         v
    SNS Topic
    (order-events)
    ┌────┬────┬────┬────┐
    v    v    v    v    v
  SQS  SQS  Lambda Lambda Kinesis
  (在庫) (配送) (メール) (監査) (分析)
    |    |    |      |      |
    v    v    v      v      v
 Lambda Lambda SES  DynamoDB Firehose
 (処理)  (処理)       (ログ)  → S3
```

- 1つのイベントから複数のコンシューマーに同時配信
- SQSバッファリングで処理速度の差を吸収
- Lambda直接呼び出し（軽量処理）とSQS経由（重い処理）を使い分け
- 各コンシューマーは独立してスケール・デプロイ可能
- SNSメッセージフィルタリングで関連イベントのみ配信

### パターン5: イベント駆動アーキテクチャ（EventBridge → Lambda）

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
  (ファイル  (通知    (ビジネス
   処理)    送信)    ワークフロー)
     |        |        |
     v        v        v
  DynamoDB  Slack   複数Lambda
              +      + DynamoDB
            PagerDuty + S3
```

- EventBridgeでイベントを一元管理
- ルールベースのルーティングで適切なターゲットに分配
- プロデューサーとコンシューマーの完全な疎結合
- Archive & Replayでデバッグとリカバリ
- Schema Registryでイベント構造を管理

## SAA試験のポイント

| トピック | 出題ポイント | キーワード |
|---------|------------|-----------|
| Lambda制限値 | タイムアウト最大15分（900秒）、メモリ128MB〜10GB、同期ペイロード6MB、非同期ペイロード256KB、デプロイパッケージ50MB（zip）/250MB（解凍後）、/tmp最大10GB | 15分、10GB、6MB、256KB |
| Cold Start最適化 | Provisioned Concurrency、メモリ増加、パッケージサイズ削減、SnapStart（Java）、Layers活用、VPC外配置 | Provisioned Concurrency、SnapStart |
| API Gateway スロットリング | デフォルト10,000 RPS（リクエスト/秒）、バースト5,000。アカウントレベルの制限。使用量プランとAPIキーでクライアント別制限。429 Too Many Requests | 10,000 RPS、429、使用量プラン |
| Step Functions Standard vs Express | Standard: 最大1年、exactly-once、状態遷移課金。Express: 最大5分、at-least-once、実行時間課金。Express同期/非同期 | 1年 vs 5分、exactly-once vs at-least-once |
| Lambda@Edge制限 | Viewer: 最大5秒、128MB。Origin: 最大30秒、10GB。Node.js/Python対応。us-east-1でデプロイ必須 | 5秒/30秒、us-east-1 |
| Provisioned vs Reserved Concurrency | Provisioned: Cold Start排除、有料、Auto Scaling連携。Reserved: 同時実行枠確保、無料、Cold Startあり | Provisioned=暖機、Reserved=予約 |
| Lambda実行ロール vs リソースベースポリシー | 実行ロール: Lambda→他サービスへのアクセス権限（IAM Role）。リソースベースポリシー: 他サービス→Lambda呼び出し権限 | 実行ロール=出て行く、リソースポリシー=入ってくる |
| VPC Lambda Cold Start緩和 | Hyperplane ENI（2019年導入）、複数AZサブネット指定、NAT Gateway/VPCエンドポイント、Provisioned Concurrency | Hyperplane ENI、NAT Gateway |
| Lambda Layers | 最大5 Layers/関数、合計250MB（解凍後）。共通ライブラリの共有、ランタイムカスタマイズ。/opt/ディレクトリにマウント | 5 Layers、250MB、/opt/ |
| X-Ray トレーシング統合 | Lambda Active Tracing有効化、X-Ray SDKでサブセグメント作成、環境変数AWS_XRAY_TRACING_NAME、サンプリングルール適用 | Active Tracing、X-Ray SDK |
| API Gateway キャッシング | REST APIのみ（HTTP APIは非対応）。TTL: 0〜3600秒（デフォルト300秒）。ステージ単位で有効化。キャッシュ容量0.5〜237GB | REST APIのみ、TTL 300秒 |
| Lambda同時実行の計算 | 同時実行数 = 1秒あたりのリクエスト数 x 平均実行時間(秒)。例: 100 RPS x 0.5秒 = 50同時実行 | RPS x 実行時間 |

## ハンズオン参照

**関連CDKプロジェクト:** `cdk-projects/03-monitoring-observability/`（EventBridge + X-Ray統合）

### 推奨ハンズオン手順

1. **Lambda関数の基本作成:**
   - Node.js/PythonのHello World関数の作成
   - メモリ・タイムアウトの設定と動作確認
   - 環境変数の設定と参照
   - CloudWatch Logsでの実行ログ確認

2. **API Gateway + Lambda統合:**
   - HTTP APIの作成とLambda Proxy統合の設定
   - CORS設定とカスタムドメインの設定
   - ステージ（dev/prod）の作成とデプロイ
   - スロットリング設定のテスト

3. **S3イベントトリガー:**
   - S3バケットの作成とイベント通知の設定
   - Lambda関数でアップロードファイルを処理
   - DLQの設定とエラー処理の確認
   - Lambda Destinationsの設定

4. **Step Functionsワークフロー:**
   - 簡単な順次実行ワークフローの作成
   - Choice/Parallelステートの追加
   - Retry/Catchの設定とエラーハンドリングテスト
   - Map stateでのバッチ処理

5. **Lambda VPC設定:**
   - VPC内Lambda関数の作成
   - NAT GatewayとVPCエンドポイントの設定
   - RDS/ElastiCacheへのアクセス確認
   - セキュリティグループの設定

## Well-Architected チェックリスト

### Operational Excellence (運用上の優秀性)
- [ ] Lambda関数のログがCloudWatch Logsに構造化形式（JSON）で出力されているか
- [ ] Lambda関数にX-Ray Active Tracingが有効化されているか
- [ ] Lambda Destinationsまたは DLQが非同期呼び出しの関数に設定されているか
- [ ] Step Functionsのワークフローに適切なRetry/Catch設定があるか
- [ ] API GatewayのアクセスログとCloudWatch メトリクスが有効化されているか
- [ ] Lambda関数のデプロイがCI/CDパイプライン（CodePipeline、GitHub Actions等）で自動化されているか
- [ ] Lambda関数のエイリアスとバージョニングを使用してブルー/グリーンデプロイが可能か

### Performance Efficiency (パフォーマンス効率)
- [ ] Lambda関数のメモリ設定がAWS Lambda Power Tuningで最適化されているか
- [ ] Cold Startが許容範囲内か。必要に応じてProvisioned Concurrencyが設定されているか
- [ ] Lambda Layersで共通ライブラリが共有され、デプロイパッケージが最小化されているか
- [ ] API Gatewayのキャッシングが適切に設定されているか（REST APIの場合）
- [ ] DynamDBのRead/Write Capacityがワークロードに適切か（On-Demand vs Provisioned）
- [ ] Lambda関数のハンドラ外でDB接続やSDKクライアントを初期化し、接続の再利用を行っているか

### Cost Optimization (コスト最適化)
- [ ] Lambda関数のタイムアウトが適切に設定されているか（無限実行の防止）
- [ ] API GatewayはREST APIとHTTP APIのどちらが適切かを評価したか（HTTP APIは70%安い）
- [ ] Step FunctionsはStandardとExpressのどちらが適切かを評価したか
- [ ] VPC内LambdaのNAT Gatewayコストを最小化するためVPCエンドポイントを使用しているか
- [ ] Lambda関数の実行時間とメモリを定期的に見直し、過剰なリソース割り当てを排除しているか
- [ ] Provisioned Concurrencyをスケジュールベースで調整し、不要な時間帯のコストを削減しているか

### Reliability (信頼性)
- [ ] Lambda関数が複数AZのサブネットに配置されているか（VPC内の場合）
- [ ] 非同期呼び出しの関数にDLQまたはDestinationsが設定されているか
- [ ] Step Functionsのワークフローに適切なエラーハンドリング（Retry/Catch）があるか
- [ ] Lambda関数のReserved Concurrencyが設定され、他の関数の影響を受けないか
- [ ] API Gatewayのスロットリング設定でバックエンドの過負荷を防止しているか
- [ ] SQSとLambdaの統合でbatchSize、maxBatchingWindow、maxConcurrencyが適切に設定されているか

### Security (セキュリティ)
- [ ] Lambda実行ロールが最小権限の原則に従っているか（ワイルドカードリソース不使用）
- [ ] API Gatewayに適切な認証・認可（Cognito、Lambda Authorizer、IAM）が設定されているか
- [ ] Lambda関数の環境変数でシークレット情報はSSM Parameter Store（SecureString）またはSecrets Managerを使用しているか
- [ ] VPC内Lambda関数のセキュリティグループが最小限のアウトバウンドルールのみ許可しているか
- [ ] Lambda関数のリソースベースポリシーが不要な呼び出し元を許可していないか
- [ ] API Gatewayにカスタムドメインを設定し、TLS 1.2以上を強制しているか
