#!/usr/bin/env bash
# PreToolUse hook: Block dangerous Bash commands (rm -rf, git reset --hard, etc.)
# Receives tool event JSON on stdin
#
# 公式仕様（code.claude.com/docs/en/hooks#permissiondecision）:
#   PreToolUse の deny は hookSpecificOutput.permissionDecision = "deny" + reason を
#   exit 0 で出力する。

set -euo pipefail

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")

[ -z "$COMMAND" ] && exit 0

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# 1. rm targeting system/home directories (always blocked regardless of -r flag)
# Protects: /, /*, ~, ~/..., /c/Windows, /c/Users, /c/Program Files,
#           /home/..., /usr/, /bin/, /lib/, /etc/, /root/
# Allows:   rm -rf node_modules, rm -rf ./dist, rm -rf /tmp/..., rm -rf <project>/subdir
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])rm\s+[^;|&]*(~(\/|[[:space:]]|$)|\/\s*$|\/\*(\s|$)|\/[cC]\/(Windows|Users|Program)|\/home\/|\/usr\/|\/bin(\/|[[:space:]]|$)|\/lib(\/|[[:space:]]|$)|\/etc\/|\/root(\/|[[:space:]]|$))'; then
  deny "Blocked: システム・ホームディレクトリへの rm は禁止されています。PCのシステムファイルを保護するためブロックしました。ターミナルで直接実行してください。"
fi

# 1b. rm targeting the project root itself (block exact match, allow subdirectories)
# Uses CLAUDE_PROJECT_DIR if available. Normalizes both Windows (G:\...) and MINGW (/g/...) forms.
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
  # Normalize to MINGW form: G:\foo\bar → /g/foo/bar
  PROJECT_MINGW=$(printf '%s' "$CLAUDE_PROJECT_DIR" | sed -E 's#^([A-Za-z]):#/\L\1#; s#\\#/#g')
  # Escape for regex
  PROJECT_ESC=$(printf '%s' "$PROJECT_MINGW" | sed 's#[/.]#\\&#g')
  if printf '%s' "$COMMAND" | grep -qE "(^|[;&|])rm\s+[^;|&]*[[:space:]]${PROJECT_ESC}/?([[:space:]]|;|&|\||$)"; then
    deny "Blocked: プロジェクトルート全体への rm は禁止されています。サブディレクトリを指定してください（例: rm -rf <project>/node_modules）。"
  fi
fi

# 2. rm -r . (recursive deletion of current working directory — wipes entire project)
# Block: rm -rf .  → deletes CWD
# Allow: rm -rf ./node_modules  → ./ is safe (specific subdir)
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])rm\s+[^;|&]*(-[a-zA-Z]*r[a-zA-Z]*|--recursive\b)[^;|&]*[[:space:]]\.([[:space:]]|;|&|\||$)'; then
  deny "Blocked: rm -r . はカレントディレクトリ全体を削除します。特定のサブディレクトリを指定してください（例: rm -rf ./node_modules）。"
fi

# 3. rm with bare * argument (deletes all files in CWD — too destructive)
# Block: rm -rf *  or  rm *
# Allow: rm -rf *.log  or  rm -rf src/*.ts  (glob with extension is specific enough)
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])rm\s+[^;|&]*[[:space:]]\*([[:space:]]|;|&|\||$)'; then
  deny "Blocked: rm * はカレントディレクトリの全ファイルを削除します。ファイルを個別に指定するか、ターミナルで直接実行してください。"
fi

# 4. git reset --hard
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])git\s+reset\s+--hard'; then
  deny "Blocked: git reset --hard は禁止されています。作業ツリーの変更を破棄する操作は Claude Code の Bash ツールからは実行できません。ターミナルで直接実行してください。"
fi

# 5. git push with -f or --force (but NOT --force-with-lease)
# Strip --force-with-lease first, then check for --force or -f
COMMAND_NO_FWL=$(printf '%s' "$COMMAND" | sed 's/--force-with-lease//g')
if printf '%s' "$COMMAND_NO_FWL" | grep -qE '(^|[;&|])git\s+push\s+[^;|&]*(--force\b|-f\b)'; then
  deny "Blocked: git push --force/-f は禁止されています。--force-with-lease は許可されています。ターミナルで直接実行してください（Claude Code の Bash ツールからは実行不可）。"
fi

# 6. git clean with -f flag
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])git\s+clean\s+[^;|&]*-[a-zA-Z]*f[a-zA-Z]*'; then
  deny "Blocked: git clean -f は禁止されています。未追跡ファイルの削除操作は Claude Code の Bash ツールからは実行できません。ターミナルで直接実行してください。"
fi

# 7. git checkout . (trailing dot — destroys working tree)
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])git\s+checkout\s+\.(\s*$|[[:space:];|&])'; then
  deny "Blocked: git checkout . は作業ツリー全体を破棄します。この操作は禁止されています。ターミナルで直接実行してください（Claude Code の Bash ツールからは実行不可）。"
fi

# 8. git restore . (trailing dot — destroys working tree)
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])git\s+restore\s+\.(\s*$|[[:space:];|&])'; then
  deny "Blocked: git restore . は作業ツリー全体を破棄します。この操作は禁止されています。ターミナルで直接実行してください（Claude Code の Bash ツールからは実行不可）。"
fi

# 9. git branch with -D flag or --delete --force long form
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])git\s+branch\s+[^;|&]*(-[a-zA-Z]*D[a-zA-Z]*|--delete\b.*--force\b|--force\b.*--delete\b)'; then
  deny "Blocked: git branch -D/--delete --force は禁止されています。ブランチの強制削除は Claude Code の Bash ツールからは実行できません。ターミナルで直接実行してください。"
fi

# 10. diskpart or format <drive>:
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])(diskpart|format\s+[a-zA-Z]:)'; then
  deny "Blocked: diskpart および format コマンドは禁止されています。ディスク操作は Claude Code の Bash ツールからは実行できません。ターミナルで直接実行してください。"
fi

# 11. sudo (privilege escalation)
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])sudo\b'; then
  deny "Blocked: sudo は禁止されています。権限昇格を伴う操作は Claude Code の Bash ツールからは実行できません。ターミナルで直接実行してください。"
fi

# 12. chmod (permission changes)
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|])chmod\b'; then
  deny "Blocked: chmod は禁止されています。ファイル権限変更は Claude Code の Bash ツールからは実行できません。ターミナルで直接実行してください。"
fi

# 13. Windows destructive commands: del /s|/q, rd /s, rmdir /s
if printf '%s' "$COMMAND" | grep -qiE '(^|[;&|])(del\s+[^;|&]*\/[sq]|rd\s+[^;|&]*\/s|rmdir\s+[^;|&]*\/s)'; then
  deny "Blocked: Windows の再帰削除コマンド（del /s|/q, rd /s, rmdir /s）は禁止されています。ターミナルで直接実行してください。"
fi

# 14. Reading .env files via Bash (cat, less, more, head, tail, source, .)
# Match only at command position (start of line or after ; && || | () or newline),
# not inside string arguments like echo "cat .env".
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|(]|&&|\|\|)[[:space:]]*(cat|less|more|head|tail|source|\.)[[:space:]]+[^;|&]*\.env(\.[a-zA-Z0-9_.-]+)?([[:space:]]|;|&|\||$)'; then
  deny "Blocked: .env ファイルの読み取りは禁止されています。環境変数は Cloud Run コンソールまたは .env.example を通じて確認してください。"
fi

exit 0
