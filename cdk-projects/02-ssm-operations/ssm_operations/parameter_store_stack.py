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
        parameter_encryption_key = kms.Key(
            self,
            "ParameterEncryptionKey",
            description="KMS key for encrypting SSM SecureString parameters",
            enable_key_rotation=True,
            removal_policy=RemovalPolicy.DESTROY,
            # エイリアスを設定してキーを識別しやすくする
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

        # データベースホスト名（String型）
        # 平文保存で問題ない設定値にはString型を使用
        param_db_host = ssm.StringParameter(
            self,
            "ProductionDbHost",
            parameter_name="/app/production/database/host",
            string_value="prod-db.cluster-xxxxxxxxxxxx.ap-northeast-1.rds.amazonaws.com",
            description="Production database host endpoint",
            # ティア: Standard（無料、最大10,000パラメータ）
            # Advanced: 有料だが、パラメータポリシー（TTL、通知）が使える
            tier=ssm.ParameterTier.STANDARD,
        )

        # データベースポート番号（String型）
        param_db_port = ssm.StringParameter(
            self,
            "ProductionDbPort",
            parameter_name="/app/production/database/port",
            string_value="5432",
            description="Production database port number",
            tier=ssm.ParameterTier.STANDARD,
        )

        # データベース名（String型）
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
        param_db_password = ssm.CfnParameter(
            self,
            "ProductionDbPassword",
            type="SecureString",
            name="/app/production/database/password",
            value="CHANGE_ME_AFTER_DEPLOY",
            description="Production database password (encrypted with KMS)",
            key_id=parameter_encryption_key.key_id,
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
        custom_document = ssm.CfnDocument(
            self,
            "CustomReadParameterDocument",
            name="CustomReadParameter",
            document_type="Command",
            # YAML形式でもJSON形式でも指定可能。ここではPythonのdictで定義し、
            # CDKがJSON形式に変換します。
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
                                "# タイムスタンプ付きでログを記録",
                                "TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')",
                                "REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)",
                                "",
                                "# SSM Parameter Storeからパラメータを取得",
                                "# --with-decryption フラグにより、SecureStringも復号化して取得できる",
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
                                "# パラメータ値をログファイルに出力",
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
            document_format="JSON",
            tags=[
                cdk.CfnTag(key="Purpose", value="configuration-management"),
                cdk.CfnTag(key="DocumentType", value="Command"),
            ],
        )

        # ====================================================================
        # CfnOutputs: スタック出力
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
