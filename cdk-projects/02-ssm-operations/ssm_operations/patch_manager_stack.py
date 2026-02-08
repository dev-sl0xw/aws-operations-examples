"""
Patch Manager Stack
====================

【なぜ自動パッチ適用がセキュリティコンプライアンスに不可欠なのか】

セキュリティ脆弱性の多くは、既知の問題に対するパッチが適用されていないことに
起因します。2017年のEquifaxの大規模データ漏洩は、Apache Strutsの既知の脆弱性に
パッチを適用していなかったことが原因でした。

手動パッチ適用の課題：
- 数百台のインスタンスに手動でパッチを適用するのは非現実的
- 人為的ミス（適用漏れ、順序の誤り）が発生しやすい
- 監査証跡の管理が困難
- パッチ適用のタイミングがばらつく

SSM Patch Managerは、これらの課題を以下のように解決します：
- パッチベースラインで「何を適用するか」を定義
- メンテナンスウィンドウで「いつ適用するか」を制御
- パッチグループで「どのインスタンスに適用するか」を管理
- 全ての操作が自動的に監査証跡として記録される

【メンテナンスウィンドウの概念】

メンテナンスウィンドウは「計画的な変更作業の時間枠」を定義する仕組みです。
なぜ必要なのか：
- パッチ適用にはインスタンスの再起動が伴うことがある
- 業務時間中の再起動はサービス影響を引き起こす
- 変更管理プロセス（ITIL等）との整合性が求められる
- 問題発生時のロールバック時間を確保する必要がある

メンテナンスウィンドウの構成要素：
1. Schedule（スケジュール）: いつ実行するか
2. Duration（期間）: 最大何時間かけるか
3. Cutoff（カットオフ）: 期間終了の何時間前に新規タスク開始を停止するか
4. Target（ターゲット）: どのインスタンスが対象か
5. Task（タスク）: 何を実行するか

【パッチベースラインの承認ルールとセキュリティへの影響】

パッチベースラインは「どのパッチを自動承認するか」のルールセットです。

承認ルールの設計指針：
- Critical/Important: できるだけ早く適用（7日以内を推奨）
- Medium/Low: ビジネスリスクに応じて14〜30日
- 自動承認の待機期間は、パッチの安定性を確認するためのバッファ
  （ゼロデイ対応時はこの待機期間を短縮する判断が必要）

拒否パッチ：
- 既知の問題を引き起こすパッチ（例：特定のKBがアプリケーションと非互換）
- セキュリティチームが検証中のパッチ
- 業務アプリケーションに影響するパッチ

【ScanとInstallの違い】

Scan（スキャン）操作：
- インスタンスに欠落しているパッチを検出するだけ
- 何もインストールしない、再起動しない
- コンプライアンスレポートの生成に使用
- 業務時間中でも安全に実行できる

Install（インストール）操作：
- 実際にパッチをダウンロードしてインストールする
- 再起動が必要になることがある
- メンテナンスウィンドウ内で実行すべき
- ロールバック計画を準備しておくべき

推奨パターン：毎日Scanを実行してコンプライアンス状態を把握し、
週次のメンテナンスウィンドウでInstallを実行する。
"""

from constructs import Construct
import aws_cdk as cdk
from aws_cdk import (
    Stack,
    CfnOutput,
    aws_ssm as ssm,
)


class PatchManagerStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ====================================================================
        # パッチベースライン: Amazon Linux 2 用
        # ====================================================================
        # パッチベースラインは「どのパッチを承認するか」のルールセットです。
        # AWSはOS別にデフォルトベースラインを提供していますが、
        # カスタムベースラインを作成することで、組織のポリシーに合わせた
        # きめ細かい制御が可能になります。
        #
        # ApprovalRules内のApproveAfterDays:
        #   パッチがリリースされてから自動承認されるまでの日数。
        #   この待機期間により、パッチの安定性が確認された後に適用できます。
        #   ゼロデイ脆弱性対応時は、手動承認で即時適用を判断します。
        linux_patch_baseline = ssm.CfnPatchBaseline(
            self,
            "AmazonLinux2PatchBaseline",
            name="CustomAmazonLinux2Baseline",
            description="Custom patch baseline for Amazon Linux 2 - auto-approve critical and important patches after 7 days",
            operating_system="AMAZON_LINUX_2",
            # 承認ルール：重要度別にパッチの自動承認を制御
            approval_rules=ssm.CfnPatchBaseline.RuleGroupProperty(
                patch_rules=[
                    # Critical（緊急）パッチ: 7日後に自動承認
                    # 緊急パッチはリモートコード実行などの深刻な脆弱性に対応するため、
                    # 可能な限り早く適用すべきですが、最低限の安定性確認期間は必要です
                    ssm.CfnPatchBaseline.RuleProperty(
                        patch_filter_group=ssm.CfnPatchBaseline.PatchFilterGroupProperty(
                            patch_filters=[
                                ssm.CfnPatchBaseline.PatchFilterProperty(
                                    key="CLASSIFICATION",
                                    values=["Security"],
                                ),
                                ssm.CfnPatchBaseline.PatchFilterProperty(
                                    key="SEVERITY",
                                    values=["Critical"],
                                ),
                            ]
                        ),
                        approve_after_days=7,
                        compliance_level="CRITICAL",
                    ),
                    # Important（重要）パッチ: 7日後に自動承認
                    # 権限昇格や情報漏洩に関する脆弱性が含まれます
                    ssm.CfnPatchBaseline.RuleProperty(
                        patch_filter_group=ssm.CfnPatchBaseline.PatchFilterGroupProperty(
                            patch_filters=[
                                ssm.CfnPatchBaseline.PatchFilterProperty(
                                    key="CLASSIFICATION",
                                    values=["Security"],
                                ),
                                ssm.CfnPatchBaseline.PatchFilterProperty(
                                    key="SEVERITY",
                                    values=["Important"],
                                ),
                            ]
                        ),
                        approve_after_days=7,
                        compliance_level="HIGH",
                    ),
                    # Medium/Low（中・低）パッチ: 14日後に自動承認
                    # 緊急性は低いが、累積的なリスクを防ぐために定期適用が必要
                    ssm.CfnPatchBaseline.RuleProperty(
                        patch_filter_group=ssm.CfnPatchBaseline.PatchFilterGroupProperty(
                            patch_filters=[
                                ssm.CfnPatchBaseline.PatchFilterProperty(
                                    key="CLASSIFICATION",
                                    values=["Security", "Bugfix"],
                                ),
                                ssm.CfnPatchBaseline.PatchFilterProperty(
                                    key="SEVERITY",
                                    values=["Medium", "Low"],
                                ),
                            ]
                        ),
                        approve_after_days=14,
                        compliance_level="MEDIUM",
                    ),
                ]
            ),
            # 拒否パッチリスト：既知の問題を引き起こすパッチをブロック
            # 例：特定のカーネルアップデートがアプリケーションと非互換の場合
            # 実運用では、セキュリティチームの検証結果に基づいて更新します
            rejected_patches=["CVE-2099-99999"],
            rejected_patches_action="BLOCK",
            # タグでパッチベースラインを識別
            tags=[
                cdk.CfnTag(key="Environment", value="production"),
                cdk.CfnTag(key="OS", value="AmazonLinux2"),
            ],
        )

        # ====================================================================
        # パッチベースライン: Windows Server 用
        # ====================================================================
        # WindowsのパッチはKB（Knowledge Base）番号で管理されます。
        # 特定のKBが業務アプリケーションと非互換であることが判明した場合、
        # rejected_patchesリストに追加してブロックします。
        windows_patch_baseline = ssm.CfnPatchBaseline(
            self,
            "WindowsPatchBaseline",
            name="CustomWindowsBaseline",
            description="Custom patch baseline for Windows Server - auto-approve critical and important patches after 7 days",
            operating_system="WINDOWS",
            approval_rules=ssm.CfnPatchBaseline.RuleGroupProperty(
                patch_rules=[
                    # CriticalUpdates（緊急更新）: 7日後に自動承認
                    ssm.CfnPatchBaseline.RuleProperty(
                        patch_filter_group=ssm.CfnPatchBaseline.PatchFilterGroupProperty(
                            patch_filters=[
                                ssm.CfnPatchBaseline.PatchFilterProperty(
                                    key="CLASSIFICATION",
                                    values=["CriticalUpdates", "SecurityUpdates"],
                                ),
                                ssm.CfnPatchBaseline.PatchFilterProperty(
                                    key="MSRC_SEVERITY",
                                    values=["Critical"],
                                ),
                            ]
                        ),
                        approve_after_days=7,
                        compliance_level="CRITICAL",
                    ),
                    # Important（重要）: 7日後に自動承認
                    ssm.CfnPatchBaseline.RuleProperty(
                        patch_filter_group=ssm.CfnPatchBaseline.PatchFilterGroupProperty(
                            patch_filters=[
                                ssm.CfnPatchBaseline.PatchFilterProperty(
                                    key="CLASSIFICATION",
                                    values=["CriticalUpdates", "SecurityUpdates"],
                                ),
                                ssm.CfnPatchBaseline.PatchFilterProperty(
                                    key="MSRC_SEVERITY",
                                    values=["Important"],
                                ),
                            ]
                        ),
                        approve_after_days=7,
                        compliance_level="HIGH",
                    ),
                ]
            ),
            # 既知の問題を引き起こすWindows KB番号をブロック
            # 例: KB5001234が特定の.NETアプリケーションをクラッシュさせる場合
            rejected_patches=["KB5001234"],
            rejected_patches_action="BLOCK",
            tags=[
                cdk.CfnTag(key="Environment", value="production"),
                cdk.CfnTag(key="OS", value="Windows"),
            ],
        )

        # ====================================================================
        # メンテナンスウィンドウ: パッチ適用のスケジュール枠
        # ====================================================================
        # メンテナンスウィンドウは「計画的な変更作業の時間枠」を定義します。
        #
        # スケジュール設計の考慮点：
        # - 土曜日02:00 UTCは、多くのリージョンで深夜〜早朝に該当
        # - Duration 3時間: パッチダウンロード、インストール、再起動に十分な時間
        # - Cutoff 1時間: 期間終了の1時間前に新規タスクの開始を停止
        #   → 実行中のタスクが時間切れで中断されるリスクを軽減
        #
        # cron式の形式: cron(分 時 日 月 曜日 年)
        # 「毎週土曜日 02:00 UTC」= cron(0 2 ? * SAT *)
        maintenance_window = ssm.CfnMaintenanceWindow(
            self,
            "PatchMaintenanceWindow",
            name="ProductionPatchWindow",
            description="Weekly maintenance window for production patch deployment - every Saturday at 02:00 UTC",
            # 毎週土曜日の02:00 UTC
            schedule="cron(0 2 ? * SAT *)",
            # メンテナンスウィンドウの期間（時間単位）
            # パッチのダウンロード、インストール、再起動を考慮して十分な時間を確保
            duration=3,
            # カットオフ時間（時間単位）
            # ウィンドウ終了の1時間前に新規タスク開始を停止
            # これにより、実行中のタスクが完了するための時間を確保
            cutoff=1,
            # メンテナンスウィンドウを有効にする
            allow_unassociated_targets=False,
            tags=[
                cdk.CfnTag(key="Environment", value="production"),
                cdk.CfnTag(key="Purpose", value="patching"),
            ],
        )

        # ====================================================================
        # メンテナンスウィンドウターゲット: パッチ適用の対象インスタンス
        # ====================================================================
        # PatchGroupタグを使ってターゲットを定義します。
        # PatchGroup=production タグが付いたインスタンスが対象になります。
        #
        # パッチグループによる段階的展開戦略：
        # 1. PatchGroup=dev      → 開発環境で先行適用（水曜日）
        # 2. PatchGroup=staging  → ステージングで検証（木曜日）
        # 3. PatchGroup=production → 本番に展開（土曜日）
        # この段階的アプローチにより、本番適用前に問題を検出できます
        maintenance_window_target = ssm.CfnMaintenanceWindowTarget(
            self,
            "PatchMaintenanceWindowTarget",
            window_id=maintenance_window.ref,
            resource_type="INSTANCE",
            # PatchGroupタグでターゲットインスタンスをフィルタリング
            targets=[
                ssm.CfnMaintenanceWindowTarget.TargetsProperty(
                    key="tag:PatchGroup",
                    values=["production"],
                )
            ],
            name="ProductionInstances",
            description="Target production instances for patch deployment",
        )

        # ====================================================================
        # メンテナンスウィンドウタスク: AWS-RunPatchBaseline の実行
        # ====================================================================
        # AWS-RunPatchBaselineは、AWSが提供するマネージドドキュメントで、
        # パッチベースラインに基づいてパッチのスキャンまたはインストールを行います。
        #
        # Operation パラメータ:
        # - "Scan": パッチの欠落状態をチェックするだけ（変更なし）
        #   → コンプライアンスレポートの生成に使用
        #   → 業務時間中でも安全に実行可能
        #
        # - "Install": 実際にパッチをインストールする
        #   → 再起動が必要になることがある
        #   → メンテナンスウィンドウ内で実行すべき
        #
        # RebootOption パラメータ:
        # - "RebootIfNeeded": パッチが再起動を要求する場合のみ再起動
        # - "NoReboot": 再起動しない（パッチは適用されるが、次回再起動まで有効にならないものがある）
        maintenance_window_task = ssm.CfnMaintenanceWindowTask(
            self,
            "PatchMaintenanceWindowTask",
            window_id=maintenance_window.ref,
            task_arn="AWS-RunPatchBaseline",
            task_type="RUN_COMMAND",
            # ターゲットをメンテナンスウィンドウターゲットに紐づけ
            targets=[
                ssm.CfnMaintenanceWindowTask.TargetProperty(
                    key="WindowTargetIds",
                    values=[maintenance_window_target.ref],
                )
            ],
            # タスクの実行パラメータ
            task_invocation_parameters=ssm.CfnMaintenanceWindowTask.TaskInvocationParametersProperty(
                maintenance_window_run_command_parameters=ssm.CfnMaintenanceWindowTask.MaintenanceWindowRunCommandParametersProperty(
                    parameters={
                        # Install操作: 実際にパッチを適用する
                        "Operation": ["Install"],
                        # 必要に応じて再起動する
                        # 本番環境では、再起動前にヘルスチェックやドレインを
                        # 行うスクリプトを追加することを推奨
                        "RebootOption": ["RebootIfNeeded"],
                    },
                    # タスク実行のタイムアウト（秒）
                    # パッチ数が多い場合に備えて十分な時間を設定
                    timeout_seconds=3600,
                )
            ),
            # タスクの優先度（数値が小さいほど優先度が高い）
            priority=1,
            # 同時実行数の制御
            # 一度にパッチ適用するインスタンス数を制限し、
            # サービス全体が同時にダウンするリスクを回避
            max_concurrency="25%",
            # エラー許容率
            # この割合以上のインスタンスでエラーが発生したらタスクを停止
            # 異常なパッチによる大規模障害を防止
            max_errors="25%",
            name="RunPatchBaseline",
        )

        # ====================================================================
        # CfnOutputs: スタック出力
        # ====================================================================
        CfnOutput(
            self,
            "LinuxPatchBaselineId",
            value=linux_patch_baseline.ref,
            description="Custom patch baseline ID for Amazon Linux 2",
            export_name="SSMLinuxPatchBaselineId",
        )

        CfnOutput(
            self,
            "WindowsPatchBaselineId",
            value=windows_patch_baseline.ref,
            description="Custom patch baseline ID for Windows Server",
            export_name="SSMWindowsPatchBaselineId",
        )

        CfnOutput(
            self,
            "MaintenanceWindowId",
            value=maintenance_window.ref,
            description="Maintenance window ID for production patching",
            export_name="SSMMaintenanceWindowId",
        )

        CfnOutput(
            self,
            "MaintenanceWindowTaskId",
            value=maintenance_window_task.ref,
            description="Maintenance window task ID for patch installation",
            export_name="SSMMaintenanceWindowTaskId",
        )
