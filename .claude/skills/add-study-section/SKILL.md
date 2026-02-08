---
name: add-study-section
description: Add a new study section following the project's Socratic method template
disable-model-invocation: true
---

# Add Study Section

Create a new study note following the project's established format.

## Arguments
- `$ARGUMENTS` should contain the section topic (e.g., "Lambda & Serverless", "RDS & Aurora")

## Template

Create the file in `study-book/` with naming: `YYYY-MM-DD-TopicName.md`

Follow this structure:
```markdown
# セクションタイトル
> Well-Architected Pillar: [柱の名前]
> Day: [X] | 難易度: [基礎|中級|上級]

## 概要
[2-3段落のサマリー]

## キーコンセプト

### コンセプト名
**定義:** [技術的な定義]

**ソクラテス式 深堀り:**
> Q: 「〇〇とは何か？なぜ必要なのか？」
> A: [第一原理からの段階的説明]

**現実世界のたとえ (非IT向け):**
> [日常生活の比喩で説明]

## アーキテクチャパターン
## SAA試験のポイント
## ハンズオン参照
## Well-Architected チェックリスト
```

## Instructions
1. Use context7 MCP to look up latest AWS documentation for the topic
2. Write in Japanese (日本語) matching existing study notes style
3. Include at least 4 key concepts with Socratic Q&A and real-world analogies
4. Reference related CDK projects if applicable
5. Update README.md learning path section to include the new section
