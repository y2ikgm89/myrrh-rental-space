#!/usr/bin/env bash
# PostToolUse (Edit/Write): 編集されたファイル内の eslint-disable コメントが
# 廃止されたルール名を参照していないか検出する
# eslint-react v4 でルール名プレフィックスがフラット化（/ → -）

set -euo pipefail

# stdin から tool_input JSON を読み取り
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // empty')

if [[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# .ts/.tsx ファイルのみ対象
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# 廃止されたルール名パターン（eslint-react v4 で変更）
STALE_PATTERNS=(
  "@eslint-react/hooks-extra/"
  "@eslint-react/debug/"
  "@eslint-react/dom/"
  "@eslint-react/web-api/"
  "@eslint-react/rsc/"
  "@eslint-react/naming-convention/"
)

for pattern in "${STALE_PATTERNS[@]}"; do
  if grep -q "eslint-disable.*${pattern}" "$FILE_PATH" 2>/dev/null; then
    echo "⚠️ 廃止された eslint ルール名を検出: ${pattern}* in $(basename "$FILE_PATH")"
    echo "   eslint-react v4 ではプレフィックスがフラット化されています:"
    echo "   @eslint-react/dom/no-xxx → @eslint-react/dom-no-xxx"
    echo "   @eslint-react/web-api/no-xxx → @eslint-react/web-api-no-xxx"
    exit 0
  fi
done
