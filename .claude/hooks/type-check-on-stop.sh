#!/bin/bash
# Stop hook: TypeScript ファイルが変更された時のみ型チェックを実行
# 未コミット変更（staged + unstaged）を確認
# クールダウン: 最後の実行から 120 秒以内は再実行しない

set -euo pipefail

cd "$CLAUDE_PROJECT_DIR" || exit 0

# --- クールダウン（120秒） ---
SENTINEL="/tmp/claude-type-check-$(echo "$CLAUDE_PROJECT_DIR" | tr '/\\:' '---').last"
COOLDOWN=120
if [[ -f "$SENTINEL" ]]; then
  LAST_RUN=$(cat "$SENTINEL" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  ELAPSED=$(( NOW - LAST_RUN ))
  if (( ELAPSED < COOLDOWN )); then
    exit 0
  fi
fi

# 変更済みファイル（staged/unstaged）と新規未追跡ファイルの両方を検出
# `if` 条件式内は set -e の対象外（Bash 仕様）なので grep -q が安全に使える
CHANGED=$(
  git diff --name-only HEAD 2>/dev/null
  git ls-files --others --exclude-standard 2>/dev/null
)
if ! printf '%s\n' "$CHANGED" | grep -qE '\.(ts|tsx)$'; then
  exit 0
fi

# センチネル更新（実行開始時点で記録）
date +%s > "$SENTINEL"

echo ""
echo "📝 TypeScript ファイルが変更されました。型チェックを実行します..."
echo ""

# ~/.bun/bin を PATH に追加（Stop hook は環境変数が限定的）
export PATH="$HOME/.bun/bin:$PATH"

bun run type-check
