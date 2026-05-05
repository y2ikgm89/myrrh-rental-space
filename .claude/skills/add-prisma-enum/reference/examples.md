# コード例・参照実装

> 親 skill: [../SKILL.md](../SKILL.md)

## ① prisma/schema.prisma

enum 定義:

```prisma
enum CouponType {
  FIXED
  PERCENTAGE
}
```

`--model` 指定時のフィールド追加:

```prisma
model Coupon {
  // ...existing fields...
  couponType CouponType @default(FIXED)
}
```

## ② enums/prisma-types.ts — re-export

```typescript
export {
  // ...existing enums...
  CouponType,
} from "@generated/prisma/client";
```

gateway モジュールのため、`Prisma.JsonNull` 等の runtime sentinel 値は対象外
（`shared/db` / `shared/domain` が直接 import）。

## ③ enums/guards.ts — 型ガード

```typescript
import { CouponType } from "./prisma-types";

const VALID_COUPON_TYPES = new Set<string>(Object.values(CouponType));

export function isValidCouponType(value: unknown): value is CouponType {
  return typeof value === "string" && VALID_COUPON_TYPES.has(value);
}
```

DB VARCHAR 管理の非 Prisma enum はここに置かない（`helpers.ts` へ）。

## ④ enums/helpers.ts — ラベル + parseFilter + Badge variant

```typescript
export const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  [CouponType.FIXED]: "固定額",
  [CouponType.PERCENTAGE]: "割引率",
};

// nuqs parseAsStringLiteral 用の sentinel 含み tuple
export const COUPON_TYPE_FILTER_ALL = "all" as const;
export const couponTypeFilterValues = [
  COUPON_TYPE_FILTER_ALL,
  ...Object.values(CouponType),
] as const;
export type CouponTypeFilter = (typeof couponTypeFilterValues)[number];

// 管理 Badge variant（admin Badge は shadcn/ui 契約）
export const COUPON_TYPE_BADGE_VARIANTS: Record<CouponType, AdminBadgeVariant> =
  {
    [CouponType.FIXED]: "default",
    [CouponType.PERCENTAGE]: "secondary",
  };
```

公開 Badge は variant 型が異なる（`"default"|"success"|"warning"|"info"`）ため、
公開ページでは `Record<CouponType, PublicBadgeVariant>` をコンポーネント内に別定義。

## ⑤ Validation スキーマ（Zod 4）

```typescript
import { CouponType } from "./enums/prisma-types";

export const couponTypeSchema = z.enum(Object.values(CouponType), {
  error: "CouponType を選択してください",
});
```

**Zod 4 制約**: `z.enum` は `readonly [string, ...string[]]` 必須。`Object.values` は
tuple 型にならないため、狭い tuple が欲しい場合は `enums/helpers.ts` の
`couponTypeFilterValues`（const tuple）を参照。

## ⑦ Server Action — Select の isValid narrow

```tsx
<Select
  onValueChange={(v) => {
    if (isValidCouponType(v)) form.setValue("couponType", v);
  }}
>
  {Object.values(CouponType).map((value) => (
    <SelectItem key={value} value={value}>
      {COUPON_TYPE_LABELS[value]}
    </SelectItem>
  ))}
</Select>
```

## ⑧ Badge 表示

```tsx
<Badge variant={COUPON_TYPE_BADGE_VARIANTS[value]}>
  {COUPON_TYPE_LABELS[value]}
</Badge>
```

## テンプレート付き enum（+3 箇所）

UI Meta + テンプレートが必要な enum は追加 3 箇所が必要になる典型例:

1. 値配列（`validations/<domain>.ts` などの `parseAsStringLiteral` 用 const tuple）
2. Meta Record（管理画面のアイコン / 説明 / バリアント）
3. Template Record（プレースホルダー文字列を `applyBusinessInfo()` 等で置換するテンプレート集）

旧 `TermsType` は 2026-05-02 の rebuild で **VARCHAR(64) + 文字列定数 (`terms-templates.ts`)** に置換済みのため、今後 enum + テンプレートの新規組み合わせを追加する場合の参照例は `SectionType` + `SECTION_METADATA` + `SECTION_DEFAULT_CONFIGS` を見ること（厳密には enum ではなく string union だが、+3 箇所更新パターンは同じ）。

## 参照実装（既存 enum）

- `ReservationStatus` — ステータス enum の標準実装
- `EventStatus` — Mutually exclusive boolean（`registrationOpen`）との組み合わせ事例
- `Role` — 階層制御（`getInvitableRoles()` / `canInviteRole()`）と Meta Record (`ROLE_LABELS` / `ROLE_DESCRIPTIONS`) の組み合わせ事例
