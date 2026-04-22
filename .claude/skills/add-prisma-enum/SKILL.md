---
name: add-prisma-enum
description: >
  Prisma enum を新規追加する 8 箇所同時更新パターンをスキャフォールドする。
  schema.prisma + migration → prisma-types re-export → guards 型ガード →
  helpers ラベル + parseFilter → validation スキーマ →
  domain types + queries + commands → Server Actions + 公開フォーム →
  管理 UI + seed + テスト。新しい enum 型（`Role` / `ReservationStatus` 等）
  を追加する際に使用。
argument-hint: <EnumName> <Value1> <Value2> [<Value3> ...] [--model=<ModelName>] [--field=<fieldName>]
---

# Prisma enum 追加スキャフォールダー

Prisma enum を新規追加する 8 箇所同時更新を案内・実行する。CLAUDE.md §実装パターン
「Prisma enum 新規追加は 8 箇所同時更新」の silent bug 防止。

## 引数

```
/add-prisma-enum <EnumName> <Value1> <Value2> [...] [--model=<Model>] [--field=<field>]
```

- `EnumName`: Prisma enum 名（PascalCase、例: `CouponType`, `PaymentMethod`）
- `Value1 Value2 ...`: enum 値（UPPER_SNAKE_CASE、例: `FIXED PERCENTAGE`）
- `--model=`: 紐づけるモデル名（任意）、`--field=`: フィールド名（任意、default: enum の camelCase）

引数が不足している場合はユーザーに確認する。

## Step 1: enum 定義の解析

| 変数             | 例（`CouponType` + `FIXED` / `PERCENTAGE`）                       |
| ---------------- | ----------------------------------------------------------------- |
| `EnumName`       | `CouponType`                                                      |
| `ENUM_UPPER`     | `COUPON_TYPE`                                                     |
| `enumCamel`      | `couponType`                                                      |
| 値リスト         | `["FIXED", "PERCENTAGE"]`                                         |
| 日本語ラベル候補 | ユーザーに確認（例: `{ FIXED: "固定額", PERCENTAGE: "割引率" }`） |

## Step 2: 更新対象ファイルの確認

```bash
ls 'prisma/schema.prisma' \
   'src/shared/lib/validations/enums/prisma-types.ts' \
   'src/shared/lib/validations/enums/guards.ts' \
   'src/shared/lib/validations/enums/helpers.ts'
```

## Step 3: 8 箇所の更新

各箇所のコード例・注意事項は `reference/examples.md` を参照。

1. **① `prisma/schema.prisma`** — enum 定義 + `--model` 指定時はモデルへフィールド追加。マイグレーションは別途 `/prisma-migration` で実行（`add_<enum_snake>` 命名推奨）
2. **② `enums/prisma-types.ts`** — `@generated/prisma/client` からの re-export に追加（gateway モジュール）
3. **③ `enums/guards.ts`** — `VALID_*` Set + `isValid*` 型ガード関数を追加（Prisma enum のみ。DB VARCHAR は `helpers.ts`）
4. **④ `enums/helpers.ts`** — `<ENUM_UPPER>_LABELS` Record + `<enumCamel>FilterValues` tuple + `<ENUM_UPPER>_BADGE_VARIANTS` を追加
5. **⑤ validation スキーマ** — 対応する `src/shared/lib/validations/<domain>.ts` に `z.enum()` を追加
6. **⑥ Domain 層** — `types.ts` + `queries.ts`（select に追加）+ `commands.ts`（create/update で受け取り）
7. **⑦ Server Actions + 公開フォーム** — Select の `onValueChange` は `as` 禁止、`isValid<EnumName>()` で narrow
8. **⑧ 管理 UI + seed + テスト** — `_LABELS` / `_BADGE_VARIANTS` 経由、seed は**全 enum 値を網羅**

## Step 4: 生成後チェックリスト

- [ ] `bunx --bun prisma migrate dev --name add_<enum_snake>` でマイグレーション実行
- [ ] `bun run db:generate` で Prisma クライアント再生成
- [ ] `prisma-types.ts` / `guards.ts` / `helpers.ts` の 3 ファイルを 1 implementer にバンドル
- [ ] seed に全 enum 値を網羅（enum 追加時の代表的な silent bug）
- [ ] admin UI の Select / フィルタ / Badge に `_LABELS` / `_BADGE_VARIANTS` 経由で反映
- [ ] 公開ページ Badge は `Record<Enum, PublicBadgeVariant>` を別定義
- [ ] `bun run validate` で型ガード `isValid*` / ラベル Record の網羅性エラーなし確認
- [ ] `architecture-boundaries.test.ts` で gateway re-export 規約確認

## 注意事項

- **①〜③ は 1 implementer にバンドル** — schema + gateway + 型ガードは密結合、分割 dispatch は型エラーの中間状態を生む
- **seed は全 enum 値網羅** — 管理画面 EmptyState で実装検証不可になる silent bug 防止
- **Select の `onValueChange` `as` 禁止** — `isValid<EnumName>()` 型ガードで narrow
- **parseFilter パターン** — URL クエリフィルタは nuqs `parseAsStringLiteral(<enumCamel>FilterValues)` + sentinel `"all"`
- **後方互換性のない変更** — enum 値削除・rename は DB migration で既存レコードの変換が必要（手動）
- **enum がテンプレート/UI Meta を持つ場合は +3 箇所** — `TERMS_TYPES` 配列 + `TERMS_TYPE_META` + `TERMS_TEMPLATES` Record（→ `reference/examples.md` §テンプレート付き enum）

## 参考ファイル

- `reference/examples.md` — 各箇所のコード例・Zod 4 制約・Badge variant 使い分け
