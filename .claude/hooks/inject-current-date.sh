#!/usr/bin/env bash
# UserPromptSubmit hook: MEMORY.md の currentDate を自動更新
# 変更があった場合のみファイルを書き換える

set -euo pipefail

MEMORY_DIR="$HOME/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory"
MEMORY_FILE="$MEMORY_DIR/MEMORY.md"

if [[ ! -f "$MEMORY_FILE" ]]; then
  exit 0
fi

TODAY=$(date +%Y-%m-%d)
CURRENT_LINE="Today's date is ${TODAY}."

# 既に正しい日付が設定されていれば何もしない
if grep -qF "$CURRENT_LINE" "$MEMORY_FILE" 2>/dev/null; then
  exit 0
fi

# currentDate セクションの日付行を更新（sed -i で in-place 編集）
sed -i "s/^Today's date is .*/Today's date is ${TODAY}./" "$MEMORY_FILE"

exit 0
