#!/usr/bin/env bash
# PostToolUse (Bash, if: Bash(bunx --bun prisma migrate *)) hook:
# prisma migrate dev 成功後に自動で db:generate を実行し、結果を additionalContext で返す。
#
# settings.json 側で if フィールド（v2.1.85+）により prisma migrate 系コマンドのみに絞り込むため、
# スクリプト側でコマンドパターン検査は省略。tool_response.stdout で migrate 成功を確認する。

set -euo pipefail
# 手動テスト時の fallback（hooks-patterns.md §Windows (MINGW64) 固有の注意）
: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

INPUT=$(cat)
STDOUT=$(printf '%s' "$INPUT" | jq -r '.tool_response.stdout // .stdout // empty' 2>/dev/null || echo "")

# migrate 成功パターン未検出なら何もしない（失敗時に generate しても意味がない）
if ! printf '%s' "$STDOUT" | grep -qE 'Your database is now in sync|migrations applied|Already in sync'; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

if bun run db:generate > /dev/null 2>&1; then
  CONTEXT="✅ prisma generate 自動実行完了（migrate 後）。新しい Prisma 型が使用可能です。"
else
  CONTEXT="⚠️ prisma migrate 成功後の prisma generate 失敗。schema.prisma を確認してください。"
fi

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $ctx
  }
}'

exit 0
