#!/usr/bin/env bash
# PostToolUse (Bash) hook: prisma migrate dev 成功後に自動で db:generate を実行
# worktree マージ後の generate 忘れ防止

set -euo pipefail

INPUT=$(cat)
STDOUT=$(printf '%s' "$INPUT" | jq -r '.stdout // empty' 2>/dev/null || echo "")

[ -z "$STDOUT" ] && exit 0

# prisma migrate dev の成功パターンを検出
if echo "$STDOUT" | grep -qE 'Your database is now in sync|migrations applied|Already in sync'; then
  cd "$CLAUDE_PROJECT_DIR"
  if bun run db:generate > /dev/null 2>&1; then
    echo "✅ prisma generate 自動実行完了（migrate 後）"
  else
    echo "⚠️ prisma generate 失敗。schema.prisma を確認してください。"
  fi
fi

exit 0
