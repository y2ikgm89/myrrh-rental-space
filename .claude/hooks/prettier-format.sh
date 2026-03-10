#!/usr/bin/env bash
# PostToolUse hook: Run Prettier on edited/written files
# Receives tool event JSON on stdin

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# Only format source files (skip generated, lock files, etc.)
[[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx|css|json|md)$ ]] || exit 0
[[ "$FILE_PATH" =~ (node_modules|\.next|bun\.lock|\.generated\.) ]] && exit 0

# Run Prettier from project root (hooks run with Claude Code's environment)
cd "$CLAUDE_PROJECT_DIR" || exit 0

bunx --bun prettier --write "$FILE_PATH" --log-level=silent 2>/dev/null || true

exit 0
