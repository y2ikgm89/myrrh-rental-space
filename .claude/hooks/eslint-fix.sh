#!/usr/bin/env bash
# PostToolUse hook: Run ESLint --fix on edited TypeScript/TSX files

set -euo pipefail
# 手動テスト時の fallback（hooks-patterns.md §Windows (MINGW64) 固有の注意）
: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# Only lint TypeScript/TSX source files
[[ "$FILE_PATH" =~ \.(ts|tsx)$ ]] || exit 0
[[ "$FILE_PATH" =~ (node_modules|\.next|generated|\.d\.ts$) ]] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

bunx --bun eslint --fix "$FILE_PATH" --quiet 2>/dev/null || true

exit 0
