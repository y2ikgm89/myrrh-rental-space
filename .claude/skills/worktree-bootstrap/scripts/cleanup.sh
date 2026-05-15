#!/usr/bin/env bash
# worktree cleanup: 完了 worktree の安全な削除
#
# 安全性:
#   - 未コミット変更があれば exit 1（--force 指定時のみ強制削除）
#   - 未 push commit があれば warn + 確認 prompt
#   - 削除後に git worktree prune で stale admin file を掃除
#   - locked worktree は明示的 unlock が必要
#
# Usage:
#   bash .claude/skills/worktree-bootstrap/scripts/cleanup.sh <branch-name> [--force]
#
# Reference:
#   - https://git-scm.com/docs/git-worktree (remove / prune / lock)
#   - https://code.claude.com/docs/en/worktrees#clean-up-worktrees

set -euo pipefail

BRANCH="${1:-}"
FORCE="${2:-}"

if [ -z "$BRANCH" ]; then
  echo "Usage: $0 <branch-name> [--force]" >&2
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  echo "Error: git リポジトリ内で実行してください" >&2
  exit 1
fi
cd "$REPO_ROOT"

# legacy `.worktrees/` location と公式 `.claude/worktrees/` の両方を探索
WORKTREE_DIR=""
for candidate in ".worktrees/$BRANCH" ".claude/worktrees/$BRANCH" ".claude/worktrees/worktree-$BRANCH"; do
  if [ -d "$candidate" ]; then
    WORKTREE_DIR="$candidate"
    break
  fi
done

if [ -z "$WORKTREE_DIR" ]; then
  echo "Error: worktree が見つかりません: .worktrees/$BRANCH / .claude/worktrees/$BRANCH" >&2
  echo "       一覧: git worktree list" >&2
  exit 1
fi

echo "🔍 worktree: $WORKTREE_DIR"

# ---- 未コミット変更チェック ----
DIRTY=$(git -C "$WORKTREE_DIR" status --short | wc -l | tr -d ' ')
if [ "$DIRTY" -gt 0 ]; then
  if [ "$FORCE" != "--force" ]; then
    echo "Error: 未コミット変更が $DIRTY 件あります。--force で強制削除可。" >&2
    git -C "$WORKTREE_DIR" status --short >&2
    exit 1
  fi
  echo "⚠️  --force 指定: 未コミット変更を破棄します ($DIRTY 件)"
fi

# ---- 未 push commit チェック ----
BRANCH_NAME=$(git -C "$WORKTREE_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ -n "$BRANCH_NAME" ] && [ "$BRANCH_NAME" != "HEAD" ]; then
  UPSTREAM=$(git -C "$WORKTREE_DIR" rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>/dev/null || echo "")
  if [ -n "$UPSTREAM" ]; then
    UNPUSHED=$(git -C "$WORKTREE_DIR" rev-list --count "@{u}..HEAD" 2>/dev/null || echo "0")
    if [ "$UNPUSHED" -gt 0 ]; then
      echo "⚠️  未 push commit が $UNPUSHED 件あります（$BRANCH_NAME → $UPSTREAM）"
      if [ "$FORCE" != "--force" ]; then
        read -r -p "   削除しますか? [y/N] " ANSWER
        if [ "$ANSWER" != "y" ] && [ "$ANSWER" != "Y" ]; then
          echo "❌ 中断します。" >&2
          exit 1
        fi
      fi
    fi
  else
    # upstream 未設定 → merged-to-main か確認
    MERGED=$(git branch --merged main 2>/dev/null | grep -c "^[* ]*$BRANCH_NAME$" || true)
    if [ "$MERGED" -eq 0 ]; then
      echo "⚠️  $BRANCH_NAME は main にマージされていません + upstream 未設定"
      if [ "$FORCE" != "--force" ]; then
        read -r -p "   削除しますか? [y/N] " ANSWER
        if [ "$ANSWER" != "y" ] && [ "$ANSWER" != "Y" ]; then
          echo "❌ 中断します。" >&2
          exit 1
        fi
      fi
    fi
  fi
fi

# ---- worktree 削除 ----
echo ""
echo "🗑  git worktree remove $WORKTREE_DIR"
if [ "$FORCE" = "--force" ]; then
  git worktree remove --force "$WORKTREE_DIR" 2>&1 || {
    echo "   ⚠️  remove 失敗。Windows のファイル名長制限などで disk dir が残る場合あり。"
    echo "   prune で git references はクリーンアップします。"
  }
else
  git worktree remove "$WORKTREE_DIR"
fi

# ---- prune ----
echo ""
echo "🧹 git worktree prune"
git worktree prune --verbose

# ---- branch 削除（mergedの場合のみ自動）----
if [ -n "$BRANCH_NAME" ] && [ "$BRANCH_NAME" != "HEAD" ]; then
  if git branch --merged main 2>/dev/null | grep -q "^[* ]*$BRANCH_NAME$"; then
    echo ""
    echo "🗑  branch -d $BRANCH_NAME (main にマージ済み)"
    git branch -d "$BRANCH_NAME" 2>&1 || true
  else
    echo ""
    echo "ℹ️  branch $BRANCH_NAME は保持しました（main 未マージまたは check 不能）"
    echo "   手動削除: git branch -D $BRANCH_NAME（reflog で 90 日復元可）"
  fi
fi

echo ""
echo "✅ cleanup 完了"
echo ""
echo "現在の worktree:"
git worktree list

exit 0
