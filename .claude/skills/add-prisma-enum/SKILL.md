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
- `--model=`: 紐づけるモデル名（任意、例: `Coupon`）
- `--field=`: フィールド名（任意、default: enum の camelCase）

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

8 箇所すべての対象ファイルを確認する:

```bash
ls 'prisma/schema.prisma' \
   'src/shared/lib/validations/enums/prisma-types.ts' \
   'src/shared/lib/validations/enums/guards.ts' \
   'src/shared/lib/validations/enums/helpers.ts'
```

## Step 3: 8 箇所の更新

### ① `prisma/schema.prisma` — enum 定義 + モデルへフィールド追加

enum 定義を末尾に追加:

```prisma
enum <EnumName> {
  <VALUE_1>
  <VALUE_2>
}
```

`--model` 指定時、モデル内にフィールドを追加:

```prisma
model <ModelName> {
  // ...existing fields...
  <enumCamel> <EnumName> @default(<VALUE_1>)
}
```

**注意**: マイグレーションは別途 `/prisma-migration` skill で実行（`add_<enum_snake>` 命名推奨）。

### ② `src/shared/lib/validations/enums/prisma-types.ts` — re-export

既存 `@generated/prisma/client` の re-export に追加:

```typescript
export {
  // ...existing enums...
  <EnumName>,
} from "@generated/prisma/client";
```

**注意**: gateway モジュールのため、`Prisma.JsonNull` 等の runtime sentinel 値は
対象外（`shared/db` / `shared/domain` が直接 import）。

### ③ `src/shared/lib/validations/enums/guards.ts` — 型ガード

`VALID_*` Set と `isValid*` 関数を追加:

```typescript
import { <EnumName> } from "./prisma-types";

const VALID_<ENUM_UPPER>S = new Set<string>(Object.values(<EnumName>));

export function isValid<EnumName>(value: unknown): value is <EnumName> {
  return typeof value === "string" && VALID_<ENUM_UPPER>S.has(value);
}
```

**注意**: DB VARCHAR 管理の非 Prisma enum はここに置かない（`helpers.ts` へ）。

### ④ `src/shared/lib/validations/enums/helpers.ts` — ラベル + parseFilter

日本語ラベル Record と parseFilter ヘルパーを追加:

```typescript
export const <ENUM_UPPER>_LABELS: Record<<EnumName>, string> = {
  [<EnumName>.<VALUE_1>]: "<日本語ラベル 1>",
  [<EnumName>.<VALUE_2>]: "<日本語ラベル 2>",
};

// nuqs parseAsStringLiteral 用の sentinel 含み tuple
export const <ENUM_UPPER>_FILTER_ALL = "all" as const;
export const <enumCamel>FilterValues = [
  <ENUM_UPPER>_FILTER_ALL,
  ...Object.values(<EnumName>),
] as const;
export type <EnumName>Filter = (typeof <enumCamel>FilterValues)[number];

// 管理 Badge variant（admin Badge は shadcn/ui 契約）
export const <ENUM_UPPER>_BADGE_VARIANTS: Record<<EnumName>, AdminBadgeVariant> = {
  [<EnumName>.<VALUE_1>]: "default",
  [<EnumName>.<VALUE_2>]: "secondary",
};
```

**注意**: 公開 Badge は variant 型が異なる（`"default"|"success"|"warning"|"info"`）ため、
公開ページでは `Record<<EnumName>, PublicBadgeVariant>` をコンポーネント内に別定義。

### ⑤ Validation スキーマ — Zod 4

対応する `src/shared/lib/validations/<domain>.ts` に `z.enum()` を追加:

```typescript
import { <EnumName> } from "./enums/prisma-types";

export const <enumCamel>Schema = z.enum(Object.values(<EnumName>), {
  error: "<EnumName> を選択してください",
});
```

**Zod 4 制約**: `z.enum` は `readonly [string, ...string[]]` 必須。`Object.values` は
tuple 型にならないため、狭い tuple が欲しい場合は `enums/helpers.ts` の
`<enumCamel>FilterValues`（const tuple）を参照。

