---
name: cdk-synth-check
description: Run CDK synth on all projects to verify they compile and synthesize correctly
disable-model-invocation: true
---

# CDK Synth Check

Run `cdk synth` on all 6 CDK projects to verify they compile and synthesize correctly.

## Steps

1. For each TypeScript project (01, 03, 04):
   - `cd cdk-projects/<project>`
   - `npm install` (if node_modules missing)
   - `npm run build`
   - `npx cdk synth --quiet`
   - `npm test`
   - Report pass/fail

2. For each Python project (02, 05, 06):
   - `cd cdk-projects/<project>`
   - Create venv if missing: `python3 -m venv .venv`
   - `source .venv/bin/activate`
   - `pip install -r requirements.txt`
   - `cdk synth --quiet`
   - `python -m pytest tests/`
   - Report pass/fail

3. Output a summary table of all results

## Important
- Do NOT run `cdk deploy` - synth only
- Report any compilation errors, test failures, or synth issues clearly
- If a project has missing dependencies, install them first
