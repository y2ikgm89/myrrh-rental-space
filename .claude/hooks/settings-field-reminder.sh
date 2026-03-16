#!/usr/bin/env bash
# PostToolUse hook: Remind about 4-location update when Settings model fields are added
# Triggers only when new fields are added to the Settings model in schema.prisma

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# Only trigger for schema.prisma
BASENAME=$(basename "$FILE_PATH")
if [[ "$BASENAME" != "schema.prisma" ]] || [[ "$FILE_PATH" != *"/prisma/schema.prisma" && "$FILE_PATH" != "prisma/schema.prisma" ]]; then
  exit 0
fi

# Check if the edit touches the Settings model (look for new field lines in diff context)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
NEW_STRING=$(printf '%s' "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null || echo "")

# Only for Edit tool with new_string containing field-like patterns near Settings
if [[ "$TOOL_NAME" != "Edit" ]] || [ -z "$NEW_STRING" ]; then
  exit 0
fi

# Heuristic: check if the new content looks like Prisma field definitions
# (contains type keywords like String, Boolean, Int, Float, DateTime, Json)
if ! printf '%s' "$NEW_STRING" | grep -qE '^\s+(String|Boolean|Int|Float|DateTime|Json)'; then
  exit 0
fi

# Verify the edit is within the Settings model by checking surrounding context
OLD_STRING=$(printf '%s' "$INPUT" | jq -r '.tool_input.old_string // empty' 2>/dev/null || echo "")
SCHEMA_FILE="$CLAUDE_PROJECT_DIR/prisma/schema.prisma"

if [ ! -f "$SCHEMA_FILE" ]; then
  exit 0
fi

# Check if old_string content is within Settings model block
if ! grep -A 200 'model Settings {' "$SCHEMA_FILE" | grep -q "$(printf '%s' "$OLD_STRING" | head -1)"; then
  exit 0
fi

cat <<'MSG'
📋 Settings モデルにフィールドが追加されました。以下 4 箇所の更新が必要です:

  1. src/shared/domain/settings/types.ts — SettingsData 型にフィールド追加
  2. src/shared/domain/settings/queries.ts — get*Settings() クエリ追加
  3. src/shared/domain/settings/commands.ts — update*Settings() コマンド追加
  4. actions/settings/schemas.ts + other.ts — Zod スキーマ + Server Action 追加

💡 /add-settings-field スキルで一括スキャフォールド可能です。
MSG

exit 0
