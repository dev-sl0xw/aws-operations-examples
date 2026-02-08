# セクション10: VPCネットワーク設計 (VPC Network Design)
> Well-Architected Pillars: Security, Reliability
> Day: 3 | 難易度: 中級

## 概要

VPC (Virtual Private Cloud) は、AWS上に構築する論理的に分離されたプライベートネットワークである。全てのAWSリソースはVPC内に配置され、VPCの設計はセキュリティ、可用性、パフォーマンスの土台となる。適切なVPC設計なくして、安全で信頼性の高いアーキテクチャは成立しない。

VPC設計の核心は、CIDRブロック設計、サブネット分割、ルーティング、そしてネットワークアクセス制御である。CIDRブロックは一度作成すると変更できないため、将来のスケーリングとVPC間接続を見据えた計画が不可欠である。サブネットはPublic、Private、Isolatedの3層に分け、それぞれの用途に応じたルーティングとセキュリティを設定する。Multi-AZ配置は信頼性の基本であり、全ての本番ワークロードで必須である。

マルチVPC環境では、VPC Peering (1対1接続)、Transit Gateway (ハブ&スポーク)、VPC Endpoints (AWSサービスへのプライベートアクセス) を適切に組み合わせる。特にVPC Endpointsは、セキュリティ強化とNATコスト削減の両方に寄与するため、SAA試験でも頻出するテーマである。

## キーコンセプト

### CIDR設計 (CIDR Planning)

**定義:** CIDR (Classless Inter-Domain Routing) はIPアドレス範囲を表記する方法であり、VPCに割り当てるIPアドレス空間の設計はネットワークアーキテクチャの最初の意思決定となる。

**ソクラテス式 深堀り:**
> Q: 「CIDR記法とは何か? /16や/24はどういう意味か?」
> A: CIDR記法はIPアドレスの範囲を「ネットワークアドレス/プレフィックス長」で表す。プレフィックス長はIPアドレスの先頭何ビットがネットワーク部分 (固定) かを示す。IPv4は32ビットなので、/16は先頭16ビットが固定、残り16ビットがホスト部分 = 2^16 = 65,536アドレス。/24は先頭24ビットが固定、残り8ビット = 2^8 = 256アドレス。プレフィックスの数字が大きいほど範囲が狭い。
> Q: 「CIDR設計を間違えるとどうなるか?」
> A: (1) VPCのCIDRは作成後に変更不可 (拡張はSecondary CIDRで可能だが、縮小は不可)。(2) CIDRが重複するVPC同士はPeering接続できない。(3) CIDRが小さすぎると将来のサブネット追加やIPアドレス不足に陥る。(4) オンプレミスネットワークとCIDRが重複するとVPN/Direct Connect接続が不可能になる。

**現実世界のたとえ (非IT向け):**
> 「通りの住所システム。10.0.0.0/16は『10.0番地のブロック全体 (65,536戸)』。/16は最初の16ビットが固定 (通り名) で、残り16ビットが自由 (家の番号)。/24なら『10.0.1番地の区画 (256戸)』。数字が大きいほど範囲が狭い」

**RFC 1918 プライベートIPアドレス範囲:**

| 範囲 | CIDRブロック | アドレス数 | 一般的な用途 |
|------|-------------|-----------|------------|
| Class A | 10.0.0.0/8 | 16,777,216 | 大規模企業ネットワーク |
| Class B | 172.16.0.0/12 | 1,048,576 | 中規模ネットワーク |
| Class C | 192.168.0.0/16 | 65,536 | 小規模/家庭用ネットワーク |

**AWS VPCのCIDR制約:**

- 最小: /28 (16 IPアドレス)
- 最大: /16 (65,536 IPアドレス)
- AWS予約IP (各サブネットにつき5つ):
  - `.0` - ネットワークアドレス
  - `.1` - VPCルーター
  - `.2` - DNS サーバー
  - `.3` - 将来の利用のためにAWSが予約
  - `.255` (最後のIP) - ブロードキャストアドレス (VPCではブロードキャスト不可だが予約)
