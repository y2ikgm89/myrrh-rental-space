#!/usr/bin/env bash
# PostToolUse (Task) hook: subagent 完了後の git state スナップショットをコンテキストに注入
#
# 目的:
#   implementer subagent が報告する commit SHA・ファイル変更を、次ターンで Claude が
#   独立検証できるようにする。haiku モデル等による fabrication 対策。
#
# 出力は Claude の次ターンコンテキストに流れ、verify-subagent-report スキルと併用される。

set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# git リポジトリでない場合は何もしない
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

echo "---"
echo "[post-subagent] git snapshot:"

# HEAD 付近のコミット
git log --oneline -3 2>/dev/null | sed 's/^/  /' || true

# 未コミット変更の有無
STATUS=$(git status --short 2>/dev/null | head -5 || true)
if [ -n "$STATUS" ]; then
  echo ""
  echo "  uncommitted:"
  echo "$STATUS" | sed 's/^/    /'
fi

# アクティブな worktree が複数ある場合は列挙（どれに commit されたか判別用）
WORKTREES=$(git worktree list 2>/dev/null | wc -l | tr -d ' ')
if [ "$WORKTREES" -gt 1 ]; then
  echo ""
  echo "  worktrees:"
  git worktree list 2>/dev/null | sed 's/^/    /'
fi

echo "---"
exit 0
