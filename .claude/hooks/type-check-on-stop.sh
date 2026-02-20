#!/bin/bash
# Stop hook: TypeScript ファイルが変更された時のみ型チェックを実行
# 未コミット変更（staged + unstaged）を確認

set -euo pipefail

cd "$CLAUDE_PROJECT_DIR" || exit 0

# TypeScript ファイルの変更を確認（HEAD との差分）
changed=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|tsx)$' | head -1)

if [ -z "$changed" ]; then
  # 変更なし → スキップ
  exit 0
fi

echo ""
echo "📝 TypeScript ファイルが変更されました。型チェックを実行します..."
echo ""

# ~/.bun/bin を PATH に追加（Stop hook は環境変数が限定的）
export PATH="$HOME/.bun/bin:$PATH"

bun run type-check
