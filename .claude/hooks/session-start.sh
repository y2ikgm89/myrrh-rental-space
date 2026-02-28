#!/usr/bin/env bash
# SessionStart hook: 進行中の計画ファイルを表示する
# docs/plans/ 内で「実装中」または「設計承認済み」を含むファイルを一覧表示

set -euo pipefail

PLANS_DIR="$CLAUDE_PROJECT_DIR/docs/plans"

echo '=== 進行中の計画 ==='

# `if` 条件式内は set -e 対象外 → grep 不一致でスクリプトが無音終了しない
if ! grep -rlE '実装中|設計承認済み' "$PLANS_DIR" 2>/dev/null \
    | grep -vE '(README|CLAUDE)' \
    | head -5; then
  echo '(なし)'
fi
