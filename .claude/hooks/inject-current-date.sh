#!/usr/bin/env bash
# UserPromptSubmit hook: 現在日付を additionalContext でモデルに注入する。
#
# 公式仕様（code.claude.com/docs/en/hooks）:
#   UserPromptSubmit は hookSpecificOutput.additionalContext を返すと
#   ユーザープロンプトと併せてモデルに渡される（構造化出力が推奨ルート）。
#
# MEMORY.md の sed mutation は廃止（ファイル競合回避・責務の単一化）。

set -euo pipefail

TODAY=$(date +%Y-%m-%d)
CONTEXT="Today's date is ${TODAY}."

if command -v jq >/dev/null 2>&1; then
  jq -n --arg ctx "$CONTEXT" '{
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: $ctx
    }
  }'
else
  printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}\n' "$CONTEXT"
fi

exit 0
