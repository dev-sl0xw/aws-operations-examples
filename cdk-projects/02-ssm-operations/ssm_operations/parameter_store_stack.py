"""
Parameter Store Stack
======================

【なぜ階層的な命名規則がIAMパスベースのアクセス制御を実現するのか】

SSM Parameter Storeのパラメータ名はパス形式（例: /app/production/database/host）で
構造化できます。この階層構造の最大のメリットは、IAMポリシーでワイルドカードを
使ったアクセス制御が可能になることです。

例えば以下のようなIAMポリシーが書けます：
- 開発チーム: /app/staging/* へのアクセスを許可
- 本番運用チーム: /app/production/* へのアクセスを許可
- DBAチーム: /app/*/database/* へのアクセスを許可
- アプリケーション: /app/production/database/* の読み取りのみ許可

フラットな命名（例: app-production-database-host）では、
このような柔軟なアクセス制御は実現できません。

推奨される命名規則：
  /{組織}/{環境}/{サービス}/{パラメータ名}
  例: /myapp/production/database/host
      /myapp/staging/api/endpoint

【String, StringList, SecureString の違い】

1. String（文字列）:
   - 平文で保存される単純な文字列値
   - 用途: ホスト名、ポート番号、設定フラグ
   - 料金: 標準パラメータは無料（10,000個まで）

2. StringList（文字列リスト）:
   - カンマ区切りの文字列リスト
   - 用途: サブネットIDリスト、許可IPリスト
   - 注意: 値の中にカンマを含められない

3. SecureString（暗号化文字列）:
   - KMSキーで暗号化して保存
   - 用途: パスワード、APIキー、接続文字列
   - IAMに加えてKMSへのアクセス権限も必要
   - 監査証跡: CloudTrailで復号化アクセスが記録される

【Parameter Store vs Secrets Manager の使い分け】

Parameter Store:
  - 設定値の管理に最適（ホスト名、ポート、機能フラグ等）
  - 階層構造で組織的に管理できる
  - 標準パラメータは無料
  - SecureStringで暗号化も可能
  - ローテーション機能はなし

Secrets Manager:
  - 認証情報のライフサイクル管理に最適
  - 自動ローテーション機能がある（Lambda連携）
  - RDS、Redshift等とのネイティブ統合
  - 30日間の料金: $0.40/シークレット + API呼び出し料金
  - クロスアカウントアクセスが容易

判断基準：
  - 「ローテーションが必要か？」→ Yes → Secrets Manager
  - 「DB認証情報か？」→ Yes → Secrets Manager（RDS統合あり）
  - 「設定値やフラグか？」→ Yes → Parameter Store
  - 「コスト最小化が優先か？」→ Yes → Parameter Store

【KMS暗号化がどのように機密値を保護するのか】

SecureStringパラメータは、KMS（Key Management Service）で暗号化されます。

暗号化の流れ：
1. パラメータ作成時に、指定されたKMSキーで値が暗号化される
2. 暗号化された状態でParameter Storeに保存される
3. GetParameter API呼び出し時に、WithDecryption=trueを指定すると復号化される
4. 復号化にはKMSキーへのDecrypt権限が必要

セキュリティ上の利点：
- Parameter Storeのデータストアが侵害されても、KMSキーなしでは復号不可
- KMSキーポリシーで復号化できるプリンシパルを厳密に制御
- CloudTrailでKMS Decrypt APIの呼び出しが全て記録される
- キーのローテーションにより、長期的な暗号化の安全性を確保

【SSMドキュメント: 再利用可能な自動化のブループリント】

SSM Documentは、インスタンスやAWSリソースに対する操作を定義した
JSONまたはYAML形式のテンプレートです。

ドキュメントの種類：
- Command: Run Commandで実行（インスタンス上でスクリプト実行）
- Automation: Automation実行（AWSリソースの操作）
- Policy: State Managerのポリシー適用
- Session: Session Manager接続設定

ドキュメントを使う利点：
1. 再利用性: 同じ操作を複数のインスタンスに一貫して実行
2. バージョン管理: ドキュメントのバージョンを管理し、ロールバック可能
3. 承認ワークフロー: Automation文書にApprovalステップを組み込める
4. 監査証跡: 実行履歴がCloudTrailとSSM履歴に自動記録

【왜 계층적인 명명 규칙이 IAM 경로 기반 액세스 제어를 실현하는가】

SSM Parameter Store의 파라미터 이름은 경로 형식(예: /app/production/database/host)으로
구조화할 수 있습니다. 이 계층 구조의 최대 장점은, IAM 정책에서 와일드카드를
사용한 액세스 제어가 가능해지는 것입니다.

예를 들어 다음과 같은 IAM 정책을 작성할 수 있습니다:
- 개발팀: /app/staging/* 에의 액세스를 허가
- 운영팀: /app/production/* 에의 액세스를 허가
- DBA팀: /app/*/database/* 에의 액세스를 허가
- 애플리케이션: /app/production/database/* 의 읽기만 허가

플랫한 명명(예: app-production-database-host)으로는,
이러한 유연한 액세스 제어는 실현할 수 없습니다.

권장되는 명명 규칙:
  /{조직}/{환경}/{서비스}/{파라미터명}
  예: /myapp/production/database/host
      /myapp/staging/api/endpoint

【String, StringList, SecureString의 차이】

1. String (문자열):
   - 평문으로 저장되는 단순한 문자열 값
   - 용도: 호스트명, 포트 번호, 설정 플래그
   - 요금: 표준 파라미터는 무료 (10,000개까지)

2. StringList (문자열 리스트):
   - 쉼표 구분의 문자열 리스트
   - 용도: 서브넷 ID 리스트, 허가 IP 리스트
   - 주의: 값 안에 쉼표를 포함할 수 없음

3. SecureString (암호화 문자열):
   - KMS 키로 암호화하여 저장
   - 용도: 패스워드, API 키, 접속 문자열
   - IAM에 더해 KMS에의 액세스 권한도 필요
   - 감사 증적: CloudTrail에서 복호화 액세스가 기록됨

【Parameter Store vs Secrets Manager 사용 구분】

Parameter Store:
  - 설정값 관리에 최적 (호스트명, 포트, 기능 플래그 등)
  - 계층 구조로 조직적으로 관리 가능
  - 표준 파라미터는 무료
  - SecureString으로 암호화도 가능
  - 로테이션 기능은 없음

Secrets Manager:
  - 인증 정보의 라이프사이클 관리에 최적
  - 자동 로테이션 기능 있음 (Lambda 연동)
  - RDS, Redshift 등과의 네이티브 통합
  - 30일간의 요금: $0.40/시크릿 + API 호출 요금
  - 크로스 계정 액세스가 용이

판단 기준:
  - "로테이션이 필요한가?" → Yes → Secrets Manager
  - "DB 인증 정보인가?" → Yes → Secrets Manager (RDS 통합 있음)
  - "설정값이나 플래그인가?" → Yes → Parameter Store
  - "코스트 최소화가 우선인가?" → Yes → Parameter Store

【KMS 암호화가 어떻게 기밀값을 보호하는가】

SecureString 파라미터는, KMS (Key Management Service)로 암호화됩니다.

암호화의 흐름:
1. 파라미터 생성 시에 지정된 KMS 키로 값이 암호화됨
2. 암호화된 상태로 Parameter Store에 저장됨
3. GetParameter API 호출 시에, WithDecryption=true를 지정하면 복호화됨
4. 복호화에는 KMS 키에의 Decrypt 권한이 필요

보안상의 이점:
- Parameter Store의 데이터 스토어가 침해되어도, KMS 키 없이는 복호 불가
- KMS 키 정책으로 복호화할 수 있는 프린시펄을 엄밀하게 제어
- CloudTrail에서 KMS Decrypt API 호출이 모두 기록됨
- 키의 로테이션에 의해 장기적인 암호화의 안전성을 확보

【SSM 문서: 재사용 가능한 자동화의 블루프린트】

SSM Document는 인스턴스나 AWS 리소스에 대한 조작을 정의한
JSON 또는 YAML 형식의 템플릿입니다.

문서의 종류:
- Command: Run Command로 실행 (인스턴스 상에서 스크립트 실행)
- Automation: Automation 실행 (AWS 리소스의 조작)
- Policy: State Manager의 정책 적용
- Session: Session Manager 접속 설정

문서를 사용하는 이점:
1. 재사용성: 같은 조작을 복수의 인스턴스에 일관되게 실행
2. 버전 관리: 문서의 버전을 관리하고, 롤백 가능
3. 승인 워크플로: Automation 문서에 Approval 스텝을 조합 가능
4. 감사 증적: 실행 이력이 CloudTrail과 SSM 이력에 자동 기록
"""

