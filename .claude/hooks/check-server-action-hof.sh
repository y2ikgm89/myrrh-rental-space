#!/usr/bin/env bash
# PostToolUse: "use server" ファイルで withPermission/withReadPermission なしの
# export async function を検出し、認証チェック漏れを防ぐ

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

# withPermission/withReadPermission/withRole/checkReadPermissionFor が一切ない場合
if ! grep -qE "withPermission|withReadPermission|withRole|checkReadPermissionFor" "$FILE_PATH" 2>/dev/null; then
  # export async function が存在する場合のみ警告（HOF 経由でない生の export）
  if grep -qE "^export async function" "$FILE_PATH" 2>/dev/null; then
    echo "WARNING: Server Action に withPermission/withReadPermission HOF が未使用です。"
    echo "   認証チェック漏れのリスクがあります。"
    echo "   .claude/rules/error-handling.md の withPermission パターンを確認してください。"
    echo "   （読み取り専用なら checkReadPermissionFor、書き込み系は withPermission を使用）"
  fi
fi

exit 0
