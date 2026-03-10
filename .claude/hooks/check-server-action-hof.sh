#!/usr/bin/env bash
# PostToolUse: "use server" ファイルで executeAdminMutation パターンなしの
# export を検出し、認証チェック漏れを防ぐ

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

[ -z "$FILE_PATH" ] && exit 0

# actions/ ディレクトリの .ts ファイルのみ対象
[[ "$FILE_PATH" == *"actions"* && "$FILE_PATH" == *.ts ]] || exit 0
[[ "$FILE_PATH" == *"__tests__"* ]] && exit 0
[[ "$FILE_PATH" == *".d.ts" ]] && exit 0

# "use server" ディレクティブがないファイルはスキップ（helpers.ts 等）
if ! grep -qE '^"use server"|^'"'"'use server'"'" "$FILE_PATH" 2>/dev/null; then exit 0; fi

# executeAdminMutation / executeAdminMutationResult / checkPermission が一切ない場合
if ! grep -qE "executeAdminMutation|executeAdminMutationResult|checkPermission|checkAdminAuth|checkResourceAccess" "$FILE_PATH" 2>/dev/null; then
  # export された関数/const が存在する場合のみ警告
  if grep -qE "^export (async function|const )" "$FILE_PATH" 2>/dev/null; then
    echo "WARNING: Server Action に認証パターンが未使用です。"
    echo "   書き込み系: executeAdminMutation / executeAdminMutationResult を使用"
    echo "   API Route: checkPermission を直接使用"
    echo "   .claude/rules/auth-patterns.md を確認してください。"
  fi
fi

exit 0
