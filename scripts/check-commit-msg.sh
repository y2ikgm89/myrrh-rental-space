#!/usr/bin/env bash
# Lefthook commit-msg guard: enforce Conventional Commits format.
#   feat|fix|refactor|perf|test|docs|chore|ci|style|build|revert
#   optional scope: (scope)
#   optional breaking: !
#   subject: 1 char minimum after ": "
set -euo pipefail

msg_file=${1:?usage: check-commit-msg.sh <commit-msg-file>}
first_line=$(head -n1 "$msg_file")

# Merge / revert / fixup / squash commits をスキップ
case "$first_line" in
  Merge*|Revert*|fixup!*|squash!*) exit 0 ;;
esac

if ! printf '%s' "$first_line" | grep -qE '^(feat|fix|refactor|perf|test|docs|chore|ci|style|build|revert)(\(.+\))?!?: .+'; then
  echo "❌ コミットメッセージは Conventional Commits 形式で書いてください" >&2
  echo "   例: feat(reservation): add cancellation flow" >&2
  echo "   type: feat|fix|refactor|perf|test|docs|chore|ci|style|build|revert" >&2
  exit 1
fi

exit 0
