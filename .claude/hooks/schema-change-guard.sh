#!/usr/bin/env bash
# PostToolUse hook: Warn when prisma/schema.prisma is edited
# Reminds to run migration and optionally use db-migration-reviewer

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# Only trigger for schema.prisma (not better-auth-schema.prisma)
BASENAME=$(basename "$FILE_PATH")
if [[ "$BASENAME" == "schema.prisma" ]] && [[ "$FILE_PATH" == *"/prisma/schema.prisma" || "$FILE_PATH" == "prisma/schema.prisma" ]]; then
  # 型生成を自動実行（migrate は手動）
  cd "$CLAUDE_PROJECT_DIR"
  if bun run db:generate > /dev/null 2>&1; then
    echo "✅ prisma generate 完了。マイグレーションが必要な場合は /prisma-migration を実行してください。"
  else
    echo "⚠️  prisma generate 失敗。schema.prisma の構文を確認してください。マイグレーションが必要な場合は /prisma-migration を実行してください。"
  fi
fi

exit 0