- **例:** /24サブネット (256 IP) では、使用可能なIPは 256 - 5 = 251個
- Secondary CIDRブロックで拡張可能 (最大5つまでデフォルト、制限引き上げ可)

---

### サブネット設計パターン (Subnet Design Patterns)

**定義:** サブネットはVPC内のIPアドレス範囲の区画であり、用途に応じてPublic、Private、Isolatedの3層に分類する。各サブネットは1つのAvailability Zoneに属する。

**ソクラテス式 深堀り:**
> Q: 「なぜサブネットを層 (ティア) に分けるのか?」
> A: セキュリティの多層防御の原則に基づく。全てのリソースを同じサブネットに置くと、外部からアクセス可能なWebサーバーが侵害された場合、同じネットワーク内のデータベースに直接アクセスできてしまう。サブネットを層に分け、各層間の通信をSecurity GroupとNACLで制御することで、一つの層が侵害されても他の層への横移動 (Lateral Movement) を防げる。
> Q: 「Multi-AZ配置はなぜ必要なのか?」
> A: AWSのAZ (Availability Zone) は物理的に分離されたデータセンター群である。1つのAZで障害が発生しても、別のAZのリソースは影響を受けない。本番環境では最低2つのAZにサブネットを配置し、リソースを分散させることで、単一AZ障害時の可用性を確保する。

**3層サブネット設計:**

```
VPC: 10.0.0.0/16
│
├── Public Subnet (AZ-a): 10.0.1.0/24
│     ├── Route: 0.0.0.0/0 → Internet Gateway
│     ├── リソース: ALB, NAT Gateway, Bastion Host
│     └── 特徴: パブリックIP自動割り当て有効
│
├── Public Subnet (AZ-c): 10.0.2.0/24
│     └── (同上 - Multi-AZ冗長)
│
├── Private Subnet (AZ-a): 10.0.11.0/24
│     ├── Route: 0.0.0.0/0 → NAT Gateway (AZ-a)
│     ├── リソース: EC2, ECS, Lambda
│     └── 特徴: インターネットへのアウトバウンドのみ可能
│
├── Private Subnet (AZ-c): 10.0.12.0/24
│     └── (同上 - Multi-AZ冗長)
│
├── Isolated Subnet (AZ-a): 10.0.21.0/24
│     ├── Route: ローカルルートのみ
│     ├── リソース: RDS, ElastiCache
│     └── 特徴: インターネットアクセス完全不可
│
└── Isolated Subnet (AZ-c): 10.0.22.0/24
      └── (同上 - Multi-AZ冗長)
```

---

### ルートテーブル (Route Tables)

**定義:** サブネット内のトラフィックの宛先を決定するルールセット。各サブネットは1つのルートテーブルに関連付けられる。

**ルート優先度:** Longest Prefix Match (最長プレフィックス一致) が適用される。より具体的な (プレフィックスが長い) ルートが優先される。

```
例: 宛先が 10.0.1.50 のパケット
  - 10.0.0.0/16 → local        (一致: /16)
  - 10.0.1.0/24 → peering-xxx  (一致: /24)  ← こちらが優先 (より具体的)
  - 0.0.0.0/0   → igw-xxx      (一致: /0)
```

**Main Route Table vs Custom Route Table:**

| 特徴 | Main Route Table | Custom Route Table |
|------|-----------------|-------------------|
| 作成 | VPC作成時に自動 | 手動で作成 |
| 関連付け | 明示的に関連付けられていないサブネットに適用 | 明示的にサブネットに関連付け |
| ベストプラクティス | ローカルルートのみ残す | サブネットの用途に応じたルートを設定 |

---

### NAT Gateway vs NAT Instance

**定義:** NAT (Network Address Translation) は、プライベートサブネット内のリソースがインターネットにアウトバウンド通信する際に、プライベートIPをパブリックIPに変換する仕組みである。

