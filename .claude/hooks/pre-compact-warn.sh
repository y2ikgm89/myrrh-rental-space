#!/usr/bin/env bash
set -euo pipefail
: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# 公式仕様: PreCompact hook (matcher: "auto" | "manual")
# https://code.claude.com/docs/en/hooks#precompact
# 「The kitchen sink session」(公式 best-practices §Avoid common failure patterns)
# 対策として、auto-compaction 発火を session 内で可視化し /clear 判断を促す

INPUT=$(cat)
TRIGGER=$(printf '%s' "$INPUT" | jq -r '.trigger // "auto"')

# manual /compact は user 明示要求なので警告対象外
if [ "$TRIGGER" = "manual" ]; then
  exit 0
fi

# auto-compaction = kitchen sink signal
# additionalContext で Claude に「次の判断ポイント」を注入する
jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreCompact",
    additionalContext: "⚠️  auto-compaction が発火しました。これは The kitchen sink session の典型 signal です (公式 best-practices)。\n次の応答前に判断してください:\n  1. このセッションを継続する場合: 残り context で完遂可能か見積もり\n  2. 無関係タスクが累積している場合: `/clear` でリセット後、specific prompt で再開を user に提案\n  3. 同じ問題で 2 回以上修正失敗した形跡があれば `/clear` 推奨を user に明示"
  }
}'
