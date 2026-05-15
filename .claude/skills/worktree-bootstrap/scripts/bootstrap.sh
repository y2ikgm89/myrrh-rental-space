#!/usr/bin/env bash
# worktree-bootstrap: 隔離 worktree 作成（legacy manual fallback）
#
# NOTE: 公式 `claude --worktree <name>` が canonical 経路。本スクリプトは以下のケースで使用:
#   - dev server を main で常駐させたまま手動で別 worktree を切りたい
#   - subagent dispatch 以外で外部ツール（VS Code 等）から直接開きたい
#   - `--worktree` で trust dialog がまだ accept されていない初回セットアップ
#
# 公式機能と重複する以下を本スクリプトは自前実装（公式 --worktree 経路では不要）:
#   - .env / generated/ コピー（公式は .worktreeinclude で自動）
#   - WIP snapshot commit（公式は worktree.baseRef: "head" で取込み）
#
# Usage:
#   bash .claude/skills/worktree-bootstrap/scripts/bootstrap.sh <branch-name>
#
# Steps:
#   1. main の状態確認（uncommitted / 未追跡 migration 検出）
#   2. git worktree add -b feature/<branch> .worktrees/<branch> HEAD
#   3. .worktreeinclude に沿って .env / generated/ を copy
#   4. 完了レポート（パス / branch / base SHA）

set -euo pipefail

# ---- 引数 ----
BRANCH="${1:-}"
if [ -z "$BRANCH" ]; then
  echo "Usage: $0 <branch-name>" >&2
  echo "       ブランチ名（kebab-case）は必須" >&2
  echo "" >&2
  echo "Hint: 公式の \`claude --worktree <name>\` を使うと .worktreeinclude が自動適用される。" >&2
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
  echo "       cleanup: bash .claude/skills/worktree-bootstrap/scripts/cleanup.sh $BRANCH" >&2
  exit 1
fi

if git rev-parse --verify "$FULL_BRANCH" >/dev/null 2>&1; then
  echo "Error: ブランチ $FULL_BRANCH は既に存在します" >&2
  echo "       既存 branch を使う場合: git worktree add $WORKTREE_DIR $FULL_BRANCH" >&2
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

# ---- Step 3: .worktreeinclude に沿って gitignored ファイルを copy ----
echo ""
echo "🔐 .worktreeinclude のパターンを適用中..."
INCLUDE_FILE="$REPO_ROOT/.worktreeinclude"

if [ ! -f "$INCLUDE_FILE" ]; then
  echo "   ⚠️  .worktreeinclude が見つかりません。コピー処理をスキップします。"
  echo "      公式仕様: https://code.claude.com/docs/en/worktrees#copy-gitignored-files-into-worktrees"
else
  python3 - "$REPO_ROOT" "$WORKTREE_DIR" "$INCLUDE_FILE" <<'PYTHON'
import os
import shutil
import sys
from pathlib import Path

repo_root = Path(sys.argv[1])
worktree_dir = repo_root / sys.argv[2]
include_file = Path(sys.argv[3])

patterns: list[str] = []
for line in include_file.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    patterns.append(line)

copied = 0
skipped = 0

for pattern in patterns:
    # leading slash → リポジトリ root 基準
    target = pattern.lstrip("/")
    src = repo_root / target
    dst = worktree_dir / target

    if not src.exists():
        print(f"   - {pattern} (source 不在)")
        skipped += 1
        continue

    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        shutil.copytree(src, dst, dirs_exist_ok=True)
    else:
        shutil.copy2(src, dst)
    print(f"   ✓ {pattern}")
    copied += 1

print(f"   copied={copied} skipped={skipped}")
PYTHON
fi

# ---- Step 4: 完了レポート ----
echo ""
echo "✅ worktree 準備完了"
echo ""
echo "   Path:   $WORKTREE_DIR"
echo "   Branch: $FULL_BRANCH"
echo "   Base:   $BASE_SHA"
echo ""
echo "次のステップ:"
echo "   cd $WORKTREE_DIR"
echo "   bun run type-check                                          # 環境確認"
echo "   bunx --bun prisma migrate dev --name <migration-name>       # 必要なら"
echo ""
echo "完了後のクリーンアップ:"
echo "   bash .claude/skills/worktree-bootstrap/scripts/cleanup.sh $BRANCH"

exit 0
