#!/usr/bin/env bash
# SessionStart hook: 進行中の計画ファイルを表示する
# **ステータス**: 実装中|設計承認済み のメタデータ行を持つ計画のみ一覧表示
# （本文中のコード例に埋まった "実装中" 文字列は偽陽性となるため除外）

set -euo pipefail

PLANS_DIR="$CLAUDE_PROJECT_DIR/docs/plans"

echo '=== 進行中の計画 ==='

if ! grep -rlE '^\*\*ステータス\*\*: *(実装中|設計承認済み)' "$PLANS_DIR" 2>/dev/null \
    | grep -vE '(README|CLAUDE)' \
    | head -5; then
  echo '(なし)'
fi

exit 0
