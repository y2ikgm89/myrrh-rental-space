#!/usr/bin/env bash
# PostToolUse (Edit|Write) hook: prisma/schema.prisma 編集時に db:generate を実行し
# マイグレーションコマンドのリマインダを additionalContext で注入する。
#
# 同期実行（async: false）: 後続の Edit/Bash で新しい Prisma 型を参照する可能性があるため、
# generate 完了を待つ。失敗しても exit 0（情報提示のみ）。

set -euo pipefail
# 手動テスト時の fallback（hooks-patterns.md §Windows (MINGW64) 固有の注意）
: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

BASENAME=$(basename "$FILE_PATH")
if [[ "$BASENAME" != "schema.prisma" ]]; then
  exit 0
fi
if [[ "$FILE_PATH" != *"/prisma/schema.prisma" ]] && [[ "$FILE_PATH" != "prisma/schema.prisma" ]]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

if bun run db:generate > /dev/null 2>&1; then
  CONTEXT="prisma generate 完了（schema.prisma 編集検出）。マイグレーションが必要な場合は /prisma-migration を実行してください。"
else
  CONTEXT="⚠️ prisma generate 失敗。schema.prisma の構文を確認してください。マイグレーションが必要な場合は /prisma-migration を実行してください。"
fi

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $ctx
  }
}'

exit 0
