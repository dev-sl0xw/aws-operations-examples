# セクション01: IaC基礎 (Infrastructure as Code Foundations)
> Well-Architected Pillars: Operational Excellence, Cost Optimization
> Day: 1 | 難易度: 基礎

## 概要

Infrastructure as Code (IaC) は、クラウドインフラストラクチャをコードとして定義・管理する手法である。従来の手動コンソール操作やCLIによる場当たり的な構築を排除し、テンプレートファイルによってインフラの状態を宣言的に記述する。これにより、環境の再現性、変更の追跡可能性、チーム間の協業が飛躍的に向上する。

AWSにおけるIaCの中核はCloudFormationであり、その上位抽象化としてCDK (Cloud Development Kit) が存在する。CloudFormationはJSON/YAMLテンプレートからAWSリソースのプロビジョニングを自動化し、スタック単位でリソースのライフサイクルを管理する。CDKはTypeScript、Python等のプログラミング言語でインフラを記述でき、CloudFormationテンプレートに合成 (synthesize) される。

運用の観点から、IaCはOperational Excellenceの柱の根幹を成す。変更管理のプロセスを標準化し、環境間の一貫性を保証し、障害時の迅速な復旧を可能にする。また、不要リソースの可視化によるCost Optimizationにも直結する。

## キーコンセプト

### Infrastructure as Code (IaC)

**定義:** インフラストラクチャの構成をコード(テンプレートファイル)として記述し、バージョン管理・自動化・再利用可能にする手法。手動操作を排除し、プロビジョニングプロセスを宣言的かつ冪等にする。

**ソクラテス式 深堀り:**
> Q: 「IaCとは何か?なぜ必要なのか?」
> A: IaCとは、サーバーやネットワークなどのインフラ構成をコードファイルに記述することである。なぜ必要かを考えるには、IaCがない世界を想像するとよい。従来、エンジニアはAWSコンソールにログインし、マウスでクリックしてEC2を作り、セキュリティグループを設定し、RDSを構築していた。この手順は担当者の記憶やメモに依存し、再現性がない。2回目に同じ環境を作ろうとすると、微妙に設定が違う環境ができあがる。IaCはこの問題を根本的に解決する。
> Q: 「では、IaCがないとどうなるか?」
> A: (1) 環境の不整合: 開発・ステージング・本番環境で設定が異なり「開発では動いたのに本番で動かない」が頻発する。(2) 変更の追跡不能: 誰がいつ何を変更したか分からず、障害原因の特定に時間がかかる。(3) 復旧の遅延: 障害時に手動で環境を再構築するため、RTOが数時間〜数日に及ぶ。(4) 属人化: 特定のエンジニアしか環境を構築できない状態に陥る。

**現実世界のたとえ (非IT向け):**
> 「レストランのレシピ vs 記憶で料理。レシピ(テンプレート)があれば、誰が作っても毎回同じ料理(環境)が再現できます。記憶に頼ると、料理人が変わるたびに味が変わってしまいます。さらに、レシピをバージョン管理すれば『先月のレシピに戻す』こともできます」

---

### 冪等性 (Idempotency)

**定義:** 同じ操作を何度実行しても、結果が常に同一である性質。CloudFormationテンプレートを繰り返しデプロイしても、既に存在するリソースは再作成されず、差分のみが適用される。

**ソクラテス式 深堀り:**
> Q: 「冪等性とは何か?なぜIaCにとって重要なのか?」
> A: 冪等性とは、数学的には f(f(x)) = f(x) となる性質のことである。IaCの文脈では「テンプレートを10回適用しても、1回適用した時と同じ結果になる」ということを意味する。これが重要なのは、運用の現場ではデプロイが途中で失敗したり、同じテンプレートを複数回適用する状況が頻繁に発生するからである。冪等性がなければ、2回目のデプロイで重複リソースが作られたり、エラーで停止する。
> Q: 「では、冪等性がないシステムではどうなるか?」
> A: 例えば「EC2インスタンスを1台作成せよ」というスクリプトを冪等性なしに2回実行すると、2台のインスタンスが作成される。CloudFormationはスタックの現在の状態とテンプレートの望ましい状態を比較し、差分だけを適用する。既にインスタンスが存在すれば何もしない。これが冪等性の力である。

