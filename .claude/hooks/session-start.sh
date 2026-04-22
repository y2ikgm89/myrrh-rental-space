#!/usr/bin/env bash
# SessionStart hook: 進行中の計画ファイルを表示する。
# source が "compact" のときは、圧縮で失われた git state を追加注入する。
#
# 公式仕様（code.claude.com/docs/en/hooks-guide#re-inject-context-after-compaction）:
#   SessionStart の source 分岐で compact 時の state 再注入を行うのが推奨パターン。
#   stdout は Claude のコンテキストに直接流れる（exit 0 必須）。

set -euo pipefail

PLANS_DIR="$CLAUDE_PROJECT_DIR/docs/plans"

INPUT=$(cat 2>/dev/null || echo '{}')
SOURCE=$(printf '%s' "$INPUT" | jq -r '.source // "startup"' 2>/dev/null || echo "startup")

# --- 共通: 進行中の計画 ---
echo '=== 進行中の計画 ==='
if ! grep -rlE '^\*\*ステータス\*\*: *(実装中|設計承認済み)' "$PLANS_DIR" 2>/dev/null \
    | grep -vE '(README|CLAUDE)' \
    | head -5; then
  echo '(なし)'
fi

# --- compact 専用: 圧縮後の state 再注入 ---
if [ "$SOURCE" = "compact" ]; then
  cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
  git rev-parse --git-dir >/dev/null 2>&1 || exit 0

  echo ''
  echo '=== 圧縮後の state 再注入 ==='

  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')
  echo "Branch: ${BRANCH}"

  echo 'Recent commits:'
  git log --oneline -5 2>/dev/null | sed 's/^/  /' || true

  UNCOMMITTED=$(git status --short 2>/dev/null | wc -l | tr -d ' ' || echo '0')
  echo "Uncommitted changes: ${UNCOMMITTED} file(s)"

  if [ "${UNCOMMITTED:-0}" -gt 0 ] && [ "${UNCOMMITTED:-0}" -le 10 ]; then
    echo 'Changed files:'
    git status --short 2>/dev/null | sed 's/^/  /' | head -10 || true
  fi
fi

exit 0