from constructs import Construct
import aws_cdk as cdk
from aws_cdk import (
    Stack,
    RemovalPolicy,
    CfnOutput,
    aws_ssm as ssm,
    aws_kms as kms,
)


class ParameterStoreStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ====================================================================
        # KMSキー: SecureStringパラメータの暗号化用
        # ====================================================================
        # SecureStringパラメータを暗号化するためのカスタマーマネージドKMSキーです。
        #
        # AWSマネージドキー（aws/ssm）を使うことも可能ですが、
        # カスタマーマネージドキーを使う理由：
        # 1. キーポリシーで復号化できるプリンシパルを厳密に制御できる
        # 2. クロスアカウントアクセスを許可できる
        # 3. キーの自動ローテーションを制御できる
        # 4. CloudTrailでの監査が容易
        #
        # enable_key_rotation=True:
        #   KMSが毎年自動的にキーマテリアルをローテーションします。
        #   古い暗号文は古いキーマテリアルで引き続き復号化可能です。
        #   新しい暗号化は新しいキーマテリアルで行われます。
        # ====================================================================
        # KMS 키: SecureString 파라미터의 암호화용
        # ====================================================================
        # SecureString 파라미터를 암호화하기 위한 고객 관리형 KMS 키입니다.
        #
        # AWS 관리형 키 (aws/ssm)를 사용할 수도 있지만,
        # 고객 관리형 키를 사용하는 이유:
        # 1. 키 정책으로 복호화할 수 있는 프린시펄을 엄밀하게 제어 가능
        # 2. 크로스 계정 액세스를 허가 가능
        # 3. 키의 자동 로테이션을 제어 가능
        # 4. CloudTrail에서의 감사가 용이
        #
        # enable_key_rotation=True:
        #   KMS가 매년 자동으로 키 머티리얼을 로테이션합니다.
        #   오래된 암호문은 오래된 키 머티리얼로 계속 복호화 가능합니다.
        #   새로운 암호화는 새로운 키 머티리얼로 수행됩니다.
        parameter_encryption_key = kms.Key(
            self,
            "ParameterEncryptionKey",
            description="KMS key for encrypting SSM SecureString parameters",
            enable_key_rotation=True,
            # WARNING: Use RemovalPolicy.RETAIN in production
            removal_policy=RemovalPolicy.DESTROY,
            # エイリアスを設定してキーを識別しやすくする
            # 별칭을 설정하여 키를 식별하기 쉽게 함
            alias="ssm-parameter-encryption-key",
        )

        # ====================================================================
        # 本番環境のデータベース設定パラメータ（階層構造）
        # ====================================================================
        # /app/production/database/ 配下に関連するパラメータをグループ化します。
        #
        # この階層構造により、IAMポリシーで以下のような制御が可能です：
        #   Resource: arn:aws:ssm:*:*:parameter/app/production/database/*
        #   → production環境のデータベース関連パラメータ全てにアクセス許可
        #
        # GetParametersByPath APIを使えば、パス配下の全パラメータを一括取得できます。
        # 例: aws ssm get-parameters-by-path --path /app/production/database/
        #   → host, port, name, password が全て返される
        # ====================================================================
        # 운영 환경의 데이터베이스 설정 파라미터 (계층 구조)
        # ====================================================================
        # /app/production/database/ 하위에 관련 파라미터를 그룹화합니다.
        #
        # 이 계층 구조에 의해, IAM 정책에서 다음과 같은 제어가 가능합니다:
        #   Resource: arn:aws:ssm:*:*:parameter/app/production/database/*
        #   → production 환경의 데이터베이스 관련 파라미터 전부에 액세스 허가
        #
        # GetParametersByPath API를 사용하면, 경로 하위의 전 파라미터를 일괄 취득 가능.
        # 예: aws ssm get-parameters-by-path --path /app/production/database/
        #   → host, port, name, password가 모두 반환됨

        # データベースホスト名（String型）
        # 平文保存で問題ない設定値にはString型を使用
        # 데이터베이스 호스트명 (String형)
        # 평문 저장으로 문제없는 설정값에는 String형을 사용
        param_db_host = ssm.StringParameter(
            self,
            "ProductionDbHost",
            parameter_name="/app/production/database/host",
            string_value="prod-db.cluster-xxxxxxxxxxxx.ap-northeast-1.rds.amazonaws.com",
            description="Production database host endpoint",
            # ティア: Standard（無料、最大10,000パラメータ）
            # Advanced: 有料だが、パラメータポリシー（TTL、通知）が使える
            # 티어: Standard (무료, 최대 10,000 파라미터)
            # Advanced: 유료이지만, 파라미터 정책 (TTL, 통지)을 사용 가능
            tier=ssm.ParameterTier.STANDARD,
        )

        # データベースポート番号（String型）
        # 데이터베이스 포트 번호 (String형)
        param_db_port = ssm.StringParameter(
            self,
            "ProductionDbPort",
            parameter_name="/app/production/database/port",
            string_value="5432",
            description="Production database port number",
            tier=ssm.ParameterTier.STANDARD,
        )

        # データベース名（String型）
        # 데이터베이스명 (String형)
        param_db_name = ssm.StringParameter(
            self,
            "ProductionDbName",
            parameter_name="/app/production/database/name",
            string_value="myapp_production",
            description="Production database name",
            tier=ssm.ParameterTier.STANDARD,
        )

        # データベースパスワード（SecureString型）
        # SecureStringはCDKのL2コンストラクトでは直接作成できないため、
        # CfnParameterを使用します。
        #
        # 重要: 本番環境ではパスワードをコードにハードコードしないでください。
        # ここではデモ用のプレースホルダーです。実運用では：
        # 1. CDKデプロイ後にAWS CLIで値を更新する
        # 2. カスタムリソース（Lambda）で初期値を生成する
        # 3. Secrets Managerのローテーション機能を使う
        # 데이터베이스 패스워드 (SecureString형)
        # SecureString은 CDK의 L2 컨스트럭트에서는 직접 생성할 수 없으므로,
        # CfnParameter를 사용합니다.
        #
        # 중요: 운영 환경에서는 패스워드를 코드에 하드코딩하지 마십시오.
        # 여기서는 데모용 플레이스홀더입니다. 실운용에서는:
        # 1. CDK 디플로이 후에 AWS CLI로 값을 갱신
        # 2. 커스텀 리소스 (Lambda)로 초기값을 생성
        # 3. Secrets Manager의 로테이션 기능을 사용
        param_db_password = ssm.CfnParameter(
            self,
            "ProductionDbPassword",
            type="SecureString",
            name="/app/production/database/password",
            value="CHANGE_ME_AFTER_DEPLOY",
            description="Production database password (encrypted with KMS)",
            # 注意: CfnParameter (AWS::SSM::Parameter) はKMS KeyIdプロパティを
            # サポートしていません。SecureStringはデフォルトでaws/ssmマネージドキーを使用します。
            # カスタムKMSキーでの暗号化が必要な場合は、デプロイ後にAWS CLIで更新してください：
            # 주의: CfnParameter (AWS::SSM::Parameter)는 KMS KeyId 프로퍼티를
            # 서포트하지 않습니다. SecureString은 디폴트로 aws/ssm 매니지드 키를 사용합니다.
            # 커스텀 KMS 키로의 암호화가 필요한 경우, 디플로이 후에 AWS CLI로 갱신하십시오:
            #   aws ssm put-parameter --name /app/production/database/password \
            #     --value "actual-password" --type SecureString \
            #     --key-id <parameter_encryption_key.key_id>
        )

        # ====================================================================
        # ステージング環境のデータベース設定パラメータ
        # ====================================================================
        # 同じ階層構造をステージング環境にも適用します。
        # /app/staging/database/ と /app/production/database/ を分離することで、
        # 環境ごとのアクセス制御が可能になります。
        #
        # アプリケーションコードでは環境変数で環境名を渡し、
        # パラメータパスを動的に構築するパターンが推奨されます：
        #   env = os.environ.get("APP_ENV", "staging")
        #   param_path = f"/app/{env}/database/host"
        # ====================================================================
        # 스테이징 환경의 데이터베이스 설정 파라미터
        # ====================================================================
        # 같은 계층 구조를 스테이징 환경에도 적용합니다.
        # /app/staging/database/ 와 /app/production/database/ 를 분리함으로써,
        # 환경별 액세스 제어가 가능해집니다.
        #
        # 애플리케이션 코드에서는 환경 변수로 환경명을 전달하고,
        # 파라미터 경로를 동적으로 구축하는 패턴이 권장됩니다:
        #   env = os.environ.get("APP_ENV", "staging")
        #   param_path = f"/app/{env}/database/host"
        param_staging_db_host = ssm.StringParameter(
            self,
            "StagingDbHost",
            parameter_name="/app/staging/database/host",
            string_value="staging-db.cluster-yyyyyyyyyyyy.ap-northeast-1.rds.amazonaws.com",
            description="Staging database host endpoint",
            tier=ssm.ParameterTier.STANDARD,
        )

        # ====================================================================
        # SSM Document: カスタムRun Commandドキュメント
        # ====================================================================
        # SSM Documentは、インスタンス上で実行する操作を定義したテンプレートです。
        # ここでは、Parameter Storeからパラメータを読み取り、ログに出力する
        # シンプルなCommandドキュメントを作成します。
        #
        # ドキュメントの構成要素：
        # - schemaVersion: ドキュメントスキーマのバージョン
        # - description: ドキュメントの説明
        # - parameters: 実行時に渡すパラメータの定義
        # - mainSteps: 実行するステップのリスト
        #
        # このドキュメントは以下のように実行します：
        # aws ssm send-command \
        #   --document-name "CustomReadParameter" \
        #   --targets "Key=tag:Environment,Values=production" \
        #   --parameters "ParameterPath=/app/production/database/host"
        # ====================================================================
        # SSM Document: 커스텀 Run Command 문서
        # ====================================================================
        # SSM Document는 인스턴스 상에서 실행하는 조작을 정의한 템플릿입니다.
        # 여기서는 Parameter Store에서 파라미터를 읽어, 로그에 출력하는
        # 심플한 Command 문서를 생성합니다.
        #
        # 문서의 구성 요소:
        # - schemaVersion: 문서 스키마의 버전
        # - description: 문서의 설명
        # - parameters: 실행 시에 전달하는 파라미터의 정의
        # - mainSteps: 실행할 스텝의 리스트
        #
        # 이 문서는 다음과 같이 실행합니다:
        # aws ssm send-command \
        #   --document-name "CustomReadParameter" \
        #   --targets "Key=tag:Environment,Values=production" \
        #   --parameters "ParameterPath=/app/production/database/host"
        custom_document = ssm.CfnDocument(
            self,
            "CustomReadParameterDocument",
            name="CustomReadParameter",
            document_type="Command",
            # YAML形式でもJSON形式でも指定可能。ここではPythonのdictで定義し、
            # CDKがJSON形式に変換します。
            # YAML 형식으로도 JSON 형식으로도 지정 가능. 여기서는 Python의 dict로 정의하고,
            # CDK가 JSON 형식으로 변환합니다.
            content={
                "schemaVersion": "2.2",
                "description": "Read an SSM parameter and write its value to the log. This document demonstrates how to use Run Command to retrieve configuration from Parameter Store on managed instances.",
                "parameters": {
                    "ParameterPath": {
                        "type": "String",
                        "description": "The SSM Parameter Store path to read (e.g., /app/production/database/host)",
                        "default": "/app/production/database/host",
                    },
                    "LogFilePath": {
                        "type": "String",
                        "description": "The file path to write the parameter value to",
                        "default": "/var/log/ssm-parameter-read.log",
                    },
                },
                "mainSteps": [
                    {
                        "action": "aws:runShellScript",
                        "name": "ReadParameterAndLog",
                        "inputs": {
                            "runCommand": [
                                "#!/bin/bash",
                                "set -e",
                                "",
                                "# タイムスタンプ付きでログを記録 / 타임스탬프 포함으로 로그를 기록",
                                "TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')",
                                "# IMDSv2トークンを取得（セキュリティ強化のためIMDSv2を使用）/ IMDSv2 토큰을 취득 (보안 강화를 위해 IMDSv2를 사용)",
                                'TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")',
                                'REGION=$(curl -sf -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)',
                                "",
                                "# SSM Parameter Storeからパラメータを取得 / SSM Parameter Store에서 파라미터를 취득",
                                "# --with-decryption フラグにより、SecureStringも復号化して取得できる / --with-decryption 플래그에 의해, SecureString도 복호화하여 취득 가능",
                                "PARAM_VALUE=$(aws ssm get-parameter \\",
                                "  --name '{{ ParameterPath }}' \\",
                                "  --with-decryption \\",
                                "  --region $REGION \\",
                                "  --query 'Parameter.Value' \\",
                                "  --output text 2>&1) || {",
                                "    echo \"[$TIMESTAMP] ERROR: Failed to read parameter '{{ ParameterPath }}'\" >> '{{ LogFilePath }}'",
                                "    exit 1",
                                "  }",
                                "",
                                "# パラメータ値をログファイルに出力 / 파라미터 값을 로그 파일에 출력",
                                "echo \"[$TIMESTAMP] Parameter '{{ ParameterPath }}' = $PARAM_VALUE\" >> '{{ LogFilePath }}'",
                                "echo \"Successfully read parameter '{{ ParameterPath }}'\"",
                            ],
                        },
                    }
                ],
            },
            # ドキュメントのバージョン管理
            # update_methodを指定することで、同名ドキュメントが存在する場合の
            # 動作を制御できます
            # 문서의 버전 관리
            # update_method를 지정함으로써, 동명 문서가 존재하는 경우의
            # 동작을 제어할 수 있습니다
            document_format="JSON",
            tags=[
                cdk.CfnTag(key="Purpose", value="configuration-management"),
                cdk.CfnTag(key="DocumentType", value="Command"),
            ],
        )

        # ====================================================================
        # CfnOutputs: スタック出力
        # ====================================================================
        # CfnOutputs: Stack 출력
        # ====================================================================
        CfnOutput(
            self,
            "KmsKeyArn",
            value=parameter_encryption_key.key_arn,
            description="KMS key ARN for encrypting SecureString parameters",
            export_name="SSMParameterEncryptionKeyArn",
        )

        CfnOutput(
            self,
            "KmsKeyId",
            value=parameter_encryption_key.key_id,
            description="KMS key ID for encrypting SecureString parameters",
            export_name="SSMParameterEncryptionKeyId",
        )

        CfnOutput(
            self,
            "ProductionDbParameterPath",
            value="/app/production/database",
            description="Base path for production database parameters",
            export_name="SSMProductionDbParameterPath",
        )

        CfnOutput(
            self,
            "StagingDbParameterPath",
            value="/app/staging/database",
            description="Base path for staging database parameters",
            export_name="SSMStagingDbParameterPath",
        )

        CfnOutput(
            self,
            "CustomDocumentName",
            value=custom_document.name,
            description="SSM Document name for custom parameter reading",
            export_name="SSMCustomReadParameterDocumentName",
        )