**ソクラテス式 深堀り:**
> Q: 「NAT Gatewayとは何か? なぜプライベートサブネットに必要なのか?」
> A: プライベートサブネットのインスタンスはパブリックIPを持たないため、直接インターネットと通信できない。しかし、ソフトウェアのアップデートや外部APIの呼び出しなど、アウトバウンド通信が必要な場合がある。NAT Gatewayはプライベートインスタンスの代わりにインターネットと通信し、レスポンスを元のインスタンスに転送する。外部からプライベートインスタンスへの直接アクセスは引き続き不可能なため、セキュリティが維持される。

**現実世界のたとえ (非IT向け):**
> 「会社の代表電話番号のようなもの。社内の各社員 (プライベートインスタンス) が外部に電話 (インターネット通信) するとき、相手には会社の代表番号だけが見える。外部から社員に直接電話をかけることはできない。これがプライベートサブネットのセキュリティ」

**比較表:**

| 特徴 | NAT Gateway | NAT Instance |
|------|-------------|--------------|
| 可用性 | AZ内で冗長化 (マネージド) | 自分でMulti-AZ構成を設計 |
| 帯域幅 | 最大100 Gbps (自動スケール) | インスタンスタイプに依存 |
| メンテナンス | AWS管理 (パッチ不要) | 自分でOS/パッチ管理 |
| コスト | 時間課金 + データ処理課金 | インスタンス課金のみ |
| Security Group | 不可 (NACLのみ) | 適用可能 |
| Bastion Host兼用 | 不可 | 可能 |
| ポートフォワーディング | 不可 | 可能 |

**推奨:** 本番環境ではNAT Gateway一択。NAT Instanceは学習目的またはコスト極小化が必要な検証環境でのみ検討する。Multi-AZ構成ではAZごとにNAT Gatewayを配置する。

---

### Network ACLs vs Security Groups

**定義:** AWSにはサブネットレベル (NACL) とインスタンスレベル (Security Group) の2層のネットワークフィルタリングが存在する。

**ソクラテス式 深堀り:**
> Q: 「Stateful と Stateless の違いは何か?」
> A: Stateful (Security Group) は通信の「状態」を記憶する。インバウンドで許可した通信のリターントラフィック (レスポンス) は、アウトバウンドルールに関係なく自動で許可される。Stateless (NACL) は状態を記憶しない。インバウンドで許可しても、レスポンスのアウトバウンドは別途明示的に許可する必要がある。
> Q: 「両方ある必要があるのか? Security Groupだけでは不十分か?」
> A: Security Groupは「許可」ルールのみで「拒否」ルールを持てない。特定のIPアドレスからのアクセスを明示的にブロックしたい場合はNACLが必要である。また、NACLはサブネット全体に適用されるため、Security Groupの設定ミスがあっても防御の第2層として機能する。

**現実世界のたとえ (非IT向け):**
> 「クラブのバウンサー (入口の警備員)。Statefulなバウンサー (Security Group) は、あなたが入ったことを覚えている。出る時は自動で通す (リターントラフィック許可)。Statelessなバウンサー (NACL) は記憶力がない。入る時にIDチェック、出る時にもまたIDチェック。両方のルールを明示的に設定する必要がある」

**詳細比較:**

| 特徴 | Security Group | Network ACL |
|------|---------------|-------------|
| レベル | インスタンス (ENI) | サブネット |
| ステート | Stateful | Stateless |
| ルール | 許可のみ | 許可 AND 拒否 |
| 評価方法 | 全ルールを評価 | 番号順に評価 (最初の一致で決定) |
| デフォルト | 全インバウンド拒否、全アウトバウンド許可 | 全インバウンド許可、全アウトバウンド許可 |
| 適用 | 明示的にインスタンスに割り当て | サブネット内の全インスタンスに自動適用 |
| ルール数 | デフォルト60 (引き上げ可) | 20 (引き上げ可) |

**NACLルールの評価順序:**

```
Rule 100: Allow TCP 443 from 0.0.0.0/0       ← HTTPSを許可
Rule 200: Deny  TCP 443 from 203.0.113.0/24   ← この特定IPレンジからは拒否
Rule  *:  Deny  ALL  ALL from 0.0.0.0/0       ← デフォルト拒否

結果: 203.0.113.0/24 からの443アクセスは Rule 100 で先にマッチするため許可される!
→ 特定IPを拒否したい場合は、許可ルールより小さい番号 (例: Rule 50) に拒否ルールを配置する
```

