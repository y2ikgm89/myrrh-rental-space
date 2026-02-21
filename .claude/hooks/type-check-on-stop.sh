#!/bin/bash
# Stop hook: TypeScript ファイルが変更された時のみ型チェックを実行
# 未コミット変更（staged + unstaged）を確認

set -euo pipefail

cd "$CLAUDE_PROJECT_DIR" || exit 0

# `if` 条件式内は set -e の対象外（Bash 仕様）なので grep -q が安全に使える
if ! git diff --name-only HEAD 2>/dev/null | grep -qE '\.(ts|tsx)$'; then
  exit 0
fi

echo ""
echo "📝 TypeScript ファイルが変更されました。型チェックを実行します..."
echo ""

# ~/.bun/bin を PATH に追加（Stop hook は環境変数が限定的）
export PATH="$HOME/.bun/bin:$PATH"

bun run type-check