**現実世界のたとえ (非IT向け):**
> 「ある種のシステムの電気スイッチのようなもの。1回押してもON、もう1回押しても既にONなら何も変わらない。CloudFormationにテンプレートを何度適用しても、結果は常に同じ状態に収束します」

---

### 宣言的 vs 命令的 (Declarative vs Imperative)

**定義:** 宣言的アプローチは「何が欲しいか」(最終状態)を記述し、到達方法はシステムに委ねる。命令的アプローチは「どうやって作るか」(手順)を一つずつ記述する。CloudFormationは宣言的、シェルスクリプトは命令的である。

**ソクラテス式 深堀り:**
> Q: 「なぜCloudFormationは宣言的アプローチを採用しているのか?」
> A: 宣言的アプローチの最大の利点は、エンジニアが「何を」達成したいかに集中でき、「どのように」達成するかの複雑さをCloudFormationエンジンに委任できることにある。例えば、VPCを作成してからサブネットを作り、その後セキュリティグループを作る、という順序の管理はCloudFormationが依存関係グラフを自動解析して行う。命令的スクリプトでは、この順序を人間が正確に管理する必要がある。
> Q: 「では、宣言的アプローチの弱点はないのか?」
> A: 複雑な条件分岐やループ処理が苦手である。CloudFormationのConditionsやMappingsは限定的であり、プログラミング言語の柔軟性にはかなわない。これがCDKの登場理由の一つである。CDKはプログラミング言語の全ての機能(if文、for文、関数、クラス)を使ってインフラを記述でき、最終的にCloudFormationテンプレートとして出力される。

**現実世界のたとえ (非IT向け):**
> 「目的地をナビに入力する(宣言的)のと、『次の交差点を右折して、3つ目の信号を左折して...』と一つずつ指示する(命令的)の違い。CloudFormationは宣言的 -- 最終状態を記述すれば、到達方法はAWSが判断します。渋滞(依存関係)の迂回も自動です」

---

### CloudFormation テンプレート構造

**定義:** CloudFormationテンプレートはJSON/YAML形式で記述され、以下の主要セクションで構成される。

```yaml
AWSTemplateFormatVersion: "2010-09-09"   # テンプレート仕様バージョン (固定値)
Description: "テンプレートの説明文"        # 人間向けの説明

Parameters:                               # デプロイ時に渡す変数
  EnvironmentType:
    Type: String
    AllowedValues: [dev, stg, prod]
    Default: dev

Mappings:                                 # 静的な参照テーブル (デプロイ時に変更不可)
  RegionMap:
    ap-northeast-1:
      AMI: ami-0abcdef1234567890
    us-east-1:
      AMI: ami-0fedcba9876543210

Conditions:                               # 条件付きリソース作成
  IsProduction: !Equals [!Ref EnvironmentType, prod]

Resources:                                # 【必須】AWSリソース定義
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "${AWS::StackName}-data"

Outputs:                                  # スタック作成後の出力値
  BucketArn:
    Value: !GetAtt MyBucket.Arn
    Export:
      Name: !Sub "${AWS::StackName}-BucketArn"
```

**重要なポイント:**
- `Resources` セクションのみが必須。他は全てオプション。
- `AWSTemplateFormatVersion` は "2010-09-09" で固定(2010年以降更新されていない)。
- `Parameters` はデプロイ時に動的入力、`Mappings` はテンプレート内の静的な参照テーブル。
- `Outputs` の `Export` はクロススタック参照に使用される。

---

### 組み込み関数 (Intrinsic Functions)

