#!/usr/bin/env bash
# PostToolUse hook: Warn when admin dashboard page.tsx is missing await connection()
# Next.js 16 PPR requires await connection() before new Date() in Server Components
# See: https://nextjs.org/docs/app/api-reference/functions/connection

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# Only target admin dashboard page.tsx files
[[ "$FILE_PATH" == *"(dashboard)"*"page.tsx" ]] || exit 0

# Check if file contains await connection()
cd "$CLAUDE_PROJECT_DIR" || exit 0
if ! grep -q "await connection()" "$FILE_PATH" 2>/dev/null; then
  echo "⚠️  管理画面 page.tsx に 'await connection()' がありません。"
  echo "   Next.js 16 PPR では new Date() より前に必要です（ビルドエラー防止）。"
  echo "   import { connection } from 'next/server' して await connection() を追加してください。"
fi

exit 0
