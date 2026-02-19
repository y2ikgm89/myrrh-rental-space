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
  echo "⚠️  prisma/schema.prisma が変更されました。マイグレーションが必要な場合は /prisma-migration を実行してください。"
fi

exit 0