**定義:** CloudFormationテンプレート内でリソース間の参照や文字列操作を行うための関数群。

| 関数 | 用途 | 例 |
|------|------|-----|
| `!Ref` | パラメータの値またはリソースの物理IDを返す | `!Ref MyBucket` → バケット名 |
| `!GetAtt` | リソースの特定の属性を返す | `!GetAtt MyBucket.Arn` → ARN |
| `!Sub` | 文字列内の変数を置換する | `!Sub "arn:aws:s3:::${MyBucket}/*"` |
| `!Join` | 区切り文字で文字列を結合する | `!Join ["-", [!Ref Env, "app"]]` |
| `!Select` | リストから指定インデックスの値を返す | `!Select [0, !GetAZs ""]` |
| `!Split` | 文字列を区切り文字で分割する | `!Split [",", "a,b,c"]` |
| `!If` | 条件に基づいて値を返す | `!If [IsProduction, "t3.large", "t3.micro"]` |
| `!FindInMap` | Mappingsから値を取得する | `!FindInMap [RegionMap, !Ref "AWS::Region", AMI]` |

**DependsOn について:**

`DependsOn` は関数ではなくリソース属性であり、明示的な依存関係を宣言する。

```yaml
Resources:
  MyInstance:
    Type: AWS::EC2::Instance
    DependsOn: MyRDSInstance    # RDSが先に作成される
    Properties:
      # ...
```

通常、CloudFormationは `!Ref` や `!GetAtt` の参照から暗黙的な依存関係を推論する。`DependsOn` が必要なのは、参照関係がない場合でも順序を制御したい場合（例: EC2がRDSの起動を待つ必要があるが、テンプレート内で直接参照していない場合）である。

---

### ドリフト検出 (Drift Detection)

**定義:** CloudFormationスタックの実際のリソース状態と、テンプレートで定義された期待状態の差分を検出する機能。コンソールやAPIから手動で変更された設定を発見できる。

**ソクラテス式 深堀り:**
> Q: 「ドリフトとは何か?なぜ発生するのか?」
> A: ドリフトとは、CloudFormationで管理されているリソースが、テンプレート外の手段(コンソール操作、CLI、別のIaCツール等)で変更され、テンプレートの定義と実際の状態が乖離することを指す。発生原因は主に (1) 緊急対応でコンソールから直接変更した、(2) 別チームが知らずに変更した、(3) AWS自動処理による変更、の3つである。
> Q: 「ドリフト検出には限界があるか?」
> A: ある。(1) 全てのリソースタイプがドリフト検出に対応しているわけではない。(2) テンプレートに記述されていないプロパティの変更は検出できない。(3) ネストされたスタックのドリフト検出には追加の操作が必要。(4) リソースの削除は検出できるが、テンプレート外で追加されたリソースは検出できない。

**現実世界のたとえ (非IT向け):**
> 「誰かが無断でオフィスの家具を配置換えしたようなもの。図面(テンプレート)では窓際にデスクがあるはずが、実際は角に移動している。ドリフト検出はこの差分を見つける機能です。ただし、図面に載っていない私物(テンプレート外のプロパティ)の移動は検出できません」

**ドリフト検出が捕捉できるもの:**
- リソースのプロパティ値の変更
- スタック管理リソースの削除

**ドリフト検出が捕捉できないもの:**
- テンプレートに記述していないプロパティの変更
- サポートされていないリソースタイプの変更
- テンプレート外で追加された新規リソース

---

### Service Catalog

**定義:** AWS Service Catalogは、組織内で承認済みのAWSリソースを「製品」として定義し、ポートフォリオとしてまとめて配布・管理するサービス。エンドユーザーは事前承認された構成のみをセルフサービスでプロビジョニングできる。

**主要コンセプト:**

