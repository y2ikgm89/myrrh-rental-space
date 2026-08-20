#!/usr/bin/env bash
# Lefthook pre-commit guard for protected files.
# ハードルール:
#   - .env* (.example / .sample を除く)     常にブロック（秘密情報）
#   - prisma/migrations/*.sql               既存ファイルの M (modify) のみブロック
#                                           A (新規追加、prisma migrate dev 出力) は許可
#   - bun.lock                              package.json 同時 stage 時のみ許可
set -euo pipefail

staged_all=$(git diff --cached --name-only)
staged_modified=$(git diff --cached --name-only --diff-filter=M)

# .env* 検出（.example / .sample は除外）
# Next.js は `.env.$(NODE_ENV).local` を最優先で読むため、ドット複層もブロックする。
ENV_INCLUDE_RE='^\.env([.]|$)'
ENV_EXCLUDE_RE='\.(example|sample)$'
blocked_env=$(printf '%s\n' "$staged_all" | grep -E "$ENV_INCLUDE_RE" | grep -vE "$ENV_EXCLUDE_RE" || true)
if [ -n "$blocked_env" ]; then
  echo "❌ .env* ファイルはコミット禁止です（秘密情報）: $blocked_env" >&2
  exit 1
fi

# prisma/migrations/*.sql の改変検出（新規追加は許可）
#
# baseline (`00000000000000_init`) の改変は **既定で拒否**する。履歴を畳む操作
# （collapse）のときだけ `ALLOW_BASELINE_REGEN=1` で明示的に開ける。
#
# 恒久的な例外にしてはいけない。baseline が本番へ配布された後にこれを書き換えると:
#   - 既存 DB は checksum の食い違いを**無言で無視**する（実測。
#     `prisma migrate status` は "up to date" と言う）
#   - 新規 DB だけが新しい baseline を受け取り、同じ DDL を繰り返す後続 migration で落ちる
# つまり「環境ごとにスキーマが違う」状態が音もなく生まれる。
#
# 開けたときも無条件では通さない。baseline は
# `scripts/build-baseline-migration.ts` の**生成物**（ファイル冒頭にも「手で編集しない」と
# 書いてある）なので、生成し直した結果と 1 バイトも違わないことを確かめる。
BASELINE_SQL='prisma/migrations/00000000000000_init/migration.sql'
# 生成物の入力。index と worktree がずれていると検証対象が commit 内容と食い違う。
#
# **生成器そのものも入力に含める。** 下の再生成はフックが動いている worktree 版の
# builder を実行するので、builder に stage されていない変更があると
# 「commit される builder では再現できない SQL」を承認してしまう
# （逆に、worktree だけの不正な builder が不正な SQL を承認することもできる）。
BASELINE_INPUTS="prisma/schema.prisma prisma/baseline/extensions.sql prisma/baseline/invariants.sql scripts/build-baseline-migration.ts scripts/build-baseline-invariants.ts"
modified_migrations=$(printf '%s\n' "$staged_modified" | grep -E '^prisma/migrations/.*\.sql$' || true)

if [ -n "$modified_migrations" ]; then
  non_baseline=$(printf '%s\n' "$modified_migrations" | grep -vFx "$BASELINE_SQL" || true)

  if [ -n "$non_baseline" ]; then
    echo "❌ prisma/migrations/*.sql は手編集不可です: $non_baseline" >&2
    echo "   マイグレーション変更は bunx --bun prisma migrate dev で再生成してください" >&2
    echo "   （新規 migration の追加は許可されます — この hook は既存ファイルの改変のみブロックします）" >&2
    exit 1
  fi

  if [ "${ALLOW_BASELINE_REGEN:-}" != "1" ]; then
    echo "❌ baseline ($BASELINE_SQL) の改変は既定で拒否します" >&2
    echo "   本番へ配布済みの baseline を書き換えると、既存 DB は checksum の食い違いを" >&2
    echo "   無言で無視し、新規 DB だけが別のスキーマになります（環境間の分岐）。" >&2
    echo "   履歴を畳む操作のときだけ ALLOW_BASELINE_REGEN=1 を付けてください。" >&2
    exit 1
  fi

  # **index を検証する。** commit されるのは worktree ではなく staged 内容なので、
  # 「無効なものを stage → worktree を作り直す」でフックを素通りできてしまう。
  # 入力側も含めて index と worktree の一致を先に要求し、そのうえで再生成と比べる。
  unstaged=$(git diff --name-only -- "$BASELINE_SQL" $BASELINE_INPUTS)
  if [ -n "$unstaged" ]; then
    echo "❌ baseline とその入力に stage されていない差分があります: $unstaged" >&2
    echo "   commit されるのは index の内容です。検証対象と一致させてから再実行してください。" >&2
    exit 1
  fi

  regenerated=$(mktemp)
  trap 'rm -f "$regenerated"' EXIT
  if ! bun scripts/build-baseline-migration.ts --out "$regenerated" --force >/dev/null 2>&1; then
    echo "❌ baseline を生成し直せませんでした（builder が失敗）" >&2
    exit 1
  fi
  if ! git show ":$BASELINE_SQL" | diff -q - "$regenerated" >/dev/null 2>&1; then
    echo "❌ staged の baseline が生成結果と一致しません（手編集の疑い）" >&2
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