---

### VPC Flow Logs

**定義:** VPC内のネットワークインターフェース (ENI) を流れるIPトラフィックのメタデータを記録するサービス。パケットの中身ではなく、ヘッダー情報 (送信元/宛先IP、ポート、プロトコル、許可/拒否) を記録する。

**キャプチャフォーマット (デフォルト):**

```
version account-id interface-id srcaddr dstaddr srcport dstport protocol packets bytes start end action log-status

2 123456789012 eni-abc123 10.0.1.50 10.0.2.100 49152 3306 6 20 4000 1620140661 1620140721 ACCEPT OK
```

**フィールド解説:**
- `srcaddr / dstaddr`: 送信元/宛先IPアドレス
- `srcport / dstport`: 送信元/宛先ポート (3306 = MySQL)
- `protocol`: プロトコル番号 (6 = TCP, 17 = UDP, 1 = ICMP)
- `action`: ACCEPT (許可) または REJECT (拒否)

**送信先オプション:**

| 送信先 | ユースケース | コスト考慮 |
|--------|------------|-----------|
| CloudWatch Logs | リアルタイム分析、Logs Insightsでクエリ | ログ取り込み + 保存料金 |
| S3 | 長期保存、Athenaで分析 | S3ストレージ料金 (安い) |
| Kinesis Data Firehose | リアルタイムストリーミング分析 | Firehose処理料金 |

**CloudWatch Logs Insights クエリ例:**

```
-- 拒否されたトラフィックのトップ10送信元
fields @timestamp, srcAddr, dstAddr, dstPort, action
| filter action = "REJECT"
| stats count(*) as numRejections by srcAddr
| sort numRejections desc
| limit 10
```

---

### VPC Peering

**定義:** 2つのVPC間でプライベートIPアドレスを使って直接通信を可能にする接続。トラフィックはAWSバックボーンネットワーク内に留まり、インターネットを経由しない。

**重要な制約:**
- **非推移的 (Non-transitive):** VPC-A ↔ VPC-B のピアリングと VPC-B ↔ VPC-C のピアリングがあっても、VPC-A → VPC-C の通信はVPC-B経由では不可。直接のピアリングが必要。
- **CIDR重複不可:** ピアリングする2つのVPCのCIDRブロックが重複していてはならない。
- **クロスリージョン:** 異なるリージョン間のピアリングをサポート。
- **クロスアカウント:** 異なるAWSアカウント間のピアリングをサポート。

**N個のVPCの場合に必要なピアリング数:** N × (N-1) / 2。VPCが10個なら45個のピアリング接続が必要。管理が煩雑になるため、大規模環境ではTransit Gatewayを検討する。

---

### Transit Gateway

**定義:** 複数のVPC、VPN、Direct Connectをハブ&スポークトポロジーで接続するネットワークトランジットハブ。全てのVPCがTransit Gatewayに1本接続するだけで、相互通信が可能になる。

**ソクラテス式 深堀り:**
> Q: 「Transit Gatewayとは何か? VPC Peeringとの違いは何か?」
> A: VPC Peeringは1対1の直接接続であり、VPCの数が増えるとフルメッシュ接続の管理が爆発的に複雑化する。Transit Gatewayは中央のハブとして全VPCを集約し、ルートテーブルで通信経路を制御する。VPCが3つ以上ある環境、またはオンプレミスとの接続がある環境ではTransit Gatewayが推奨される。

**現実世界のたとえ (非IT向け):**
> 「空港のハブ (乗り継ぎ拠点) のようなもの。VPC Peeringは都市間の直行便 (1対1)。VPCが10個あると45本の直行便 (ピアリング) が必要。Transit Gatewayは中央のハブ空港 - 全ての都市 (VPC) がハブに1本接続するだけで、どこにでも乗り継ぎできる」

**Transit Gateway の主要機能:**

