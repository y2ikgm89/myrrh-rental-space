#!/usr/bin/env bash
# PreToolUse hook: Block dangerous Bash commands (rm -rf, git reset --hard, etc.)
# Receives tool event JSON on stdin

set -euo pipefail

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")

[ -z "$COMMAND" ] && exit 0

# 1. rm with -r flag (rm -rf, rm -r, rm -fr, etc.) or --recursive long form
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])rm\s+[^;|&]*(-[a-zA-Z]*r[a-zA-Z]*|--recursive\b)'; then
  printf 'Blocked: 再帰的削除 (rm -r/-rf/--recursive) は禁止されています。ファイル削除が必要な場合は python3 -c "import shutil; shutil.rmtree('\''path'\'')" を使用してください。\nターミナルで直接実行してください（Claude Code の Bash ツールからは実行不可）。\n' >&2
  exit 2
fi

# 2. git reset --hard
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])git\s+reset\s+--hard'; then
  printf 'Blocked: git reset --hard は禁止されています。作業ツリーの変更を破棄する操作は Claude Code の Bash ツールからは実行できません。\nターミナルで直接実行してください。\n' >&2
  exit 2
fi

# 3. git push with -f or --force (but NOT --force-with-lease)
# Strip --force-with-lease first, then check for --force or -f
COMMAND_NO_FWL=$(printf '%s' "$COMMAND" | sed 's/--force-with-lease//g')
if printf '%s' "$COMMAND_NO_FWL" | grep -qE '(^|[;&|])git\s+push\s+[^;|&]*(--force\b|-f\b)'; then
  printf 'Blocked: git push --force/-f は禁止されています。--force-with-lease は許可されています。\nターミナルで直接実行してください（Claude Code の Bash ツールからは実行不可）。\n' >&2
  exit 2
fi

# 4. git clean with -f flag
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])git\s+clean\s+[^;|&]*-[a-zA-Z]*f[a-zA-Z]*'; then
  printf 'Blocked: git clean -f は禁止されています。未追跡ファイルの削除操作は Claude Code の Bash ツールからは実行できません。\nターミナルで直接実行してください。\n' >&2
  exit 2
fi

# 5. git checkout . (trailing dot — destroys working tree)
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])git\s+checkout\s+\.(\s*$|[[:space:];|&])'; then
  printf 'Blocked: git checkout . は作業ツリー全体を破棄します。この操作は禁止されています。\nターミナルで直接実行してください（Claude Code の Bash ツールからは実行不可）。\n' >&2
  exit 2
fi

# 6. git restore . (trailing dot — destroys working tree)
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])git\s+restore\s+\.(\s*$|[[:space:];|&])'; then
  printf 'Blocked: git restore . は作業ツリー全体を破棄します。この操作は禁止されています。\nターミナルで直接実行してください（Claude Code の Bash ツールからは実行不可）。\n' >&2
  exit 2
fi

# 7. git branch with -D flag or --delete --force long form
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])git\s+branch\s+[^;|&]*(-[a-zA-Z]*D[a-zA-Z]*|--delete\b.*--force\b|--force\b.*--delete\b)'; then
  printf 'Blocked: git branch -D/--delete --force は禁止されています。ブランチの強制削除は Claude Code の Bash ツールからは実行できません。\nターミナルで直接実行してください。\n' >&2
  exit 2
fi

# 8. diskpart or format <drive>:
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])(diskpart|format\s+[a-zA-Z]:)'; then
  printf 'Blocked: diskpart および format コマンドは禁止されています。ディスク操作は Claude Code の Bash ツールからは実行できません。\nターミナルで直接実行してください。\n' >&2
  exit 2
fi

exit 0
