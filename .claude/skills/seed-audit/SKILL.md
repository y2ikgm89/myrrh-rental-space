---
name: seed-audit
description: prisma/seed.ts の網羅性を検証する。Prisma enum 全値が seed で使われているか、全モデルに seed 関数が存在するか、seedAll / seedDemo に登録されているか、upsert で idempotent 化されているかを検出する。新規モデル追加後・enum 値追加後・定期メンテで使用。
---

# Seed 網羅性監査

`prisma/seed.ts`（現状 ~3700 行・28 seed 関数）と `prisma/schema.prisma` を照合し、seed 未網羅を検出する。
CLAUDE.md ハードルール「enum 値を seed に網羅」「3 点セット（schema + seed + admin-ui）同時作成」「upsert で idempotent 化」の機械的検証版。

## 実行タイミング

- 新規 Prisma モデル追加後（schema + seed + admin-ui の 3 点セット検証）
- 新規 enum 値追加後（全値が seed で少なくとも 1 レコード使われているか）
- `seedEmailTemplates` 追加のような新 seed 関数実装時（`seedAll` / `seedDemo` 登録漏れ検出）
- 月次メンテ

## チェック項目

### 1. Prisma enum 全値カバレッジ

各 enum の値が seed のどこかで少なくとも 1 回使われているか。

```bash
# enum 定義を抽出（例: Role, ReservationStatus 等 34 種）
grep -nE "^enum " prisma/schema.prisma | awk '{print $2}' > /tmp/enum-names.txt

# 各 enum 値の使用チェック
awk '
  /^enum / { name=$2; inside=1; next }
  inside && /^}/ { inside=0; next }
  inside && /^  [A-Z]/ { print name"|"$1 }
' prisma/schema.prisma | while IFS='|' read enum value; do
  if ! grep -q "$enum\.$value\b\|\"$value\"" prisma/seed.ts; then
    echo "❌ $enum.$value が seed 未使用"
  fi
done
```

### 2. 全モデルに seed 関数が存在するか

```bash
# 全 Prisma モデル抽出
grep -nE "^model " prisma/schema.prisma | awk '{print $2}' > /tmp/model-names.txt

# seed 関数の model 参照チェック
while read model; do
  # PascalCase → camelCase 変換
  lc=$(echo "$model" | awk '{print tolower(substr($0,1,1)) substr($0,2)}')
  if ! grep -qE "prisma\.${lc}\.(create|upsert|createMany)" prisma/seed.ts; then
    echo "⚠️  モデル $model に対応する seed が不在（中継テーブルなら正常）"
  fi
done < /tmp/model-names.txt
```

**除外**: 中継テーブル（`UserPageAssignment` 等）は親モデルの seed 内で `connect` / `createMany` される設計のため false positive になる。手動判断。

### 3. seedAll / seedDemo 登録チェック

新規 seed 関数を作成しても `seedAll` / `seedDemo` に登録しないと実行されない（CLAUDE.md 明記）。

```bash
# seed 関数一覧
grep -nE "^async function seed[A-Z]" prisma/seed.ts | awk -F'[ (]' '{print $3}' | sort > /tmp/seed-fns.txt

# seedAll / seedDemo 内の呼び出し抽出
awk '/^async function seedAll/,/^}/' prisma/seed.ts | grep -oE "seed[A-Z][a-zA-Z]+\(" | tr -d '(' | sort -u > /tmp/seedall-calls.txt
awk '/^async function seedDemo/,/^}/' prisma/seed.ts | grep -oE "seed[A-Z][a-zA-Z]+\(" | tr -d '(' | sort -u > /tmp/seeddemo-calls.txt

# seedAll 未登録
comm -23 /tmp/seed-fns.txt /tmp/seedall-calls.txt | sed 's/^/❌ seedAll 未登録: /'

# seedDemo 未登録
comm -23 /tmp/seed-fns.txt /tmp/seeddemo-calls.txt | sed 's/^/⚠️  seedDemo 未登録（demo 不要なら OK）: /'
```

### 4. upsert 使用 / idempotent 化

`deleteMany + create` パターンは `--demo` で既存破壊リスク。CLAUDE.md ハードルール「Seed 関数は `upsert` で idempotent 化」。

