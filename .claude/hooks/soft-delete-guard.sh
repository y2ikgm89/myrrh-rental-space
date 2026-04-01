#!/usr/bin/env bash
# PostToolUse hook: Warn when reservation query/command files have
# reservation.findUnique/findFirst/findMany/update without deletedAt: null
# Exception: restoreReservationCommand (intentionally queries deleted records)

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# Only trigger for reservation domain files
case "$FILE_PATH" in
  *domain/reservations/*) ;;
  *) exit 0 ;;
esac

# Skip non-ts files
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

[ ! -f "$FILE_PATH" ] && exit 0

# Strategy: check if the file has reservation queries AND deletedAt references.
# If the file has reservation queries but no deletedAt anywhere, it's likely missing the guard.
# This avoids false positives from where variables built earlier in the function.

HAS_QUERIES=$(grep -cE 'reservation\.(findUnique|findFirst|findMany|update)\(' "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
HAS_DELETED_AT=$(grep -c 'deletedAt' "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")
HAS_RESTORE=$(grep -c 'restoreReservation' "$FILE_PATH" 2>/dev/null | tr -d '[:space:]' || echo "0")

# Skip files with no reservation queries or with restore function
[ "$HAS_QUERIES" -eq 0 ] && exit 0
[ "$HAS_RESTORE" -gt 0 ] && exit 0

# If file has reservation queries but zero deletedAt references, warn
if [ "$HAS_DELETED_AT" -eq 0 ]; then
  echo "⚠️  ソフトデリート警告: $(basename "$FILE_PATH") に reservation クエリが ${HAS_QUERIES} 件ありますが deletedAt: null が見つかりません。"
  echo "Reservation の全クエリに where: { deletedAt: null } を追加してください（restoreReservationCommand を除く）。"
fi

exit 0
