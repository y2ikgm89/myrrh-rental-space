#!/usr/bin/env bash
# Stop hook (asyncRewake: true): 背景で type-check を実行し、失敗時のみ exit 2 で
# モデルを起こして修正させる。
#
# 公式仕様（code.claude.com/docs/en/hooks#command-hook-fields）:
#   asyncRewake=true は hook を非ブロッキング実行し、exit 2 のときだけ Claude を
#   wake up してフィードバックを注入する。
#
# 無限ループ対策:
#   exit 2 で wake した Claude が再度 Stop すると本 hook が再発火する。
#   stop_hook_active=true はその再発火を示すフラグ。2 回目以降は exit 0 で終了し、
#   無限ループを防ぐ（公式 "Stop hook runs forever" 対策パターン）。
#
# 挙動:
#   - stop_hook_active=true      → exit 0（wake chain を断つ）
#   - TypeScript ファイル変更なし → exit 0
#   - type-check 成功             → exit 0
#   - type-check 失敗             → exit 2 + stderr にエラー要約

set -euo pipefail

: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

cd "$CLAUDE_PROJECT_DIR" || exit 0

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")

# 再発火チェーンなら即終了（無限ループ防止）
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# 変更済みファイル（staged/unstaged）と新規未追跡ファイルを検出
CHANGED=$(
  git diff --name-only HEAD 2>/dev/null
  git ls-files --others --exclude-standard 2>/dev/null
)

if ! printf '%s\n' "$CHANGED" | grep -qE '\.(ts|tsx)$'; then
  exit 0
fi

# ~/.bun/bin を PATH に追加（Stop hook は環境変数が限定的）
export PATH="$HOME/.bun/bin:$PATH"

LOG=$(mktemp)
if bun run type-check > "$LOG" 2>&1; then
  rm -f "$LOG"
  exit 0
fi

# 失敗: stderr にエラー要約を流し exit 2 で Claude を wake
{
  echo "type-check 失敗。以下のエラーを修正してください:"
  tail -40 "$LOG"
} >&2
rm -f "$LOG"
exit 2
