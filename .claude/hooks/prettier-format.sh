#!/usr/bin/env bash
# PostToolUse hook: Run Prettier on edited/written files
# Receives tool event JSON on stdin

set -euo pipefail
# 手動テスト時の fallback（hooks-patterns.md §Windows (MINGW64) 固有の注意）
: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# Only format source files (skip generated, lock files, etc.)
# Markdown / YAML は除外: PostToolUse 直後の auto-format が Edit ツールの
# old_string drift（インラインコード周辺空白の詰め直し等）を引き起こす Edit エラーの主因。
# Markdown / YAML は lefthook pre-commit (`prettier-fix` job, lefthook.yml) で
# commit 時に一括整形する設計に統一済（公式 hooks-patterns.md §Edit drift 予防）。
[[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx|css|json)$ ]] || exit 0
[[ "$FILE_PATH" =~ (node_modules|\.next|bun\.lock|\.generated\.) ]] && exit 0

# Run Prettier from project root (hooks run with Claude Code's environment)
cd "$CLAUDE_PROJECT_DIR" || exit 0

bunx --bun prettier --write "$FILE_PATH" --log-level=silent 2>/dev/null || true

exit 0
