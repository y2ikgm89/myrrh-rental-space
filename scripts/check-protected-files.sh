#!/usr/bin/env bash
# Lefthook pre-commit guard for protected files.
# CLAUDE.md ハードルール:
#   - .env* (.example / .sample を除く)     常にブロック（秘密情報）
#   - prisma/migrations/*.sql               既存ファイルの M (modify) のみブロック
#                                           A (新規追加、prisma migrate dev 出力) は許可
#   - bun.lock                              package.json 同時 stage 時のみ許可
set -euo pipefail

staged_all=$(git diff --cached --name-only)
staged_modified=$(git diff --cached --name-only --diff-filter=M)

# .env* 検出（.example / .sample は除外）
blocked_env=$(printf '%s\n' "$staged_all" | grep -E '^\.env$|^\.env\.[^.]+$' | grep -vE '\.(example|sample)$' || true)
if [ -n "$blocked_env" ]; then
  echo "❌ .env* ファイルはコミット禁止です（秘密情報）: $blocked_env" >&2
  exit 1
fi

# prisma/migrations/*.sql の改変検出（新規追加は許可）
if printf '%s\n' "$staged_modified" | grep -qE '^prisma/migrations/.*\.sql$'; then
  echo "❌ prisma/migrations/*.sql は手編集不可です" >&2
  echo "   マイグレーション変更は bunx --bun prisma migrate dev で再生成してください" >&2
  echo "   （新規 migration の追加は許可されます — この hook は既存ファイルの改変のみブロックします）" >&2
  exit 1
fi

# bun.lock は package.json 同時 stage 時のみ許可
if printf '%s\n' "$staged_all" | grep -qE '^bun\.lock$'; then
  if ! printf '%s\n' "$staged_all" | grep -qE '^package\.json$'; then
    echo "❌ bun.lock 単独コミットは禁止です" >&2
    echo "   依存更新は package.json と同時にステージしてください" >&2
    exit 1
  fi
fi

exit 0
