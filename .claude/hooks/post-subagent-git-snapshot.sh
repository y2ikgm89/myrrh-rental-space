#!/usr/bin/env bash
# PostToolUse (matcher: Task) hook: subagent 完了直後の git state スナップショットを
# additionalContext JSON でモデルに注入する。
#
# 目的:
#   implementer subagent が報告する commit SHA・ファイル変更を、次ターンで Claude が
#   独立検証できるようにする。haiku モデル等による fabrication 対策。
#
# 公式仕様:
#   SubagentStop の stdout はコンテキストに流れないため、PostToolUse/Task にフックし
#   hookSpecificOutput.additionalContext で注入する方式を採る。

set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# git リポジトリでない場合は何もしない
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

LINES=()
LINES+=("[post-subagent] git snapshot:")

# HEAD 付近のコミット
while IFS= read -r line; do
  LINES+=("  ${line}")
done < <(git log --oneline -3 2>/dev/null || true)

# 未コミット変更の有無
STATUS=$(git status --short 2>/dev/null | head -5 || true)
if [ -n "$STATUS" ]; then
  LINES+=("")
  LINES+=("  uncommitted:")
  while IFS= read -r line; do
    LINES+=("    ${line}")
  done <<< "$STATUS"
fi

# アクティブな worktree が複数ある場合は列挙
WORKTREES=$(git worktree list 2>/dev/null | wc -l | tr -d ' ')
if [ "${WORKTREES:-0}" -gt 1 ]; then
  LINES+=("")
  LINES+=("  worktrees:")
  while IFS= read -r line; do
    LINES+=("    ${line}")
  done < <(git worktree list 2>/dev/null || true)
fi

CONTEXT=$(printf '%s\n' "${LINES[@]}")

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $ctx
  }
}'

exit 0
