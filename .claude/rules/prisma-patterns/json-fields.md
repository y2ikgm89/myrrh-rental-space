---
description: Prisma JSON フィールドの Zod 型安全化、React 19 シリアライゼーション、Date 境界変換ルール
paths:
  - src/shared/lib/json-validators.ts
  - src/shared/lib/serialize.ts
  - src/shared/db/**
  - src/shared/domain/**/*.ts
  - src/**/queries/**/*.ts
  - src/**/actions/**/*.ts
---

# Prisma JSON フィールドの型安全化

> `Prisma.JsonValue` ≈ `unknown` のため Zod 検証必須。React 19 Server→Client 境界の Date シリアライゼーションも本ファイル管轄。

## Zod スキーマによるランタイムバリデーション

`Prisma.JsonValue` は `unknown` 相当のため、ランタイムで Zod 検証を行う。
全パース関数は `@/shared/lib/json-validators.ts` に集約:

```typescript
import {
  parseStringArray,
  parseBusinessHours,
} from "@/shared/lib/json-validators";

// string[] へのパース（失敗時は空配列を返す）
const imageUrls = parseStringArray(space.imageUrls); // string[]
const facilities = parseStringArray(space.facilities); // string[]
const tags = parseStringArray(post.tags); // string[]

// 複雑な JSON フィールドのパース（失敗時は null を返す）
const businessHours = parseBusinessHours(settings.businessHours); // BusinessHours | null
```

## 複雑な JSON フィールド（Zod スキーマ + 型推論）

Zod スキーマから型を推論し、パース関数を提供:

```typescript
// @/shared/lib/json-validators.ts
const businessTimeSlotSchema = z.object({
  openTime: z.string(),
  closeTime: z.string(),
});

const businessHoursDaySchema = z.object({
  isOpen: z.boolean(),
  slots: z.array(businessTimeSlotSchema),
});

const businessHoursSchema = z.object({
  monday: businessHoursDaySchema,
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema,
});

// 型は Zod スキーマから推論（手動型定義禁止）
export type BusinessTimeSlot = z.infer<typeof businessTimeSlotSchema>;
export type BusinessHoursDay = z.infer<typeof businessHoursDaySchema>;
export type BusinessHours = z.infer<typeof businessHoursSchema>;

export function parseBusinessHours(value: unknown): BusinessHours | null {
  const result = businessHoursSchema.safeParse(value);
  return result.success ? result.data : null;
}
```

## React 19 シリアライゼーション（toPlainObject / toPlainArray）

Prisma オブジェクトは Symbol プロパティ（`$Enums` 等）を含むため、Server Component → Client Component への props 渡し時に React 19 のシリアライゼーションエラーが発生する。
`toPlainObject()` / `toPlainArray()` でプレーンオブジェクトに変換してから渡す:

```typescript
import { toPlainObject, toPlainArray } from '@/shared/lib/serialize'

// Server Component → Client Component（単体）
const settings = await prisma.settings.findFirst({ select: { ... } })
return toPlainObject(settings)  // Symbol プロパティを除去

// Server Component → Client Component（配列）
const items = await prisma.post.findMany({ ... })
return toPlainArray(items)
```

**注意**: `safeFetch` + `'use cache'` で取得した公開データは同様に `toPlainObject()` でラップする（`server-actions/implementation/forms-and-public.md` §公開データ取得パターン 参照）。

## Date フィールドの Server→Client 境界シリアライゼーション

React 19 は Server Component → Client Component へ props を渡す際に `Date` を ISO 8601 文字列に変換する（[公式: Serializable types](https://react.dev/reference/rsc/use-client#serializable-types)）。`toPlainObject()` も `JSON.parse(JSON.stringify())` で同様に変換する。

**`toPlainObject()` は型の嘘**: 戻り値型は `T` のままだが、実態は日付フィールドが `string` になっている。

### Client Component に渡す型は `string` で宣言する

```typescript
// NG: Client Component に渡す型で Date を宣言
export type ReservationWithRelations = {
  startTime: Date; // runtime では string になる → クラッシュ
  endTime: Date;
};

// OK: 実態に合わせて string で宣言
export type ReservationWithRelations = {
  /** toPlainObject() / React 19 シリアライズ済み ISO 8601 文字列 */
  startTime: string;
  /** toPlainObject() / React 19 シリアライズ済み ISO 8601 文字列 */
  endTime: string;
};
```

### Server Action 側で明示的に `.toISOString()` 変換する

```typescript
// NG: toPlainObject に型変換を委ねる（型チェックエラー）
const formatted: ReservationWithRelations[] = toPlainArray(reservations);

// OK: 明示的にシリアライズして型と実態を一致させる
const formatted: ReservationWithRelations[] = reservations.map((r) => ({
  ...r,
  startTime: r.startTime.toISOString(),
  endTime: r.endTime.toISOString(),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
}));
```

> **注（重要）**: `{ ...prismaObj }` の JavaScript スプレッドは**トップレベルの** Symbol キーのみ除外する（シャローコピー）。`include` で取得したネストされた Prisma オブジェクト（`space`、`customer`、`coupon` 等）は依然 Symbol プロパティ（`nodejs.util.inspect.custom` 等）を保持する → React 19 シリアライゼーションエラー。**ネストされたリレーションを含む場合は `toPlainObject()` が必須。**

### Client Component では `new Date()` でラップして date-fns に渡す

```typescript
// NG: string に date-fns を直接適用 → TypeError
format(event.startTime, "HH:mm");
isSameDay(event.startTime, day);
event.startTime.getTime();

// OK: new Date() でパースしてから適用
format(new Date(event.startTime), "HH:mm");
isSameDay(new Date(event.startTime), day);
new Date(event.startTime).getTime();

// OK: ISO 8601 UTC 文字列のソートは localeCompare() で代替（辞書順 = 時系列順）
events.sort((a, b) => a.startTime.localeCompare(b.startTime));
```

**適用範囲**: Server→Client 境界を越えるデータのみ。Server Component 内のみで完結する処理は `Date` のままで問題ない。

## ISO 8601 文字列と `Date` の直接比較は常に false

```typescript
// NG: 文字列と Date の直接比較 → NaN 比較になり常に false
const now = new Date()
if (coupon.validUntil > now) { ... }  // false（文字列 > Date は NaN）
if (coupon.validFrom < now) { ... }   // false（文字列 < Date は NaN）

// OK: new Date() でラップしてから比較
if (new Date(coupon.validUntil) > now) { ... }
if (new Date(coupon.validFrom) < now) { ... }
```

`getCouponStatus` 等のステータス判定で文字列日付と現在時刻を比較する場合に起きやすい。Client Component に ISO 8601 文字列として渡された日付フィールドは必ず `new Date(field)` でラップすること。

## JSON フィールド配置規則

| ファイル                          | 内容                                      |
| --------------------------------- | ----------------------------------------- |
| `@/shared/lib/json-validators.ts` | Zod スキーマ、型推論、パース関数          |
| `@/shared/lib/serialize.ts`       | `toPlainObject`、`toPlainArray`、`keysOf` |
