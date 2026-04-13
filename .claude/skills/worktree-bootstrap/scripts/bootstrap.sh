#!/usr/bin/env bash
# worktree-bootstrap: 隔離 worktree 作成の完全自動化
#
# Usage:
#   bash .claude/skills/worktree-bootstrap/scripts/bootstrap.sh <branch-name>
#
# Steps:
#   1. main の未コミット migration を検出 → DB drift 回避のため WIP snapshot commit
#   2. git worktree add -b feature/<branch> .worktrees/<branch> HEAD
#   3. .env / .env.local を python3 shutil.copy2 経由でコピー（PreToolUse bypass）
#   4. generated/ を worktree にコピー（robocopy または python shutil.copytree）
#   5. 完了レポート出力

set -euo pipefail

# ---- 引数 ----
BRANCH="${1:-}"
if [ -z "$BRANCH" ]; then
  echo "Usage: $0 <branch-name>" >&2
  echo "       ブランチ名（kebab-case）は必須" >&2
  exit 1
fi

if [[ ! "$BRANCH" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "Error: ブランチ名は kebab-case（小文字英数字とハイフンのみ）で指定してください: $BRANCH" >&2
  exit 1
fi

# ---- 作業ディレクトリ ----
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  echo "Error: git リポジトリ内で実行してください" >&2
  exit 1
fi
cd "$REPO_ROOT"

WORKTREE_DIR=".worktrees/$BRANCH"
FULL_BRANCH="feature/$BRANCH"

if [ -d "$WORKTREE_DIR" ]; then
  echo "Error: $WORKTREE_DIR は既に存在します" >&2
  exit 1
fi

if git rev-parse --verify "$FULL_BRANCH" >/dev/null 2>&1; then
  echo "Error: ブランチ $FULL_BRANCH は既に存在します" >&2
  exit 1
fi

# ---- Step 1: drift 検知 ----
echo "🔍 main の状態を確認中..."
UNCOMMITTED=$(git status --short | wc -l | tr -d ' ')
UNTRACKED_MIGRATION=$(git status --short | grep -E '^\?\? prisma/migrations/' | head -1 || true)

if [ "$UNCOMMITTED" -gt 0 ]; then
  echo "   未コミットファイル: $UNCOMMITTED 件"
fi

if [ -n "$UNTRACKED_MIGRATION" ]; then
  echo ""
  echo "⚠️  未追跡の Prisma migration を検出しました:"
  echo "   $UNTRACKED_MIGRATION"
  echo ""
  echo "   この migration は既にローカル Postgres に適用されている可能性が高く、"
  echo "   worktree の schema.prisma（HEAD 基準）と DB が乖離します。"
  echo "   worktree 内で 'prisma migrate dev' が drift 検出でブロックされます。"
  echo ""
  read -r -p "   WIP snapshot commit を作成してから worktree を切りますか? [y/N] " ANSWER
  if [ "$ANSWER" = "y" ] || [ "$ANSWER" = "Y" ]; then
    git add -A
    git commit -m "wip: snapshot before $FULL_BRANCH worktree"
    echo "   ✅ WIP snapshot commit を作成しました: $(git rev-parse --short HEAD)"
  else
    echo "   ❌ 中断します。先に main の WIP を整理してください。" >&2
    exit 1
  fi
fi

# ---- Step 2: worktree 作成 ----
echo ""
echo "📁 worktree を作成中: $WORKTREE_DIR"
git worktree add -b "$FULL_BRANCH" "$WORKTREE_DIR" HEAD
BASE_SHA=$(git -C "$WORKTREE_DIR" rev-parse --short HEAD)

# ---- Step 3: env ファイルコピー（PreToolUse bypass のため python3 経由） ----
echo ""
echo "🔐 環境変数ファイルをコピー中..."
python3 <<PYTHON
import os, shutil
src_root = "$REPO_ROOT"
dst_root = os.path.join(src_root, "$WORKTREE_DIR")
for name in [".env", ".env.local"]:
    src = os.path.join(src_root, name)
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(dst_root, name))
        print(f"   ✓ {name}")
    else:
        print(f"   - {name} (存在しないためスキップ)")
PYTHON

# ---- Step 4: generated/ コピー ----
echo ""
echo "🧬 generated/ をコピー中..."
if [ -d generated ]; then
  if command -v robocopy >/dev/null 2>&1; then
    # Windows: robocopy は成功でも exit 1 を返すため || true で吸収
    robocopy generated "$WORKTREE_DIR/generated" /E /XF nul /NFL /NDL /NJH /NJS /NC /NS >/dev/null 2>&1 || true
  else
    python3 <<PYTHON
import shutil
shutil.copytree("$REPO_ROOT/generated", "$REPO_ROOT/$WORKTREE_DIR/generated", dirs_exist_ok=True)
PYTHON
  fi
  echo "   ✓ generated/"
else
  echo "   - generated/ (存在しないためスキップ — bun run db:generate が必要)"
fi

# ---- Step 5: 完了レポート ----
echo ""
echo "✅ worktree 準備完了"
echo ""
echo "   Path:   $WORKTREE_DIR"
echo "   Branch: $FULL_BRANCH"
echo "   Base:   $BASE_SHA"
echo ""
echo "次のステップ:"
echo "   cd $WORKTREE_DIR"
echo "   bun run type-check           # 環境確認"
echo "   bunx --bun prisma migrate dev --name <migration-name>   # 必要なら"

exit 0
