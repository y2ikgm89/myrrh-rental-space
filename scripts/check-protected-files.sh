#!/usr/bin/env bash
# Lefthook pre-commit guard for protected files.
# CLAUDE.md ハードルール:
#   - .env*                      常にブロック（秘密情報）
#   - prisma/migrations/*.sql    常にブロック（生成物）
#   - bun.lock                   package.json 同時 stage 時のみ許可
set -euo pipefail

staged=$(git diff --cached --name-only)

if printf '%s\n' "$staged" | grep -qE '^(\.env|\.env\..+)$'; then
  echo "❌ .env* ファイルはコミット禁止です（秘密情報）" >&2
  exit 1
fi

if printf '%s\n' "$staged" | grep -qE '^prisma/migrations/.*\.sql$'; then
  echo "❌ prisma/migrations/*.sql は手編集不可です" >&2
  echo "   マイグレーション変更は bunx --bun prisma migrate dev で再生成してください" >&2
  exit 1
fi

if printf '%s\n' "$staged" | grep -qE '^bun\.lock$'; then
  if ! printf '%s\n' "$staged" | grep -qE '^package\.json$'; then
    echo "❌ bun.lock 単独コミットは禁止です" >&2
    echo "   依存更新は package.json と同時にステージしてください" >&2
    exit 1
  fi
fi

exit 0
