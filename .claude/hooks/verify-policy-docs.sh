#!/usr/bin/env bash
# PostToolUse (Edit|Write): policy docs の byte-identical 同期検証
# 対象: .claude/rules/frontend/{lexical,admin-inline-editor}-patterns.md
#      または docs/reference/codex-rules/{lexical,admin-inline-editor}-patterns.md
# CLAUDE.md ADR 0013 / policy-docs-sync CI job の blocker 事前検出

set -euo pipefail

: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# 対象ファイルのみ検査
case "$FILE_PATH" in
  *.claude/rules/frontend/lexical-patterns.md \
  | *.claude/rules/frontend/admin-inline-editor-patterns.md \
  | *docs/reference/codex-rules/lexical-patterns.md \
  | *docs/reference/codex-rules/admin-inline-editor-patterns.md)
    ;;
  *)
    exit 0
    ;;
esac

cd "$CLAUDE_PROJECT_DIR"

LOG="$(mktemp)"
if node scripts/verify-policy-docs.mjs > "$LOG" 2>&1; then
  rm -f "$LOG"
  exit 0
fi

# drift を検出 → CI blocker になる前にエージェントへ通知
printf 'policy-docs-sync: drift detected. docs/reference/codex-rules と .claude/rules/frontend を byte-identical に揃えてください。\n' >&2
tail -20 "$LOG" >&2 || true
rm -f "$LOG"
exit 2
