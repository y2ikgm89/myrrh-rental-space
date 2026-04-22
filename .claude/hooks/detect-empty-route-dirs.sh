#!/usr/bin/env bash
# PostToolUse (Bash) hook: src/app/ 配下の空ディレクトリ（動的ルート残骸）を検出し、
# 検出時のみ additionalContext JSON でモデルに通知する。
#
# [slug], [...segments], [[...segments]] パターンの空ディレクトリを警告。
# 公式仕様: PostToolUse stdout はコンテキストに流れないため、構造化出力を使う。

set -euo pipefail

: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

APP_DIR="$CLAUDE_PROJECT_DIR/src/app"

if [[ ! -d "$APP_DIR" ]]; then
  exit 0
fi

EMPTY_DIRS=()
while IFS= read -r dir; do
  # Recursively check for any file (route.ts / page.tsx in nested route segments
  # such as [id]/agreements/route.ts are valid Next.js structures and must not
  # be flagged as empty). Only flag truly empty dynamic-segment directories.
  if [[ -z "$(find "$dir" -type f 2>/dev/null)" ]]; then
    EMPTY_DIRS+=("${dir#"$CLAUDE_PROJECT_DIR/"}")
  fi
done < <(find "$APP_DIR" -type d \( -name '\[*\]' -o -name '\[\[*\]\]' \) 2>/dev/null)

if [ ${#EMPTY_DIRS[@]} -eq 0 ]; then
  exit 0
fi

LIST=$(printf -- '- %s\n' "${EMPTY_DIRS[@]}")
CONTEXT="⚠️ 空の動的ルートディレクトリを検出（移行残骸の可能性）:
${LIST}"

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $ctx
  }
}'

exit 0
