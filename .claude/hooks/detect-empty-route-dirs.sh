#!/usr/bin/env bash
# PostToolUse (Bash) hook: src/app/ 配下の空ディレクトリ（動的ルート残骸）を検出
# [slug], [...segments], [[...segments]] パターンの空ディレクトリを警告

set -euo pipefail

APP_DIR="$CLAUDE_PROJECT_DIR/src/app"

if [[ ! -d "$APP_DIR" ]]; then
  exit 0
fi

# 動的ルートパターン（[*]）のディレクトリを検索し、中身が空かチェック
EMPTY_DIRS=""
while IFS= read -r dir; do
  # ディレクトリ内にファイルが1つもなければ空
  if [[ -z "$(find "$dir" -maxdepth 1 -type f 2>/dev/null)" ]]; then
    EMPTY_DIRS="${EMPTY_DIRS}${dir#"$CLAUDE_PROJECT_DIR/"}\n"
  fi
done < <(find "$APP_DIR" -type d -name '\[*\]' -o -type d -name '\[\[*\]\]' 2>/dev/null)

if [[ -n "$EMPTY_DIRS" ]]; then
  echo "⚠️ 空の動的ルートディレクトリを検出（移行残骸の可能性）:"
  echo -e "$EMPTY_DIRS"
fi

exit 0
