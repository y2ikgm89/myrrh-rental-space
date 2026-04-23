#!/usr/bin/env bash
# PreToolUse hook: Block access to sensitive files (.env*, bun.lock, prisma migrations)
# - Read tool: blocks .env only (bun.lock / prisma migrations are readable)
# - Edit|Write tools: blocks all three
#
# 公式仕様（code.claude.com/docs/en/hooks#permissiondecision）:
#   PreToolUse の deny は hookSpecificOutput.permissionDecision = "deny" + reason を
#   exit 0 で出力する。exit 2 + stderr は古典パターンで両方有効だが、新形式の方が
#   UI で構造化された理由メッセージとして表示される。

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

BASENAME=$(basename "$FILE_PATH")

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# Block .env files (any variant: .env, .env.local, .env.production, etc.)
# Applies to Read, Edit, Write — environment secrets must never be accessed.
if [[ "$BASENAME" =~ ^\.env(\..*)?$ ]]; then
  if [[ "$TOOL_NAME" == "Read" ]]; then
    deny "Blocked: .env ファイルの読み取りは禁止されています。環境変数は Cloud Run コンソールまたは .env.example を通じて確認してください。"
  else
    deny "Blocked: .env ファイルの直接編集は禁止されています。環境変数は Cloud Run コンソールまたは .env.example を通じて管理してください。"
  fi
fi

# Edit|Write-only blocks below (Read is allowed for bun.lock and prisma migrations).
if [[ "$TOOL_NAME" == "Read" ]]; then
  exit 0
fi

# Block bun.lock (must only be updated via bun install)
if [[ "$BASENAME" == "bun.lock" ]]; then
  deny "Blocked: bun.lock の直接編集は禁止されています。依存関係の変更には bun add / bun install を使用してください。"
fi

# Block prisma migration SQL files (auto-generated, must not be edited manually)
if [[ "$FILE_PATH" =~ /prisma/migrations/.*\.sql$ ]] || [[ "$FILE_PATH" =~ ^prisma/migrations/.*\.sql$ ]]; then
  deny "Blocked: prisma/migrations/ の SQL は自動生成ファイルです。手動編集は禁止されています。新しいマイグレーションは /prisma-migration を使用してください。"
fi

exit 0