| 機能 | 説明 |
|------|------|
| Route Tables | Transit Gateway独自のルートテーブルで通信経路を制御 |
| Associations | VPCやVPNをルートテーブルに関連付け |
| Propagations | 接続先からルートを自動学習 |
| Cross-Region Peering | 異なるリージョンのTransit Gateway同士を接続 |
| Multicast | マルチキャスト通信のサポート |
| ECMP | 複数VPN接続の帯域幅を集約 |

---

### VPC Endpoints

**定義:** VPC内のリソースがインターネットを経由せずにAWSサービスにアクセスするためのプライベート接続。Gateway EndpointとInterface Endpoint (PrivateLink) の2種類がある。

**ソクラテス式 深堀り:**
> Q: 「VPC Endpointとは何か? なぜ重要なのか?」
> A: 通常、VPC内のEC2がS3にアクセスする場合、トラフィックはNAT Gateway → Internet Gateway → パブリックインターネット → S3エンドポイントという経路を辿る。VPC Endpointを使うと、トラフィックはAWSプライベートネットワーク内に留まる。メリットは3つ: (1) セキュリティ向上 (トラフィックがインターネットに出ない)、(2) レイテンシ低減、(3) NATコスト削減 (NATのデータ処理料金が不要)。
> Q: 「Gateway EndpointとInterface Endpointの違いは?」
> A: Gateway EndpointはS3とDynamoDBのみ対応で無料。ルートテーブルにエントリが追加される形で動作する。Interface Endpointは100以上のAWSサービスに対応するがENIベースで有料。サブネット内にENIが作成され、プライベートIPが割り当てられる。

**現実世界のたとえ (非IT向け):**
> 「社内メールシステム vs 公共郵便。S3にAPI呼び出しを送るとき、通常は公共インターネット (郵便局) を経由する。VPC Endpointは、オフィスからS3ビルへの専用通路 (プライベート廊下) を作る。手紙は会社のキャンパス (AWSネットワーク) から一歩も出ない。メリット: 高速、安全、インターネットゲートウェイ不要」

**比較表:**

| 特徴 | Gateway Endpoint | Interface Endpoint (PrivateLink) |
|------|-----------------|----------------------------------|
| 対応サービス | S3, DynamoDB のみ | 100以上のAWSサービス + カスタムサービス |
| 料金 | **無料** | 時間課金 + データ処理課金 |
| 仕組み | ルートテーブルにエントリ追加 | サブネット内にENI作成 |
| Security Group | 不要 | **必要** (ENIに適用) |
| アクセス制御 | Endpoint Policy | Endpoint Policy + Security Group |
| DNS | 変更なし | プライベートDNS有効化で自動解決 |
| オンプレミスから | Direct Connect/VPN経由でアクセス不可 | Direct Connect/VPN経由でアクセス可能 |

**Endpoint Policy の例 (特定バケットのみアクセス許可):**

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

## アーキテクチャパターン

### パターン1: 標準的な3層VPC設計

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
  S3 Gateway Endpoint (無料)
  DynamoDB Gateway Endpoint (無料)
  ECR Interface Endpoint (コンテナイメージ取得用)
```

### パターン2: Transit Gateway マルチVPC接続

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

ルーティング制御:
  Production RT: Prod VPC + Shared VPC のみ (Dev VPCへの通信は不可)
  NonProd RT: Dev VPC + Shared VPC のみ (Prod VPCへの通信は不可)
  Shared RT: 全VPCへの通信を許可
```

### パターン3: VPC Endpoint によるセキュアなAWSサービスアクセス

```
Private Subnet のインスタンスから S3 へのアクセス:

WITHOUT VPC Endpoint:
  EC2 → NAT Gateway → Internet Gateway → Public Internet → S3
  コスト: NAT GW 時間課金 + NAT データ処理 ($0.062/GB)
  セキュリティ: トラフィックが一時的にインターネットに出る

WITH S3 Gateway Endpoint:
  EC2 → VPC Router → S3 (AWS プライベートネットワーク内)
  コスト: 無料
  セキュリティ: トラフィックがAWSネットワークから出ない

コスト削減例:
  月間S3転送量 1TB の場合
  NAT Gateway データ処理: 1,000 GB × $0.062 = $62/月
  S3 Gateway Endpoint: $0/月
  年間削減額: $744
```

