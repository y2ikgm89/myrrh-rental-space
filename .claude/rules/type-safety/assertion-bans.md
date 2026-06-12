---
description: 型アサーション (`as`) / 非null アサーション (`!`) 禁止 + 許可例外 6 種類 + 代替手段
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# 型アサーション / 非null アサーション禁止

`as` キャスト・`!` 非null アサーションは原則禁止。

## 非null アサーション (`!`) の代替

```typescript
// NG: location!.id / config.items!.map(...)
// OK: if (!location) throw new Error("required"); location.id
// OK: const items = config.items; if (!items?.length) return;
```

## `as` の許可例外（6 種類）

1. **DOM event target** — `as` 不使用、`instanceof HTMLInputElement` 等で narrow（canonical。PR #117 で 10 cast → 0 完了）
2. **Prisma JSON** — `asPrismaInputJsonValue(value, msg)` helper 経由（`@/shared/db/prisma-input-json`）。`as Prisma.InputJsonValue` 禁止。`as Prisma.InputJsonObject` は data field 限定で許容。`as InputJsonArray` は `satisfies ... as` 形式のみ。double cast `as A as B` 禁止
3. **`keysOf`/`entriesOf`/`omitUndefined`** — `@/shared/lib/serialize.ts` 実装内部のみ。呼び出し側は helper を使う
4. **SDK 境界 `z.custom<T>`** — `<service>/schemas.ts` / `to-app-route.ts` 内部のみ（googleapis/resend/Next.js typedRoutes）。呼び出し側は `.parse()` / `toAppRoute()` / `safeToAppRoute()` 経由
5. **conform `FieldMetadata<T>` generic invariance** — `@/shared/lib/conform/typed-input-control` の 9 helper 内部のみ。`architecture-boundaries.test.ts` §5 gate で CI 検出
6. **JSX 内 repeated nullable property** — outer const 抽出で対処（tsc は pass するが CI typedoc で TS2339 → `announcement-bar.tsx` が参照実装）

## 代替手段テーブル

| 禁止パターン                           | 代替                                                     |
| -------------------------------------- | -------------------------------------------------------- |
| `Object.keys(obj) as ConfigKey[]`      | `keysOf(obj)`                                            |
| `value as DiscountType`                | `isValidDiscountType(value)` 型ガード                    |
| `{ ... } as Record<K, V>`              | `satisfies` キーワード                                   |
| `value as SomeType`（Zod parse 後）    | `safeParse` + `result.data`                              |
| `value as Prisma.InputJsonValue`       | `asPrismaInputJsonValue(value, msg)`                     |
| `value as Route<string>`               | `toAppRoute(value)` / `safeToAppRoute(value)`            |
| `field as unknown as FieldMetadata<T>` | `asTypedField<T>(field)` / `useTypedInputControl(field)` |

## 監査 grep

```bash
grep -rnE '\bas\s+any\b|\bas\s+unknown\s+as\b|@ts-(ignore|expect-error|nocheck)' src/
grep -rnE 'as\s+unknown\s+as\s+FieldMetadata' src/ | grep -v 'typed-input-control.ts'
grep -rnE '\bas\s+Prisma\.InputJsonValue\b' src/ | grep -v '^\s*//'
```

## Gotchas

- **同名 enum import が `as` rename を強制する** — `EventStatus` を direct + gateway 経由の両方から import → TS2300 → `as EventStatusEnum` rename 混入。gateway（`enums/prisma-types`）経由統一で解消（2026-05-12 実遭遇）
