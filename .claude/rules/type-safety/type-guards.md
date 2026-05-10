---
description: ユーザー定義型ガード（`is`）+ Set-based 型ガード + Zod safeParse 型ガード + Select / SelectionBox onChange 絞り込み
paths:
  - src/**/*.ts
  - src/**/*.tsx
  - src/shared/lib/validations/enums*
  - src/shared/lib/serialize.ts
---

# 型ガードパターン

> ユーザー定義型ガード (`is`) / Set-based / Zod safeParse / UI コンポーネント onChange の絞り込み。

## ユーザー定義型ガード（`is` キーワード）

```typescript
// 型述語で戻り値型をナローイング
function isString(value: unknown): value is string {
  return typeof value === "string";
}

// filter と組み合わせ（型安全）
const strings = mixedArray.filter((v): v is string => typeof v === "string");
```

## Set-based 型ガード

Prisma enum にない値（ローカルの union 型）のみで使用:

```typescript
const CONNECTION_METHODS = ["oauth", "manual"] as const;
type ConnectionMethod = (typeof CONNECTION_METHODS)[number];
const CONNECTION_METHOD_SET = new Set<string>(CONNECTION_METHODS);

function isConnectionMethod(value: string): value is ConnectionMethod {
  return CONNECTION_METHOD_SET.has(value);
}
```

**パーサーファクトリ（`section-parsers.ts` パターン）**:

```typescript
// Set.has + 型述語でデフォルト値付きパーサーを生成（as T 不要）
function createParser<T extends string>(
  values: readonly T[],
  defaultValue: NoInfer<T>, // NoInfer<T>: defaultValue からの型推論を防止
): (value: string) => T {
  const set = new Set<string>(values);
  const isValid = (v: string): v is T => set.has(v);
  return (value: string): T => (isValid(value) ? value : defaultValue);
}

// 使用例: Zod をクライアントバンドルから除去するため section-parsers.ts で使用
export const parseHeroHeight = createParser(heroHeightValues, "md");
```

## Zod safeParse 型ガード（推奨）

```typescript
const result = schema.safeParse(unknownValue);
if (!result.success) {
  return { success: false, error: z.flattenError(result.error) };
}
// result.data は型安全
```

## Select / SelectionBox の onChange 型絞り込み

UI コンポーネントの `onChange` は `string` を返すため `enums.ts` の型ガードで絞り込む:

```typescript
import { isValidDiscountType, getValidDiscountType } from '@/shared/lib/validations/enums'

// NG: 型アサーション
onValueChange={(value) => setType(value as DiscountType)}

// OK: isValid* 型ガード
onValueChange={(value) => { if (isValidDiscountType(value)) setType(value) }}

// OK: getValid* デフォルト値付き（DB 値やフォーム初期値のパースに最適）
const taxRate = getValidTaxRateType(settings.taxRateType)  // デフォルト: standard
```
