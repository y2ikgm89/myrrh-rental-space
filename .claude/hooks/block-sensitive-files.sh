#!/usr/bin/env bash
# PreToolUse hook: Block edits to sensitive files (.env*, bun.lockb)
# Receives tool event JSON on stdin

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

BASENAME=$(basename "$FILE_PATH")

# Block .env files (any variant: .env, .env.local, .env.production, etc.)
if [[ "$BASENAME" =~ ^\.env(\..*)?$ ]]; then
  echo "Blocked: .env ファイルの直接編集は禁止されています。環境変数は Cloud Run コンソールまたは .env.example を通じて管理してください。" >&2
  exit 2
fi

# Block bun.lockb (must only be updated via bun install)
if [[ "$BASENAME" == "bun.lockb" ]]; then
  echo "Blocked: bun.lockb の直接編集は禁止されています。依存関係の変更には bun add / bun install を使用してください。" >&2
  exit 2
fi

exit 0
