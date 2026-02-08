#!/bin/bash
# TypeScript CDK プロジェクト セットアップスクリプト
# Usage: ./scripts/setup-ts-project.sh <project-directory>

set -euo pipefail

PROJECT_DIR="${1:?Usage: $0 <project-directory>}"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Error: Directory $PROJECT_DIR does not exist"
  exit 1
fi

cd "$PROJECT_DIR"

echo "=== Installing dependencies for $(basename $PROJECT_DIR) ==="
npm install

echo "=== Building TypeScript ==="
npm run build

echo "=== Running CDK synth ==="
npx cdk synth --quiet

echo "=== Running tests ==="
npm test

echo "=== Setup complete for $(basename $PROJECT_DIR) ==="