| コンセプト | 説明 |
|------------|------|
| **ポートフォリオ** | 製品の集合。IAMユーザー/グループ/ロールに共有する |
| **製品 (Product)** | CloudFormationテンプレートに基づく単位。バージョン管理可能 |
| **起動制約 (Launch Constraint)** | 製品のプロビジョニング時に使用するIAMロールを指定。エンドユーザーに直接のCloudFormation権限を与えずに済む |
| **バージョニング** | 製品の複数バージョンを管理。古いバージョンからの移行を制御 |

**ソクラテス式 深堀り:**
> Q: 「なぜService Catalogが必要なのか?IAMポリシーだけでは不十分か?」
> A: IAMポリシーは「何ができるか」を制御するが、「どのような構成で作るか」までは制御できない。例えばIAMで「EC2を作成できる」と許可しても、エンドユーザーがm5.24xlargeを選んでコストが爆発する可能性がある。Service Catalogなら「t3.microのEC2 + 指定VPC + 指定セキュリティグループ」という承認済みの構成のみを提供できる。
> Q: 「起動制約 (Launch Constraint) はなぜ重要か?」
> A: 起動制約がないと、エンドユーザーがCloudFormationスタックを作成するために、CloudFormation + 全リソースの作成権限が必要になる。起動制約を使えば、指定したIAMロールの権限でプロビジョニングが実行されるため、ユーザー自身には最小限の権限(Service Catalogの利用権限のみ)で済む。

---

### タグ戦略 (Tagging Strategy)

**定義:** AWSリソースにキー・バリューペアのメタデータを付与し、コスト配分、アクセス制御、自動化、運用管理を実現する体系的なアプローチ。

**4ステップアプローチ:**

1. **目的定義:** タグで何を達成したいか明確にする
   - コスト配分 (Cost Allocation)
   - アクセス制御 (ABAC: Attribute-Based Access Control)
   - 自動化 (例: 夜間に自動停止するインスタンスを `AutoStop=true` で識別)
   - 運用管理 (環境識別、オーナー識別)

2. **命名規則:** 一貫したキー命名規則を策定する
   ```
   Environment: dev | stg | prod
   Project: project-name
   Owner: team-name
   CostCenter: 1234
   AutoStop: true | false
   ```
   - ケース統一 (PascalCase推奨)
   - プレフィックス使用 (例: `aws:` はAWS予約、`company:` は自社)

3. **強制 (Enforcement):**
   - SCP: タグなしリソース作成を禁止
   - AWS Config Rules: `required-tags` ルールで未タグリソースを検出
   - Service Catalog: テンプレートにタグを組み込み

4. **評価改善:** Tag Editorでタグの適用状況を可視化し、定期的にレビュー

---

### CDK vs CloudFormation

