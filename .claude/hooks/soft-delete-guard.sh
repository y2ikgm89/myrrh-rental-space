#!/usr/bin/env bash
# PostToolUse hook: Warn when domain files with soft-deletable models have
# findUnique/findFirst/findMany/update without deletedAt: null
# Covers: Reservation, Event, SpaceReview (all models with deletedAt column)
# Also checks nested relation queries where parent has deletedAt
# Exception: restore* functions (intentionally query deleted records)

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# Only trigger for domain files with soft-deletable models
case "$FILE_PATH" in
  *domain/reservations/*|*domain/events/*|*domain/reviews/*) ;;
  *) exit 0 ;;
esac

# Skip non-ts files
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

[ ! -f "$FILE_PATH" ] && exit 0

# Skip files with restore functions (intentionally query deleted records)
HAS_RESTORE=$(grep -c 'restore' "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
[ "$HAS_RESTORE" -gt 0 ] && exit 0

# Detect which soft-deletable models are queried in this file
WARNINGS=""

for MODEL in reservation event spaceReview; do
  HAS_QUERIES=$(grep -cE "${MODEL}\.(findUnique|findFirst|findMany|update)\(" "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
  [ "$HAS_QUERIES" -eq 0 ] && continue

  HAS_DELETED_AT=$(grep -c 'deletedAt' "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")

  if [ "$HAS_DELETED_AT" -eq 0 ]; then
    WARNINGS="${WARNINGS}⚠️  ソフトデリート警告: $(basename "$FILE_PATH") に ${MODEL} クエリが ${HAS_QUERIES} 件ありますが deletedAt: null が見つかりません。\n"
  fi
done

# Check for nested relation queries (child model querying parent with deletedAt)
# e.g., EventRegistration querying without event: { deletedAt: null }
for PARENT in event reservation; do
  # Check if file references parent model in where clause but without deletedAt guard
  HAS_PARENT_REF=$(grep -cE "${PARENT}Id" "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
  [ "$HAS_PARENT_REF" -eq 0 ] && continue

  HAS_NESTED_GUARD=$(grep -cE "${PARENT}:\s*\{[^}]*deletedAt" "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
  HAS_PARENT_DELETED_AT=$(grep -c 'deletedAt' "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")

  if [ "$HAS_NESTED_GUARD" -eq 0 ] && [ "$HAS_PARENT_DELETED_AT" -eq 0 ]; then
    # Check if file actually has findMany/findFirst etc (not just a type file)
    HAS_ANY_QUERY=$(grep -cE '(findUnique|findFirst|findMany|update|count|aggregate)\(' "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
    if [ "$HAS_ANY_QUERY" -gt 0 ]; then
      WARNINGS="${WARNINGS}⚠️  リレーション経由ソフトデリート警告: $(basename "$FILE_PATH") に ${PARENT}Id 参照がありますが ${PARENT}: { deletedAt: null } ガードが見つかりません。\n"
    fi
  fi
done

if [ -n "$WARNINGS" ]; then
  printf '%b' "$WARNINGS"
  echo "ソフトデリートモデルの全クエリに where: { deletedAt: null } を追加してください（restore* を除く）。"
  echo "リレーション経由クエリは親モデルの deletedAt もフィルタしてください。"
fi

exit 0
