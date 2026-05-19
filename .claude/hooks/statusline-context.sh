#!/usr/bin/env bash
set -euo pipefail
: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# 公式仕様: stdin に JSON、stdout に表示文字列
# https://code.claude.com/docs/en/statusline
# kitchen sink session 対策で context_window.used_percentage を可視化

INPUT=$(cat)

MODEL=$(printf '%s' "$INPUT" | jq -r '.model.display_name // "Claude"')
DIR=$(printf '%s' "$INPUT" | jq -r '.workspace.current_dir // .cwd // ""')
PCT=$(printf '%s' "$INPUT" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
WT=$(printf '%s' "$INPUT" | jq -r '.workspace.git_worktree // ""')
BRANCH=$(git -C "$DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
COST=$(printf '%s' "$INPUT" | jq -r '.cost.total_cost_usd // 0' | awk '{ printf "%.2f", $1 }')

# context % で色変更 — kitchen sink 早期警告
# < 60% green / 60-79% yellow / 80-94% red / >= 95% blink red
if [ "$PCT" -ge 95 ]; then
  CTX_COLOR=$'\033[5;91m'  # blink red
elif [ "$PCT" -ge 80 ]; then
  CTX_COLOR=$'\033[91m'    # bright red
elif [ "$PCT" -ge 60 ]; then
  CTX_COLOR=$'\033[93m'    # yellow
else
  CTX_COLOR=$'\033[92m'    # green
fi
RESET=$'\033[0m'
DIM=$'\033[2m'

WT_SEG=""
if [ -n "$WT" ]; then
  WT_SEG=" ${DIM}wt:${RESET}${WT}"
fi

# format: [Model] branch[ wt:name] | ctx N% | dir | $cost
echo -e "${DIM}[${MODEL}]${RESET} ${BRANCH}${WT_SEG} ${DIM}|${RESET} ${CTX_COLOR}ctx ${PCT}%${RESET} ${DIM}|${RESET} ${DIR##*/} ${DIM}|${RESET} \$${COST}"
