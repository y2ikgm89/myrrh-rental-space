#!/usr/bin/env bash
# PostToolUse hook: Block when admin dashboard page.tsx has new Date() without await connection()
# Next.js 16 PPR requires await connection() before new Date() in Server Components
# See: https://nextjs.org/docs/app/api-reference/functions/connection

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# Only target admin dashboard page.tsx files
[[ "$FILE_PATH" == *"(dashboard)"*"page.tsx" ]] || exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Only block if new Date() is present without connection()
HAS_NEW_DATE=$(grep -c "new Date()" "$FILE_PATH" 2>/dev/null || echo "0")
HAS_CONNECTION=$(grep -c "await connection()" "$FILE_PATH" 2>/dev/null || echo "0")

if [ "$HAS_NEW_DATE" -gt 0 ] && [ "$HAS_CONNECTION" -eq 0 ]; then
  echo "ERROR: 管理画面 page.tsx に 'new Date()' があるが 'await connection()' がありません。"
  echo "   Next.js 16 PPR ではビルドエラーになります。"
  echo "   import { connection } from 'next/server' して await connection() を追加してください。"
  exit 2
fi

exit 0
