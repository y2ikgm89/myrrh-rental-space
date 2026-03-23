#!/usr/bin/env bash
# PostToolUse hook: Remind to use context7 when editing public page components
# that import key libraries (react-hook-form, react-day-picker, next/)

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# Only target public page .tsx files
[[ "$FILE_PATH" == *"(public)"*".tsx" ]] || exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Check if file imports key libraries that have context7 docs
if grep -qE "from ['\"]react-hook-form|from ['\"]react-day-picker|from ['\"]next/" "$FILE_PATH" 2>/dev/null; then
  echo "Reminder: このファイルは react-hook-form / react-day-picker / Next.js を使用しています。"
  echo "   公式ベストプラクティスに準拠するため、context7 で最新パターンを確認してください。"
  echo "   resolve-library-id → query-docs"
fi

exit 0
