#!/usr/bin/env bash
# Lefthook pre-commit guard for protected files.
# AGENTS.md ハードルール:
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
#
# baseline (`00000000000000_init`) だけは例外にできる。**ただし無条件ではない。**
# このガードの目的は「適用済み migration の手編集を防ぐ」ことで、baseline は
# `scripts/build-baseline-migration.ts` の**生成物**（ファイル冒頭にも「手で編集しない」と
# 書いてある）。そこで「生成し直した結果と 1 バイトも違わないこと」を実際に確かめ、
# 一致する場合だけ通す。手で 1 文字でも足せば不一致になって止まる。
BASELINE_SQL='prisma/migrations/00000000000000_init/migration.sql'
modified_migrations=$(printf '%s\n' "$staged_modified" | grep -E '^prisma/migrations/.*\.sql$' || true)

if [ -n "$modified_migrations" ]; then
  non_baseline=$(printf '%s\n' "$modified_migrations" | grep -vFx "$BASELINE_SQL" || true)

  if [ -n "$non_baseline" ]; then
    echo "❌ prisma/migrations/*.sql は手編集不可です: $non_baseline" >&2
    echo "   マイグレーション変更は bunx --bun prisma migrate dev で再生成してください" >&2
    echo "   （新規 migration の追加は許可されます — この hook は既存ファイルの改変のみブロックします）" >&2
    exit 1
  fi

  regenerated=$(mktemp)
  trap 'rm -f "$regenerated"' EXIT
  if ! bun scripts/build-baseline-migration.ts --out "$regenerated" --force >/dev/null 2>&1; then
    echo "❌ baseline を生成し直せませんでした（builder が失敗）" >&2
    exit 1
  fi
  if ! diff -q "$BASELINE_SQL" "$regenerated" >/dev/null 2>&1; then
    echo "❌ baseline が生成結果と一致しません（手編集の疑い）" >&2
    echo "   bun scripts/build-baseline-migration.ts --force で作り直してください" >&2
    exit 1
  fi
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
