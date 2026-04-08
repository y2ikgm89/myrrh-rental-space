#!/usr/bin/env bash
# PostToolUse hook: signIn.social() の fetchOptions.onError 漏れを検出
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0
[[ "$FILE_PATH" != *.tsx && "$FILE_PATH" != *.ts ]] && exit 0

# auth-client を import するファイルのみ対象
grep -qE 'from.*auth-client' "$FILE_PATH" 2>/dev/null || exit 0

# signIn.social を fetchOptions なしで呼んでいたら警告
if grep -qE 'signIn\.social\(' "$FILE_PATH" && ! grep -qE 'fetchOptions' "$FILE_PATH"; then
  echo "⚠️ signIn.social() に fetchOptions.onError がありません（HTTP エラーがサイレント失敗します）"
  echo "→ .claude/rules/auth-patterns.md §signIn.social のエラーハンドリング を参照"
fi

exit 0
