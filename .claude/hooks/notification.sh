#!/usr/bin/env bash
# Notification hook: 公式 terminalSequence パターン採用 (Claude Code v2.1.141+)
#
# 出典: https://code.claude.com/docs/en/hooks#notification
#
# 公式設計:
# - Hooks は controlling terminal なしで実行されるため /dev/tty 書き込みは fail
# - 代替として terminalSequence field に escape sequence を返すと
#   Claude Code が自身の terminal write path で emit する
# - race-free + tmux/screen 内動作 + Windows (/dev/tty 不在) 対応
#
# Escape sequence allowlist (公式 security):
# - OSC 0/1/2: window/icon title
# - OSC 9: iTerm2 / ConEmu / Windows Terminal / WezTerm notifications (Toast / Action Center)
# - OSC 99: Kitty notifications
# - OSC 777: urxvt / Ghostty / Warp notifications
# - BEL: 普遍的な attention signal
#
# 本実装は OSC 9 + OSC 777 + BEL を併用し、modern terminal の互換性最大化。

set -euo pipefail
: "${CLAUDE_PROJECT_DIR:=$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

INPUT=$(cat)
TITLE="Claude Code"
BODY=$(printf '%s' "$INPUT" | jq -r '.message // "Needs your attention"' 2>/dev/null || echo "Needs your attention")

# Concatenated escape sequences (各 terminal は解釈できる sequence のみ反応):
# - OSC 9 "<title>: <body>": Windows Terminal / iTerm2 / ConEmu / WezTerm
# - OSC 777 "notify;<title>;<body>": urxvt / Ghostty / Warp
# - 末尾 BEL: notification API 非対応 terminal の fallback attention
SEQ=$(printf '\033]9;%s: %s\007\033]777;notify;%s;%s\007\007' "$TITLE" "$BODY" "$TITLE" "$BODY")

jq -nc --arg seq "$SEQ" '{terminalSequence: $seq}'
exit 0
