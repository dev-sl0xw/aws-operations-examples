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

【왜 자동 패치 적용이 보안 컴플라이언스에 불가결한가】

보안 취약점의 대부분은 알려진 문제에 대한 패치가 적용되지 않은 것에 기인합니다.
2017년의 Equifax 대규모 데이터 유출은 Apache Struts의 알려진 취약점에 패치를
적용하지 않았던 것이 원인이었습니다.

수동 패치 적용의 과제:
- 수백 대의 인스턴스에 수동으로 패치를 적용하는 것은 비현실적
- 인적 실수(적용 누락, 순서 오류)가 발생하기 쉬움
- 감사 증적 관리가 곤란
- 패치 적용 타이밍이 불균일

SSM Patch Manager는 이러한 과제를 다음과 같이 해결합니다:
- 패치 베이스라인으로 "무엇을 적용할지"를 정의
- Maintenance Window로 "언제 적용할지"를 제어
- 패치 그룹으로 "어떤 인스턴스에 적용할지"를 관리
- 모든 조작이 자동으로 감사 증적으로 기록

【Maintenance Window의 개념】

Maintenance Window는 "계획적인 변경 작업의 시간 프레임"을 정의하는 구조입니다.
왜 필요한가:
- 패치 적용에는 인스턴스의 재시작이 수반될 수 있음
- 업무 시간 중의 재시작은 서비스 영향을 일으킴
- 변경 관리 프로세스(ITIL 등)와의 정합성이 요구됨
- 문제 발생 시의 롤백 시간을 확보할 필요가 있음

Maintenance Window의 구성 요소:
1. Schedule (스케줄): 언제 실행할지
2. Duration (기간): 최대 몇 시간 소요할지
3. Cutoff (컷오프): 기간 종료 몇 시간 전에 신규 태스크 시작을 중지할지
4. Target (타겟): 어떤 인스턴스가 대상인지
5. Task (태스크): 무엇을 실행할지

【패치 베이스라인의 승인 규칙과 보안에의 영향】

패치 베이스라인은 "어떤 패치를 자동 승인할지"의 규칙 세트입니다.

승인 규칙의 설계 지침:
- Critical/Important: 가능한 빨리 적용 (7일 이내를 권장)
- Medium/Low: 비즈니스 리스크에 따라 14~30일
- 자동 승인의 대기 기간은 패치의 안정성을 확인하기 위한 버퍼
  (제로데이 대응 시에는 이 대기 기간을 단축하는 판단이 필요)

거부 패치:
- 알려진 문제를 일으키는 패치 (예: 특정 KB가 애플리케이션과 비호환)
- 보안팀이 검증 중인 패치
- 업무 애플리케이션에 영향을 미치는 패치

【Scan과 Install의 차이】

Scan (스캔) 조작:
- 인스턴스에 누락된 패치를 감지하는 것만
- 아무것도 설치하지 않고, 재시작하지 않음
- 컴플라이언스 리포트 생성에 사용
- 업무 시간 중에도 안전하게 실행 가능

Install (인스톨) 조작:
- 실제로 패치를 다운로드하여 설치
- 재시작이 필요할 수 있음
- Maintenance Window 내에서 실행해야 함
- 롤백 계획을 준비해 두어야 함