## SAA試験のポイント

- **サブネットのAWS予約IP** は各サブネットで5つ (先頭4つ + 最後1つ)。/24 (256 IP) では使用可能は251個。/28 (16 IP) では11個。
- **Security GroupはStateful、NACLはStateless** が最頻出ポイント。Security Groupで許可したインバウンドのレスポンスは自動許可される。NACLはインバウンド/アウトバウンド両方明示的に設定が必要。
- **NACLのルール評価順序** は番号の小さい順。最初にマッチしたルールで決定。特定IPをブロックしたい場合は、許可ルールより小さい番号に拒否ルールを配置する。
- **NAT Gateway はAZ内でのみ冗長化** される。Multi-AZ環境ではAZごとにNAT Gatewayを配置する。1つのNAT Gatewayが障害を起こしても、他のAZのインスタンスは影響を受けないようにする。
- **VPC Peering は非推移的 (Non-transitive)**。A-B間とB-C間のピアリングがあっても、A-C間の通信はB経由では不可能。
- **S3とDynamoDBのVPC EndpointはGateway型で無料**。他のAWSサービスはInterface Endpoint (有料)。コスト最適化の問題ではS3 Gateway Endpointが頻出。
- **Transit Gateway vs VPC Peering:** 3つ以上のVPCを接続する場合、またはオンプレミスとの接続がある場合はTransit Gatewayが適切。2つのVPC間のシンプルな接続ならVPC Peeringでよい。
- **VPC Flow Logs はパケットキャプチャではない。** メタデータ (ヘッダー) のみ記録する。パケットの中身を確認するにはトラフィックミラーリングを使用する。
- **Interface Endpointにはプライベートホストゾーン** (Private DNS) 設定がある。有効化すると、AWSサービスのデフォルトDNS名が自動的にプライベートIPに解決される。
- **CIDRブロックが重複するVPCはPeering不可。** ネットワーク設計時にCIDRの重複を避けることが非常に重要。Secondary CIDRでの拡張も重複チェックが必要。

## ハンズオン参照

- CDKプロジェクト: `cdk-projects/04-networking-loadbalancing/`
- 構築する主要リソース:
  - VPC (3層サブネット構成: Public / Private / Isolated)
  - NAT Gateway (Multi-AZ)
  - Security Groups (ALB用、App用、DB用)
  - VPC Endpoints (S3 Gateway, DynamoDB Gateway)
  - VPC Flow Logs (CloudWatch Logs 送信)
  - Route Tables (Public, Private, Isolated)
- 確認ポイント:
  - Private SubnetのEC2からインターネットにアクセスできることを確認 (NAT Gateway経由)
  - Isolated SubnetのRDSにインターネットからアクセスできないことを確認
  - S3 Gateway Endpoint経由でS3にアクセスできることを確認
  - VPC Flow Logsで通信ログが記録されることを確認
  - Security Groupのステートフル動作を確認 (インバウンド許可のみでレスポンスが返ること)

## Well-Architected チェックリスト

### Security
- [ ] サブネットが用途に応じて Public / Private / Isolated に分離されているか
- [ ] Security Groupが最小権限の原則に従っているか (必要なポート/ソースのみ許可)
- [ ] NACLでサブネットレベルの追加防御が設定されているか
- [ ] VPC Flow Logsが全VPCで有効化され、分析基盤が整備されているか
- [ ] VPC Endpointを使用してAWSサービスへのトラフィックがプライベートネットワーク内に留まっているか
- [ ] Endpoint Policyでアクセスを必要最小限のリソースに制限しているか

### Reliability
- [ ] サブネットが最低2つのAZに跨って配置されているか
- [ ] NAT GatewayがAZごとに配置され、Single AZ障害時の影響が限定されるか
- [ ] CIDRブロックに将来のスケーリング余地があるか
- [ ] Transit Gatewayのルートテーブルで適切なセグメンテーションが実現されているか
- [ ] VPC PeeringまたはTransit Gateway接続でCIDR重複がないか
- [ ] Secondary CIDRブロックによる拡張計画が策定されているか
