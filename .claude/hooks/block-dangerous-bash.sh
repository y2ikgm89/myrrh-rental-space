#!/usr/bin/env bash
# PreToolUse hook: Block dangerous Bash commands (rm -rf, git reset --hard, etc.)
# Receives tool event JSON on stdin

set -euo pipefail

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")

[ -z "$COMMAND" ] && exit 0

# 1. rm targeting system/home directories (always blocked regardless of -r flag)
# Protects: /, /*, ~, ~/..., /c/Windows, /c/Users, /c/Program Files,
#           /home/..., /usr/, /bin/, /lib/, /etc/, /root/
# Allows:   rm -rf node_modules, rm -rf ./dist, rm -rf /g/workspace/..., rm -rf /tmp/...
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])rm\s+[^;|&]*(~(\/|[[:space:]]|$)|\/\s*$|\/\*(\s|$)|\/[cC]\/(Windows|Users|Program)|\/home\/|\/usr\/|\/bin(\/|[[:space:]]|$)|\/lib(\/|[[:space:]]|$)|\/etc\/|\/root(\/|[[:space:]]|$))'; then
  printf 'Blocked: システム・ホームディレクトリへの rm は禁止されています。\nPCのシステムファイルを保護するためブロックしました。ターミナルで直接実行してください。\n' >&2
  exit 2
fi

# 2. rm -r . (recursive deletion of current working directory — wipes entire project)
# Block: rm -rf .  → deletes CWD
# Allow: rm -rf ./node_modules  → ./ is safe (specific subdir)
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])rm\s+[^;|&]*(-[a-zA-Z]*r[a-zA-Z]*|--recursive\b)[^;|&]*[[:space:]]\.([[:space:]]|;|&|\||$)'; then
  printf 'Blocked: rm -r . はカレントディレクトリ全体を削除します。\n特定のサブディレクトリを指定してください（例: rm -rf ./node_modules）。\n' >&2
  exit 2
fi

# 3. rm with bare * argument (deletes all files in CWD — too destructive)
# Block: rm -rf *  or  rm *
# Allow: rm -rf *.log  or  rm -rf src/*.ts  (glob with extension is specific enough)
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])rm\s+[^;|&]*[[:space:]]\*([[:space:]]|;|&|\||$)'; then
  printf 'Blocked: rm * はカレントディレクトリの全ファイルを削除します。\nファイルを個別に指定するか、ターミナルで直接実行してください。\n' >&2
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
