# 型安全性向上計画

## 概要

プロジェクト全体の型安全性と型定義を公式推奨のベストプラクティスに準拠したクリーンな実装に改善。

## 実装日

2026-01-10

## 解決した問題

| 問題                                   | 影響度 | 箇所数     |
| -------------------------------------- | ------ | ---------- |
| JSONフィールドの`as string[]`キャスト  | 🔴高   | 14箇所     |
| `Record<string, unknown>`でwhere句構築 | 🟡中   | 10ファイル |
| Server Actionsレスポンス型の重複定義   | 🟢低   | 14ファイル |

## 新規ファイル

### `src/types/server-actions.ts`

共通Server Actionsレスポンス型:

```typescript
export type ActionResult<TData = void> = ActionSuccess<TData> | ActionFailure;

export function createSuccess(message: string): ActionSuccess<void>;
export function createSuccess<T>(message: string, data: T): ActionSuccess<T>;
export function createFailure(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionFailure;
export function isActionSuccess<T>(
  result: ActionResult<T>,
): result is ActionSuccess<T>;
export function isActionFailure<T>(
  result: ActionResult<T>,
): result is ActionFailure;
```

### `src/types/prisma.ts`

Prisma WhereInput型エイリアス:

```typescript
export type SpaceWhereInput = Prisma.SpaceWhereInput;
export type ReservationWhereInput = Prisma.ReservationWhereInput;
export type BlogPostWhereInput = Prisma.BlogPostWhereInput;
// ... 他のエンティティ
```

### `src/types/index.ts`

集約re-export

### `src/lib/json-validators.ts`

Zodバリデーション関数:

```typescript
export function parseStringArray(value: Prisma.JsonValue): string[];
export function parseStringArrayOrNull(
  value: Prisma.JsonValue,
): string[] | null;
export function parseBusinessHours(
  value: Prisma.JsonValue,
): BusinessHours | null;
```

## 変更ファイル

| ファイル                                | 変更内容                              |
| --------------------------------------- | ------------------------------------- |
| `src/actions/admin/space.ts`            | where型安全化, JSONパース             |
| `src/actions/admin/blog.ts`             | where型安全化, JSONパース             |
| `src/actions/admin/reservation.ts`      | where型安全化                         |
| `src/actions/admin/customer.ts`         | where型安全化                         |
| `src/actions/admin/inquiry.ts`          | where型安全化                         |
| `src/actions/admin/news.ts`             | where型安全化                         |
| `src/actions/admin/export.ts`           | where型安全化（3箇所）                |
| `src/actions/admin/settings.ts`         | JSONパース（businessHours, holidays） |
| `src/app/(public)/spaces/[id]/page.tsx` | JSONパース                            |
| `src/app/(public)/blog/page.tsx`        | JSONパース                            |
| `src/app/(public)/blog/[slug]/page.tsx` | getTags → parseStringArray            |

## 成果

- ✅ `as string[]`キャストが0箇所
- ✅ `Record<string, unknown>`がwhere句から消滅
- ✅ 共通ActionResult型が利用可能
- ✅ 型エラーゼロでビルド成功

## 注意事項

- `BusinessHours`型は`settings.ts`内で定義を維持（Turbopackのexport type re-export問題を回避）
- `json-validators.ts`のBusinessHoursスキーマは内部バリデーション用