### ⑥ Domain 層 — types + queries + commands

`src/shared/domain/<model>/types.ts` + `queries.ts` + `commands.ts` で新フィールドを反映:

```typescript
// types.ts
import type { <EnumName> } from "@/shared/lib/validations/enums/prisma-types";

export type <ModelName>Data = {
  // ...existing fields...
  <enumCamel>: <EnumName>;
};

// queries.ts の select に <enumCamel>: true を追加

// commands.ts の create/update で <enumCamel> を受け取る
```

### ⑦ Server Actions + 公開フォーム

`src/app/(admin)/admin/(dashboard)/_shared/actions/<model>.ts` と公開フォーム
（`src/app/(public)/**/<model>-form.tsx`）で新フィールドを受け取る。Zod スキーマを
Server Action と form で共有（`<enumCamel>Schema` を使用）。

Select の `onValueChange` では `as` ではなく `isValid<EnumName>()` で narrow:

```tsx
<Select
  onValueChange={(v) => {
    if (isValid<EnumName>(v)) form.setValue("<enumCamel>", v);
  }}
>
  {Object.values(<EnumName>).map((value) => (
    <SelectItem key={value} value={value}>
      {<ENUM_UPPER>_LABELS[value]}
    </SelectItem>
  ))}
</Select>
```

### ⑧ 管理 UI + seed + テスト

- **管理 UI**: テーブル列・フィルタ・フォームで `<ENUM_UPPER>_LABELS` を参照
- **Seed**: `prisma/seed.ts` で**全 enum 値を網羅**（EmptyState で実装検証不可のため）
- **Badge**: `<Badge variant={<ENUM_UPPER>_BADGE_VARIANTS[value]}>{<ENUM_UPPER>_LABELS[value]}</Badge>`
- **テスト**: `__tests__/unit/lib/validations/enums.test.ts` で `isValid<EnumName>()` を追加。
  domain command テストで新フィールドの fixture を追加

## Step 4: 生成後チェックリスト

```markdown
## チェックリスト

- [ ] `bunx --bun prisma migrate dev --name add_<enum_snake>` でマイグレーション実行
- [ ] `bun run db:generate` で Prisma クライアント再生成
- [ ] `prisma-types.ts` / `guards.ts` / `helpers.ts` の 3 ファイルを 1 implementer にバンドル
- [ ] seed に全 enum 値を網羅（enum 追加時の代表的な silent bug）
- [ ] admin UI の Select / フィルタ / Badge に `_LABELS` / `_BADGE_VARIANTS` 経由で反映
- [ ] 公開ページ Badge は `Record<Enum, PublicBadgeVariant>` を別定義
- [ ] `bun run validate` で型ガード `isValid*` / ラベル Record の網羅性エラーなし確認
- [ ] `architecture-boundaries.test.ts` で gateway re-export 規約確認
```

## 注意事項

- **①〜③ は 1 implementer にバンドル** — schema + gateway + 型ガードは密結合、分割 dispatch は型エラーの中間状態を生む（CLAUDE.md §Subagent 規律）
- **seed は全 enum 値網羅** — 管理画面の EmptyState で実装検証不可になる silent bug 防止
- **公開 / 管理 Badge variant 型は異なる** — 共有 `*_BADGE_VARIANTS` は管理用、公開では別定義
- **`isValid*` 配置ルール** — Prisma enum は `enums/guards.ts`、DB VARCHAR は `enums/helpers.ts`。
  非 Prisma 値を `guards.ts` から再 export しない（`enums/helpers.ts` が正本）
- **Select の `onValueChange` `as` 禁止** — `isValid<EnumName>()` 型ガードで narrow（CLAUDE.md 参照）
- **parseFilter パターン** — URL クエリフィルタは nuqs `parseAsStringLiteral(<enumCamel>FilterValues)`
  - sentinel `"all"` を使う（`nuqs-patterns.md` §新規 enum フィルター追加時の best practice）
- **後方互換性のない変更** — enum 値削除・rename は DB migration で既存レコードの変換が必要（手動）
