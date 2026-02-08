# AWS Operations Examples

## Project Overview
AWS SAA レベルの知識を基盤に、Well-Architected Framework 6つの柱をベースとしたバックオフィス支援・Operations業務のための学習プロジェクト。

## Architecture
```
study-book/          # 12 Markdown 学習ノート (ソクラテス式 + 現実比喩)
cdk-projects/        # 6 AWS CDK ハンズオン
  01-iam-org-governance/      # TypeScript - IAM, Orgs, Config
  02-ssm-operations/           # Python - SSM, Patch, Parameter Store
  03-monitoring-observability/ # TypeScript - CloudWatch, EventBridge, X-Ray
  04-networking-loadbalancing/ # TypeScript - VPC, ALB/NLB, Route53, AutoScaling
  05-security-edge/            # Python - CloudTrail, GuardDuty, WAF, CloudFront
  06-storage-backup/           # Python - S3, EBS, AWS Backup
diagrams/            # 4 Mermaid アーキテクチャ図
scripts/             # セットアップヘルパー
```

## Tech Stack
- **TypeScript CDK**: aws-cdk v2.100+, Jest for testing
- **Python CDK**: aws-cdk-lib v2.100+, pytest for testing
- **Diagrams**: Mermaid (.mmd)

## Conventions

### Study Notes Format
- Location: `study-book/YYYY-MM-DD-SectionName.md`
- Style: ソクラテス式 Q&A + 現実世界の比喩 (非IT向け)
- Must include: 概要, キーコンセプト, アーキテクチャパターン, SAA試験のポイント, Well-Architected チェックリスト

### CDK Project Conventions
- TypeScript projects: `npm run build && npx cdk synth` for validation
- Python projects: `pip install -r requirements.txt && cdk synth` for validation
- All stacks must include proper tagging: Environment, Project, ManagedBy
- Use setup scripts: `./scripts/setup-ts-project.sh` or `./scripts/setup-py-project.sh`

### Testing
- TypeScript: `npm test` (Jest + ts-jest)
- Python: `python -m pytest tests/`
- All CDK stacks must have corresponding test assertions
- CDK renders logical IDs as `{ Ref: ... }` — use `Match.anyValue()` for dynamic references in assertions
- When asserting S3 encryption, check actual algorithm: `S3_MANAGED` → `AES256`, `KMS_MANAGED` → `aws:kms`

## Commands
- Build TS project: `cd cdk-projects/<project> && npm run build`
- Test TS project: `cd cdk-projects/<project> && npm test`
- Test Python project: `cd cdk-projects/<project> && python -m pytest tests/`
- Synth TS project: `cd cdk-projects/<project> && npx cdk synth`
- Synth Python project: `cd cdk-projects/<project> && npx cdk synth --app ".venv/bin/python3 app.py"`
- Test all TS projects: `for p in 01-iam-org-governance 03-monitoring-observability 04-networking-loadbalancing; do (cd cdk-projects/$p && npm test); done`
- Test all Python projects: `for p in 02-ssm-operations 05-security-edge 06-storage-backup; do (cd cdk-projects/$p && .venv/bin/python3 -m pytest tests/); done`

## Important Notes
- Never deploy (`cdk deploy`) without explicit user confirmation - this is a learning project
- Python projects need `source .venv/bin/activate` before running commands
- `.gitignore` excludes `node_modules/`, `.venv/`, `cdk.out/`, `*.js` (TS compiled)

## Quick Start
```bash
# TypeScript プロジェクト (01, 03, 04)
./scripts/setup-ts-project.sh cdk-projects/01-iam-org-governance

# Python プロジェクト (02, 05, 06)
./scripts/setup-py-project.sh cdk-projects/02-ssm-operations
```
After cloning, all projects need setup - `node_modules/` and `.venv/` are gitignored.

## Hooks (auto-configured in .claude/settings.json)
- **PostToolUse**: TS ファイル (lib/, bin/) 編集後に `tsc --noEmit` を自動実行
- **PreToolUse**: `.env`, `credentials`, `secret` を含むファイルの編集をブロック

## Gotchas
- `.gitignore` excludes `*.js` (TypeScript compiled output) - add `!filename.js` for intentional JS files
- Python CDK projects require `source .venv/bin/activate` before ANY cdk/pytest command
- `cdk.context.json` is gitignored - AZ lookups will re-run on fresh clones
- Python `cdk synth` ignores venv activation — use `--app ".venv/bin/python3 app.py"` to ensure correct interpreter
- Python venv pip install: `source .venv/bin/activate && pip install` may install to global — prefer `.venv/bin/pip install -r requirements.txt`
- Python CDK L1 constructs (CfnXxx): property names differ from CloudFormation — always verify with `context7` or CDK API docs

## Agent Patterns
- Prefer Task tool subagents (`run_in_background: true`) over experimental agent teams for parallel work
- Use `.claude/agents/cdk-reviewer.md` for CDK code review
- Use `.claude/agents/study-note-reviewer.md` for study note quality checks
- When subagents fail mid-execution, check filesystem for partial output before re-running

## Available Skills
- `/cdk-synth-check` - Run synth + tests on all 6 CDK projects
- `/add-study-section <topic>` - Generate new study note from template

## Security Conventions
- Security Groups: reference other SGs instead of `Peer.anyIpv4()` where possible
- EC2/ASG: always set `requireImdsv2: true` and use token-based metadata in UserData
- IAM policies: scope ECR/S3/KMS actions to specific resources — split wildcard-required actions (e.g., `ecr:GetAuthorizationToken`) from resource-scoped ones
- RemovalPolicy.DESTROY on audit/security resources: add `⚠️ WARNING` comment, recommend RETAIN for production
- All stacks: verify Environment, Project, ManagedBy tags in app entry point

## Language Guidelines
- Study notes: 日本語 (technical terms in English)
- CDK code comments: English
- User communication: Korean/Japanese/English (user preference)