권장 패턴: 매일 Scan을 실행하여 컴플라이언스 상태를 파악하고,
주간 Maintenance Window에서 Install을 실행.
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
        # ====================================================================
        # 패치 베이스라인: Amazon Linux 2 용
        # ====================================================================
        # 패치 베이스라인은 "어떤 패치를 승인할지"의 규칙 세트입니다.
        # AWS는 OS별로 기본 베이스라인을 제공하고 있지만,
        # 커스텀 베이스라인을 생성함으로써, 조직의 정책에 맞춘
        # 세밀한 제어가 가능해집니다.
        #
        # ApprovalRules 내의 ApproveAfterDays:
        #   패치가 릴리스된 후 자동 승인될 때까지의 일수.
        #   이 대기 기간에 의해 패치의 안정성이 확인된 후에 적용할 수 있습니다.
        #   제로데이 취약점 대응 시에는, 수동 승인으로 즉시 적용을 판단합니다.
        linux_patch_baseline = ssm.CfnPatchBaseline(
            self,
            "AmazonLinux2PatchBaseline",
            name="CustomAmazonLinux2Baseline",
            description="Custom patch baseline for Amazon Linux 2 - auto-approve critical and important patches after 7 days",
            operating_system="AMAZON_LINUX_2",
            # 承認ルール：重要度別にパッチの自動承認を制御
            # 승인 규칙: 중요도별로 패치의 자동 승인을 제어
            approval_rules=ssm.CfnPatchBaseline.RuleGroupProperty(
                patch_rules=[
                    # Critical（緊急）パッチ: 7日後に自動承認
                    # 緊急パッチはリモートコード実行などの深刻な脆弱性に対応するため、
                    # 可能な限り早く適用すべきですが、最低限の安定性確認期間は必要です
                    # Critical (긴급) 패치: 7일 후 자동 승인
                    # 긴급 패치는 원격 코드 실행 등의 심각한 취약점에 대응하므로,
                    # 가능한 빨리 적용해야 하지만, 최소한의 안정성 확인 기간은 필요합니다
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
                    # Important (중요) 패치: 7일 후 자동 승인
                    # 권한 상승이나 정보 유출에 관한 취약점이 포함됩니다
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
                    # Medium/Low (중·저) 패치: 14일 후 자동 승인
                    # 긴급성은 낮지만, 누적적인 리스크를 방지하기 위해 정기 적용이 필요
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
            # 거부 패치 리스트: 알려진 문제를 일으키는 패치를 차단
            # 예: 특정 커널 업데이트가 애플리케이션과 비호환인 경우
            # 실운용에서는 보안팀의 검증 결과에 기반하여 갱신합니다
            rejected_patches=["CVE-2099-99999"],
            rejected_patches_action="BLOCK",
            # タグでパッチベースラインを識別
            # 태그로 패치 베이스라인을 식별
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
        # ====================================================================
        # 패치 베이스라인: Windows Server 용
        # ====================================================================
        # Windows의 패치는 KB (Knowledge Base) 번호로 관리됩니다.
        # 특정 KB가 업무 애플리케이션과 비호환인 것이 판명된 경우,
        # rejected_patches 리스트에 추가하여 차단합니다.
        windows_patch_baseline = ssm.CfnPatchBaseline(
            self,
            "WindowsPatchBaseline",
            name="CustomWindowsBaseline",
            description="Custom patch baseline for Windows Server - auto-approve critical and important patches after 7 days",
            operating_system="WINDOWS",
            approval_rules=ssm.CfnPatchBaseline.RuleGroupProperty(
                patch_rules=[
                    # CriticalUpdates（緊急更新）: 7日後に自動承認
                    # CriticalUpdates (긴급 업데이트): 7일 후 자동 승인
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
                    # Important (중요): 7일 후 자동 승인
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
            # 알려진 문제를 일으키는 Windows KB 번호를 차단
            # 예: KB5001234가 특정 .NET 애플리케이션을 크래시시키는 경우
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
        # ====================================================================
        # Maintenance Window: 패치 적용의 스케줄 프레임
        # ====================================================================
        # Maintenance Window는 "계획적인 변경 작업의 시간 프레임"을 정의합니다.
        #
        # 스케줄 설계의 고려점:
        # - 토요일 02:00 UTC는 많은 리전에서 심야~이른 아침에 해당
        # - Duration 3시간: 패치 다운로드, 설치, 재시작에 충분한 시간
        # - Cutoff 1시간: 기간 종료 1시간 전에 신규 태스크 시작을 중지
        #   → 실행 중인 태스크가 시간 초과로 중단되는 리스크를 경감
        #
        # cron식의 형식: cron(분 시 일 월 요일 년)
        # "매주 토요일 02:00 UTC" = cron(0 2 ? * SAT *)
        maintenance_window = ssm.CfnMaintenanceWindow(
            self,
            "PatchMaintenanceWindow",
            name="ProductionPatchWindow",
            description="Weekly maintenance window for production patch deployment - every Saturday at 02:00 UTC",
            # 毎週土曜日の02:00 UTC
            # 매주 토요일 02:00 UTC
            schedule="cron(0 2 ? * SAT *)",
            # メンテナンスウィンドウの期間（時間単位）
            # パッチのダウンロード、インストール、再起動を考慮して十分な時間を確保
            # Maintenance Window의 기간 (시간 단위)
            # 패치의 다운로드, 설치, 재시작을 고려하여 충분한 시간을 확보
            duration=3,
            # カットオフ時間（時間単位）
            # ウィンドウ終了の1時間前に新規タスク開始を停止
            # これにより、実行中のタスクが完了するための時間を確保
            # 컷오프 시간 (시간 단위)
            # 윈도우 종료 1시간 전에 신규 태스크 시작을 중지
            # 이에 의해 실행 중인 태스크가 완료될 시간을 확보
            cutoff=1,
            # メンテナンスウィンドウを有効にする
            # Maintenance Window를 유효화
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
        # ====================================================================
        # Maintenance Window Target: 패치 적용 대상 인스턴스
        # ====================================================================
        # PatchGroup 태그를 사용하여 타겟을 정의합니다.
        # PatchGroup=production 태그가 부여된 인스턴스가 대상이 됩니다.
        #
        # 패치 그룹에 의한 단계적 전개 전략:
        # 1. PatchGroup=dev      → 개발 환경에서 선행 적용 (수요일)
        # 2. PatchGroup=staging  → 스테이징에서 검증 (목요일)
        # 3. PatchGroup=production → 본번에 전개 (토요일)
        # 이 단계적 접근에 의해 본번 적용 전에 문제를 감지할 수 있습니다
        maintenance_window_target = ssm.CfnMaintenanceWindowTarget(
            self,
            "PatchMaintenanceWindowTarget",
            window_id=maintenance_window.ref,
            resource_type="INSTANCE",
            # PatchGroupタグでターゲットインスタンスをフィルタリング
            # PatchGroup 태그로 타겟 인스턴스를 필터링
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
        # ====================================================================
        # Maintenance Window Task: AWS-RunPatchBaseline 실행
        # ====================================================================
        # AWS-RunPatchBaseline은 AWS가 제공하는 매니지드 문서로,
        # 패치 베이스라인에 기반하여 패치의 스캔 또는 설치를 수행합니다.
        #
        # Operation 파라미터:
        # - "Scan": 패치의 누락 상태를 체크하는 것만 (변경 없음)
        #   → 컴플라이언스 리포트 생성에 사용
        #   → 업무 시간 중에도 안전하게 실행 가능
        #
        # - "Install": 실제로 패치를 설치
        #   → 재시작이 필요할 수 있음
        #   → Maintenance Window 내에서 실행해야 함
        #
        # RebootOption 파라미터:
        # - "RebootIfNeeded": 패치가 재시작을 요구하는 경우에만 재시작
        # - "NoReboot": 재시작하지 않음 (패치는 적용되지만, 다음 재시작까지 유효하지 않는 것이 있음)
        maintenance_window_task = ssm.CfnMaintenanceWindowTask(
            self,
            "PatchMaintenanceWindowTask",
            window_id=maintenance_window.ref,
            task_arn="AWS-RunPatchBaseline",
            task_type="RUN_COMMAND",
            # ターゲットをメンテナンスウィンドウターゲットに紐づけ
            # 타겟을 Maintenance Window Target에 연결
            targets=[
                ssm.CfnMaintenanceWindowTask.TargetProperty(
                    key="WindowTargetIds",
                    values=[maintenance_window_target.ref],
                )
            ],
            # タスクの実行パラメータ
            # 태스크의 실행 파라미터
            task_invocation_parameters=ssm.CfnMaintenanceWindowTask.TaskInvocationParametersProperty(
                maintenance_window_run_command_parameters=ssm.CfnMaintenanceWindowTask.MaintenanceWindowRunCommandParametersProperty(
                    parameters={
                        # Install操作: 実際にパッチを適用する
                        # Install 조작: 실제로 패치를 적용
                        "Operation": ["Install"],
                        # 必要に応じて再起動する
                        # 本番環境では、再起動前にヘルスチェックやドレインを
                        # 行うスクリプトを追加することを推奨
                        # 필요에 따라 재시작
                        # 운영 환경에서는 재시작 전에 헬스 체크나 드레인을
                        # 수행하는 스크립트를 추가할 것을 권장
                        "RebootOption": ["RebootIfNeeded"],
                    },
                    # タスク実行のタイムアウト（秒）
                    # パッチ数が多い場合に備えて十分な時間を設定
                    # 태스크 실행의 타임아웃 (초)
                    # 패치 수가 많은 경우를 대비하여 충분한 시간을 설정
                    timeout_seconds=3600,
                )
            ),
            # タスクの優先度（数値が小さいほど優先度が高い）
            # 태스크의 우선도 (수치가 작을수록 우선도가 높음)
            priority=1,
            # 同時実行数の制御
            # 一度にパッチ適用するインスタンス数を制限し、
            # サービス全体が同時にダウンするリスクを回避
            # 동시 실행 수의 제어
            # 한 번에 패치 적용하는 인스턴스 수를 제한하여,
            # 서비스 전체가 동시에 다운되는 리스크를 회피
            max_concurrency="25%",
            # エラー許容率
            # この割合以上のインスタンスでエラーが発生したらタスクを停止
            # 異常なパッチによる大規模障害を防止
            # 에러 허용률
            # 이 비율 이상의 인스턴스에서 에러가 발생하면 태스크를 중지
            # 이상한 패치에 의한 대규모 장애를 방지
            max_errors="25%",
            name="RunPatchBaseline",
        )

        # ====================================================================
        # CfnOutputs: スタック出力
        # ====================================================================
        # CfnOutputs: Stack 출력
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