**定義:** AWS CDKはプログラミング言語(TypeScript, Python, Java, C#, Go)でインフラを記述し、CloudFormationテンプレートに合成するフレームワーク。CloudFormationの上位レイヤーに位置する。

| 観点 | CloudFormation | CDK |
|------|---------------|-----|
| 記述言語 | YAML/JSON | TypeScript, Python等 |
| 抽象度 | 低 (L1: 1対1マッピング) | 高 (L2: ベストプラクティス込み) |
| 条件分岐 | Conditions (限定的) | if/else (完全) |
| ループ | なし | for/map (完全) |
| テスト | 困難 | ユニットテスト可能 |
| 再利用 | ネストスタック | Constructs (npm等で配布) |
| 学習曲線 | 低〜中 | 中〜高 (プログラミング知識必要) |

**CDKが好まれる場面:**
- 複数環境(dev/stg/prod)で微妙に異なる構成を管理する場合
- 条件分岐やループが多いインフラ構成
- ユニットテストを含むCI/CDパイプラインでの管理
- チーム内にプログラミングスキルがある場合

**CloudFormationが好まれる場面:**
- シンプルなインフラ構成
- プログラミング知識がないチーム
- Service Catalogの製品テンプレートとして使用する場合

## アーキテクチャパターン

### パターン1: 環境別スタック分離

```
cdk-app/
  lib/
    network-stack.ts      # VPC, Subnets
    compute-stack.ts      # EC2, ECS
    database-stack.ts     # RDS, DynamoDB
  bin/
    app.ts                # 環境ごとにスタックをインスタンス化
```

各スタックを機能ごとに分離し、`cdk.json` のcontextまたは環境変数で dev/stg/prod を切り替える。スタック間の依存は `Export/Import` または CDK の直接参照で解決する。

### パターン2: マルチアカウント・マルチリージョン

```
Organizations Root
  ├── Management Account (CloudFormation StackSets)
  ├── OU: Production
  │     ├── Account: prod-ap-northeast-1
  │     └── Account: prod-us-east-1
  └── OU: Non-Production
        ├── Account: dev
        └── Account: stg
```

CloudFormation StackSetsを使用して、複数アカウント・複数リージョンに一括デプロイ。Service CatalogとOrganizationsの統合で、承認済み製品を全アカウントに配布する。

### パターン3: CI/CDパイプラインによるIaCデプロイ

```
Git Push → CodePipeline → CodeBuild (cdk synth + test) → CloudFormation Deploy
                                       ↓
                              Manual Approval (prod)
```

CDKの `cdk synth` でテンプレートを生成し、ユニットテストとスナップショットテストを実行後、CloudFormation経由でデプロイする。本番環境には手動承認ステージを挟む。

## SAA試験のポイント

- **CloudFormationテンプレートで唯一の必須セクションは `Resources`** である。`AWSTemplateFormatVersion` は推奨だが必須ではない。
- **`!Ref`** はパラメータの場合は値を、リソースの場合は物理ID(例: EC2のインスタンスID)を返す。ARNが欲しい場合は **`!GetAtt`** を使う。
- **ドリフト検出** は全てのリソースタイプに対応していない。サポートされるリソースはAWSドキュメントで要確認。
- **スタックの更新時の動作** には3種類ある: Update with No Interruption (中断なし), Update with Some Interruption (一部中断), Replacement (置き換え = 旧リソース削除 + 新規作成)。
- **DeletionPolicy** はスタック削除時のリソースの扱いを制御する。`Retain` (保持), `Snapshot` (スナップショット取得後削除), `Delete` (削除、デフォルト)。
- **StackSets** はOrganizationsと連携して複数アカウント・リージョンに一括デプロイ。管理アカウントまたは委任管理者アカウントから操作する。
- **Service Catalogの起動制約** を使えば、エンドユーザーにCloudFormation権限を直接付与せずに製品をプロビジョニングできる。
- **Mappings** はデプロイ時に変更不可の静的テーブル。リージョン別AMI IDのような固定値の参照に使う。**Parameters** は動的入力。
- **CloudFormation Change Sets** は更新前に変更内容をプレビューする機能。実際の変更は適用するまで行われない。

## ハンズオン参照

- CDKプロジェクト: `cdk-projects/01-iam-org-governance/`
- 主要スタック: IamOrgGovernanceStack
- 関連スクリプト: `scripts/` ディレクトリ内のセットアップスクリプト

## Well-Architected チェックリスト

### Operational Excellence
- [ ] 全てのインフラがIaCで管理されているか (手動作成リソースが存在しないか)
- [ ] CloudFormationドリフト検出を定期的に実行しているか
- [ ] スタックの変更にChange Setsを使用しているか
- [ ] テンプレートがバージョン管理(Git)されているか
- [ ] CI/CDパイプラインでIaCの自動デプロイを行っているか

### Cost Optimization
- [ ] 全リソースにコスト配分タグが付与されているか
- [ ] タグベースのコストレポートが有効化されているか
- [ ] 不要リソースを識別するためのタグ戦略が策定されているか
- [ ] Service Catalogでコスト効率の良い構成のみを許可しているか
- [ ] DeletionPolicyが適切に設定され、不要なリソース保持が発生しないか
