---
paths:
  - src/shared/lib/validations/**
  - src/**/lib/validations/**
  - src/**/actions/**/*.ts
  - src/shared/domain/**
---

# Zod Enum・Literal・型ガード

> Zod 4 対応

## Prisma Enum バリデーション

### z.enum() で Prisma enum を使用（nativeEnum はプロジェクト規範で禁止）

Zod 4 は `z.enum()` で TS enum / const object を直接受ける API を**推奨パターン**として前面に出している。プロジェクト規範として **`z.enum()` に統一**し、`nativeEnum` の使用を禁止する:

```typescript
import { z } from "zod";
import {
  DiscountType,
  TaxRateType,
  PostStatus,
} from "@/shared/lib/validations/enums/prisma-types";

// NG: z.nativeEnum() — プロジェクト規範で禁止
z.nativeEnum(DiscountType);

// NG: 文字列リテラル配列（Prisma enum と乖離するリスク）
z.enum(["none", "percentage", "fixed"]);

// OK: Prisma enum を z.enum() に渡す
z.enum(DiscountType);
z.enum(PostStatus);

// OK: デフォルト値もenum定数で
discountType: z.enum(DiscountType).default(DiscountType.none);
status: z.enum(PostStatus);
taxRateType: z.enum(TaxRateType).default(TaxRateType.standard);
```

### デフォルト値もenum定数で

```typescript
// NG: 文字列リテラルのデフォルト（Prisma enum と乖離するリスク）
discountType: z.enum(DiscountType).default("none");

// OK: enum定数のデフォルト（型安全）
discountType: z.enum(DiscountType).default(DiscountType.none);
taxRateType: z.enum(TaxRateType).default(TaxRateType.standard);
```

## 型ガードパターン

### Prisma Enum型ガード（enums/guards から import — ローカル定義禁止）

全Prisma enumの型ガードは `@/shared/lib/validations/enums/guards` に集約。ローカル定義禁止:

```typescript
import {
  isValidDiscountType,
  isValidPostStatus,
} from '@/shared/lib/validations/enums/guards'
import {
  getValidDiscountType,
  getValidPostStatus,
} from '@/shared/lib/validations/enums/helpers'

// isValid* — boolean判定（UIイベントハンドラ等）
onValueChange={(value) => {
  if (isValidDiscountType(value)) setDiscountType(value)
}}

// getValid* — デフォルト値付きパース（DB値・フォーム初期値のパースに最適）
const type = getValidDiscountType(rawValue)                        // デフォルト: DiscountType.none
const type = getValidDiscountType(rawValue, DiscountType.percentage)  // カスタムデフォルト
```

### ローカルEnum型ガード（Prisma enumが存在しない場合のみ）

```typescript
// OK: Prisma に対応するenumがない場合
const CONNECTION_METHODS = ["oauth", "manual"] as const;
type ConnectionMethod = (typeof CONNECTION_METHODS)[number];
const CONNECTION_METHOD_SET = new Set<string>(CONNECTION_METHODS);

function isConnectionMethod(value: string): value is ConnectionMethod {
  return CONNECTION_METHOD_SET.has(value);
}
```

### unknown からのパース

```typescript
// Zod safeParse 推奨（型安全）
const result = schema.safeParse(unknownValue);
if (result.success) {
  // result.data は型安全
}

// 型ガード関数（シンプルなケース）
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}
```

## 禁止事項

4. **z.nativeEnum() 禁止（プロジェクト規範）**
   - Zod 4 推奨パターンは `z.enum()`。`z.enum(PrismaEnum)` に統一

5. **Zodデフォルト値での文字列リテラル禁止（Prisma enum存在時）**
   - `z.enum(DiscountType).default('none')` → `.default(DiscountType.none)`

6. **ローカルファイルへの Prisma enum 型ガード定義禁止**
   - `isValid*` は `@/shared/lib/validations/enums/guards`、`getValid*` は `@/shared/lib/validations/enums/helpers` から import
