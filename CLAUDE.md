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

## Commands
- Build TS project: `cd cdk-projects/<project> && npm run build`
- Test TS project: `cd cdk-projects/<project> && npm test`
- Test Python project: `cd cdk-projects/<project> && python -m pytest tests/`
- Synth any project: `cd cdk-projects/<project> && npx cdk synth` (TS) or `cdk synth` (Python)

## Important Notes
- Never deploy (`cdk deploy`) without explicit user confirmation - this is a learning project
- Python projects need `source .venv/bin/activate` before running commands
- `.gitignore` excludes `node_modules/`, `.venv/`, `cdk.out/`, `*.js` (TS compiled)

### Project Setup Status
- TS 01 (iam-org-governance): `npm install` required before first use
- TS 03 (monitoring): `npm install` already done, node_modules present
- TS 04 (networking): `npm install` already done, node_modules present
- Python 02, 05, 06: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt` required before first use

## Agent Patterns
- Prefer Task tool subagents (`run_in_background: true`) over experimental agent teams for parallel work
- Use `.claude/agents/cdk-reviewer.md` for CDK code review
- Use `.claude/agents/study-note-reviewer.md` for study note quality checks
- When subagents fail mid-execution, check filesystem for partial output before re-running

## Available Skills
- `/cdk-synth-check` - Run synth + tests on all 6 CDK projects
- `/add-study-section <topic>` - Generate new study note from template

## Language Guidelines
- Study notes: 日本語 (technical terms in English)
- CDK code comments: English
- User communication: Korean/Japanese/English (user preference)
