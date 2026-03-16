#!/usr/bin/env bash
# PostToolUse: Admin ↔ Public の import 境界違反を検出
# @/admin/* を public から、@/public/* を admin から import した場合に警告

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# テストファイルは除外
[[ "$FILE_PATH" == *"__tests__"* ]] && exit 0

# .ts/.tsx ファイルのみ対象
[[ "$FILE_PATH" == *.ts || "$FILE_PATH" == *.tsx ]] || exit 0

# (public) 配下で @/admin/ を import しているか
if [[ "$FILE_PATH" == *"(public)"* ]]; then
  if grep -qE 'from\s+["\x27]@/admin/' "$FILE_PATH" 2>/dev/null; then
    echo "⚠️ Import 境界違反: public 側から @/admin/* を import しています。"
    echo "   (public) と (admin) は異なる Root Layout で CSS 変数が異なります。"
    echo "   共有コードは @/shared/* に配置してください。"
    exit 2
  fi
fi

# (admin) 配下で @/public/ を import しているか
if [[ "$FILE_PATH" == *"(admin)"* ]]; then
  if grep -qE 'from\s+["\x27]@/public/' "$FILE_PATH" 2>/dev/null; then
    # admin-registry の sections 登録は許可（既知パターン）
    if [[ "$FILE_PATH" == *"register-admin-sections"* ]]; then
      exit 0
    fi
    echo "⚠️ Import 境界違反: admin 側から @/public/* を import しています。"
    echo "   (public) と (admin) は異なる Root Layout で CSS 変数が異なります。"
    echo "   共有コードは @/shared/* に配置してください。"
    exit 2
  fi
fi

exit 0
