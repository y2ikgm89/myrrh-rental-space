#!/usr/bin/env bash
# PreToolUse hook: Block access to sensitive files (.env*, bun.lock, prisma migrations)
# - Read tool: blocks .env only (bun.lock / prisma migrations are readable)
# - Edit|Write tools: blocks all three
# Receives tool event JSON on stdin

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

BASENAME=$(basename "$FILE_PATH")

# Block .env files (any variant: .env, .env.local, .env.production, etc.)
# Applies to Read, Edit, Write — environment secrets must never be accessed.
if [[ "$BASENAME" =~ ^\.env(\..*)?$ ]]; then
  if [[ "$TOOL_NAME" == "Read" ]]; then
    echo "Blocked: .env ファイルの読み取りは禁止されています。環境変数は Cloud Run コンソールまたは .env.example を通じて確認してください。" >&2
  else
    echo "Blocked: .env ファイルの直接編集は禁止されています。環境変数は Cloud Run コンソールまたは .env.example を通じて管理してください。" >&2
  fi
  exit 2
fi

# Edit|Write-only blocks below (Read is allowed for bun.lock and prisma migrations).
if [[ "$TOOL_NAME" == "Read" ]]; then
  exit 0
fi

# Block bun.lock (must only be updated via bun install)
if [[ "$BASENAME" == "bun.lock" ]]; then
  echo "Blocked: bun.lock の直接編集は禁止されています。依存関係の変更には bun add / bun install を使用してください。" >&2
  exit 2
fi

# Block prisma migration SQL files (auto-generated, must not be edited manually)
if [[ "$FILE_PATH" =~ /prisma/migrations/.*\.sql$ ]] || [[ "$FILE_PATH" =~ ^prisma/migrations/.*\.sql$ ]]; then
  echo "Blocked: prisma/migrations/ の SQL は自動生成ファイルです。手動編集は禁止されています。新しいマイグレーションは /prisma-migration を使用してください。" >&2
  exit 2
fi

exit 0
