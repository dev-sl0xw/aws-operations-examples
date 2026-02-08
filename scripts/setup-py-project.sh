#!/bin/bash
# Python CDK プロジェクト セットアップスクリプト
# Usage: ./scripts/setup-py-project.sh <project-directory>

set -euo pipefail

PROJECT_DIR="${1:?Usage: $0 <project-directory>}"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Error: Directory $PROJECT_DIR does not exist"
  exit 1
fi

cd "$PROJECT_DIR"

echo "=== Creating virtual environment for $(basename $PROJECT_DIR) ==="
python3 -m venv .venv
source .venv/bin/activate

echo "=== Installing dependencies ==="
pip install -r requirements.txt

echo "=== Running CDK synth ==="
cdk synth --quiet

echo "=== Running tests ==="
python -m pytest tests/

echo "=== Setup complete for $(basename $PROJECT_DIR) ==="
