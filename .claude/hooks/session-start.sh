#!/usr/bin/env bash
# SessionStart hook: 進行中の計画ファイルを表示する。
# source が "compact" のときは、圧縮で失われた git state を追加注入する。
#
# 公式仕様（code.claude.com/docs/en/hooks-guide#re-inject-context-after-compaction）:
#   SessionStart の source 分岐で compact 時の state 再注入を行うのが推奨パターン。
#   stdout は Claude のコンテキストに直接流れる（exit 0 必須）。

set -euo pipefail

: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

PLANS_DIR="$CLAUDE_PROJECT_DIR/docs/superpowers/plans"

INPUT=$(cat 2>/dev/null || echo '{}')
SOURCE=$(printf '%s' "$INPUT" | jq -r '.source // "startup"' 2>/dev/null || echo "startup")

# --- 共通: 進行中の計画 ---
# 検出パターン: `> **In Progress:` マーカーあり、または `> **Snapshot:` あり + `> **Completed:` なし
# (CLAUDE.md「セッション跨ぎ大規模 plan は handoff memory 必須」§ 完了マーカー仕様)
echo '=== 進行中の計画 ==='
FOUND=0
if [ -d "$PLANS_DIR" ]; then
  for f in "$PLANS_DIR"/*.md; do
    [ -f "$f" ] || continue
    case "$(basename "$f")" in README*|CLAUDE*) continue ;; esac
    if grep -qE '^>\s*\*\*In Progress:' "$f" 2>/dev/null; then
      echo "${f#"$CLAUDE_PROJECT_DIR/"}"
      FOUND=$((FOUND + 1))
    elif grep -qE '^>\s*\*\*Snapshot:' "$f" 2>/dev/null && ! grep -qE '^>\s*\*\*Completed:' "$f" 2>/dev/null; then
      echo "${f#"$CLAUDE_PROJECT_DIR/"}"
      FOUND=$((FOUND + 1))
    fi
    [ "$FOUND" -ge 5 ] && break
  done
fi
[ "$FOUND" -eq 0 ] && echo '(なし)'

# --- 共通: 自分の open PR + CI 状態 ---
# auto-merge 予約後の CI fail を次セッション開始時に検出するための SSoT
# (CLAUDE.md §自動完遂ポリシー gate 8 = CI fail 検知 / feedback_auto-merge-default.md)
# gh 未インストール / 認証なし / network fail でも silent に skip (exit 0 維持)
if command -v gh >/dev/null 2>&1; then
  PRS_JSON=$(gh pr list --author '@me' --state open --json number,title,headRefName,statusCheckRollup,autoMergeRequest 2>/dev/null || echo '[]')
  PR_COUNT=$(printf '%s' "$PRS_JSON" | jq 'length' 2>/dev/null || echo '0')

  if [ "${PR_COUNT:-0}" -gt 0 ]; then
    echo ''
    echo '=== 自分の open PR (auto-merge 待機 / fix 待ち) ==='
    printf '%s' "$PRS_JSON" | jq -r '.[] |
      . as $pr |
      ($pr.statusCheckRollup // []) as $checks |
      (if ($checks | length) == 0 then "PENDING"
       elif ($checks | any(.conclusion == "FAILURE" or .conclusion == "CANCELLED" or .conclusion == "TIMED_OUT")) then "FAIL"
       elif ($checks | any(.status == "IN_PROGRESS" or .status == "QUEUED" or .status == "PENDING")) then "RUNNING"
       elif ($checks | all((.conclusion // "") | IN("SUCCESS", "NEUTRAL", "SKIPPED", ""))) then "PASS"
       else "UNKNOWN"
       end) as $state |
      (if ($pr.autoMergeRequest // null) then " (auto-merge ON)" else "" end) as $auto |
      "- #\($pr.number) [\($state)\($auto)] \($pr.title) (\($pr.headRefName))"' 2>/dev/null || echo '(取得失敗)'
  fi
fi

# --- compact 専用: 圧縮後の state 再注入 ---
if [ "$SOURCE" = "compact" ]; then
  cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
  git rev-parse --git-dir >/dev/null 2>&1 || exit 0

  echo ''
  echo '=== 圧縮後の state 再注入 ==='

  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')
  echo "Branch: ${BRANCH}"

  echo 'Recent commits:'
  git log --oneline -5 2>/dev/null | sed 's/^/  /' || true

  UNCOMMITTED=$(git status --short 2>/dev/null | wc -l | tr -d ' ' || echo '0')
  echo "Uncommitted changes: ${UNCOMMITTED} file(s)"

  if [ "${UNCOMMITTED:-0}" -gt 0 ] && [ "${UNCOMMITTED:-0}" -le 10 ]; then
    echo 'Changed files:'
    git status --short 2>/dev/null | sed 's/^/  /' | head -10 || true
  fi
fi

exit 0