```bash
# deleteMany + create のアンチパターン検出
awk '/^async function seed[A-Z]/,/^}/' prisma/seed.ts | \
  grep -nE "prisma\.[a-zA-Z]+\.deleteMany|prisma\.[a-zA-Z]+\.create\b" | \
  head -50

# 明示的: 各 seed 関数内で upsert または createMany + skipDuplicates が使われているか
for fn in $(grep -oE "^async function seed[A-Z][a-zA-Z]+" prisma/seed.ts | awk '{print $3}'); do
  has_upsert=$(awk "/^async function $fn/,/^}/" prisma/seed.ts | grep -c "\.upsert\|skipDuplicates: true")
  has_delete=$(awk "/^async function $fn/,/^}/" prisma/seed.ts | grep -c "\.deleteMany")
  if [ "$has_upsert" -eq 0 ] && [ "$has_delete" -gt 0 ]; then
    echo "❌ $fn: deleteMany + create（idempotent 化要検討）"
  fi
done
```

### 5. Lexical JSON 同時保存チェック（Terms / News / Post / Section / Space）

CLAUDE.md ハードルール「Terms / News / Post / Section / Space の seed は Lexical JSON 同時保存必須。`contentHtml` 単独禁止」。

```bash
# contentHtml のみの seed を検出（contentJson / buildParagraphEditorStateJson 不在）
for model in "term" "news" "post" "space"; do
  awk "/^async function seed/,/^}/" prisma/seed.ts | \
    grep -B5 "prisma\.${model}\." | \
    grep -E "contentHtml:" | \
    while read line; do
      # 同じブロック内に contentJson があるか要手動確認
      echo "要確認: $model seed - contentHtml: あり"
    done
done

# buildParagraphEditorStateJson インポート確認
grep -c "buildParagraphEditorStateJson\|buildParagraphHtml" prisma/seed.ts
```

### 6. enum 依存テンプレート / Meta の網羅性

CLAUDE.md:「enum がテンプレート/UI Meta を持つ場合は +3 箇所」— 例: `TermsType` は `TERMS_TYPES` 配列 + `TERMS_TYPE_META` + `TERMS_TEMPLATES` Record。

手動チェック対象:

- `TermsType` — `src/shared/lib/terms-templates.ts` の `TERMS_TEMPLATES` に各値のエントリ
- `SectionType` — `src/shared/lib/validations/section-defaults.ts` / `section-metadata.ts`
- enum 追加時に `add-prisma-enum` skill で 8 箇所更新 + テンプレ/Meta 3 箇所

```bash
# TermsType 値とテンプレート対応
grep -oE "^  [A-Z_]+\s*$" prisma/schema.prisma | \
  awk '/enum TermsType/,/^}/' prisma/schema.prisma | \
  grep -oE "^  [A-Z_]+" | tr -d ' ' | \
  while read val; do
    grep -q "\[TermsType\.$val\]\|'$val':" src/shared/lib/terms-templates.ts || \
      echo "❌ TERMS_TEMPLATES に TermsType.$val のエントリ不在"
  done
```

## 出力フォーマット

```markdown
## Seed 網羅性監査レポート

### 総評

- Prisma モデル: X 件、seed 関数: Y 件（中継テーブル Z 件は seed 不要）
- Enum 34 種、未使用 enum 値: N 件
- seedAll 未登録: N 件、seedDemo 未登録: N 件
- Idempotent 化未対応: N 件

### 詳細

#### ❌ seedAll 未登録

- `seedEmailTemplates` — 新規作成後 `seedAll` 呼び出しチェーンに追加漏れ

#### ❌ Enum 値未使用

- `TermsType.COOKIE_POLICY` — seedTerms 内で使用なし。全 enum 値を seed に網羅（ハードルール）
- `ReservationStatus.REFUNDED` — seedReservations 内で使用なし

#### ⚠️ Idempotent 化未対応

- `seedBlogTags`: deleteMany + create → upsert 化推奨

### ✅ 網羅済み

- seed 関数 25 件が `seedAll` チェーンに全て登録済み
- Role enum 全 6 値が使用されている

### 手動確認が必要

- `TermsType` の `TERMS_TEMPLATES` / `TERMS_TYPE_META` 追従（コード抽出困難）
- Lexical JSON 同時保存: terms/news/post/space seed 内で `buildParagraphEditorStateJson()` が使われているか
```

## 関連 skill / rule

- `add-prisma-enum` — enum 新規追加時の 8 箇所同時更新スキャフォールド
- `create-admin-page` — モデル 3 点セット（schema + seed + admin-ui）
- `.claude/rules/gotchas.md` — 「Seed 関数は upsert で idempotent 化 + seedAll / seedDemo 両方に登録」
- `CLAUDE.md` §実装パターン — Prisma enum 追加の 8 箇所同時更新

## 参照実装

- `seedEmailTemplates` — upsert idempotent 化の参照
- `seedTerms` — Lexical JSON 同時保存の参照（`buildParagraphEditorStateJson` 使用）
- `prisma/seed.ts:3568` — `seedAll` 本体
- `prisma/seed.ts:3620` — `seedDemo` 本体
