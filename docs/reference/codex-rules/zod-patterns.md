# Zod パターンルール

> Zod 4対応

## 基本パターン

### 1. エラーメッセージ（Zod 4）

**重要**: Zod 4では`message`パラメータは非推奨。`error`パラメータを使用:

```typescript
import { z } from 'zod'

// NG: Zod 3スタイル（非推奨）
z.string().min(1, 'タイトルは必須です')
z.string().min(1, { message: 'タイトルは必須です' })

// OK: Zod 4スタイル（推奨）
z.string().min(1, { error: 'タイトルは必須です' })
```

### 2. スキーマ定義

```typescript
import { z } from 'zod'

// 必須フィールド
const titleSchema = z.string()
  .min(1, { error: 'タイトルは必須です' })
  .max(200, { error: 'タイトルは200文字以内です' })

// オプショナルフィールド
const descriptionSchema = z.string()
  .max(500, { error: '説明は500文字以内です' })
  .optional()

// nullable（DBのnullを許容）
const metaDescriptionSchema = z.string().max(160).nullable().optional()
```

### 3. 複合スキーマ

```typescript
export const postSchema = z.object({
  title: z.string()
    .min(1, { error: 'タイトルは必須です' })
    .max(200, { error: 'タイトルは200文字以内です' }),
  slug: z.string()
    .min(1, { error: 'スラッグは必須です' })
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'スラッグは半角英数字とハイフンのみ' }),
  content: z.string().min(1, { error: 'コンテンツは必須です' }),
  isPublished: z.boolean().default(false),
  publishedAt: z.date().nullable().optional(),
})

export type PostInput = z.infer<typeof postSchema>
```

### 4. Server Actionsでの使用

```typescript
export async function createPost(input: unknown): Promise<ActionResult<Post>> {
  const validated = postSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, error: z.flattenError(validated.error) }
  }

  const post = await prisma.post.create({ data: validated.data })
  return { success: true, data: post }
}
```

## 共通スキーマの再利用

### SEOフィールド

```typescript
// @/shared/lib/validations/seo.ts
export const seoFieldsSchema = z.object({
  metaDescription: z.string().max(160).nullable().optional(),
  metaKeywords: z.string().max(200).nullable().optional(),
})

export const ogpFieldsSchema = z.object({
  ogpTitle: z.string().max(100).nullable().optional(),
  ogpDescription: z.string().max(200).nullable().optional(),
  ogpImageUrl: z.string().url().nullable().optional(),
})

// 使用例：スキーマを結合
export const postSeoSchema = z.object({
  ...seoFieldsSchema.shape,
  ...ogpFieldsSchema.shape,
})
```

### URLバリデーション

```typescript
// 空文字列も許可するURL
const optionalUrlSchema = z.string().url().optional().or(z.literal(''))

// 安全なURL（相対パスも許可）
const safeUrlSchema = z.string()
  .refine(
    (val) => !val || val.startsWith('/') || val.startsWith('http'),
    { error: 'URLは/または http で始まる必要があります' }
  )
```

## Prisma Enum バリデーション

### z.enum() で Prisma enum を使用

Zod 4 では `z.nativeEnum()` は非推奨。`z.enum()` が Prisma 7 生成の `as const` オブジェクトを直接受け付ける:

```typescript
import { z } from 'zod'
import { DiscountType, TaxRateType } from '@/shared/generated/prisma/enums'

// NG: z.nativeEnum()（Zod 4 非推奨）
z.nativeEnum(DiscountType)

// NG: 文字列リテラル配列
z.enum(['none', 'percentage', 'fixed'])

// OK: Prisma enum を z.enum() に渡す
z.enum(DiscountType)

// OK: デフォルト値もenum定数で
z.enum(DiscountType).default(DiscountType.none)
z.enum(TaxRateType).default(TaxRateType.standard)
```

### Zodスキーマ内のデフォルト値

```typescript
// NG: 文字列リテラルのデフォルト
discountType: z.enum(DiscountType).default('none')

// OK: enum定数のデフォルト
discountType: z.enum(DiscountType).default(DiscountType.none)
```

## 型ガードパターン

### Prisma Enum型ガード（`enums.ts` から import）

全Prisma enumの型ガードは `enums.ts` に集約。ローカル定義禁止:

```typescript
import { isValidDiscountType, getValidDiscountType } from '@/shared/lib/validations/enums'

// isValid* — boolean判定
if (isValidDiscountType(input)) {
  // input は DiscountType 型
}

// getValid* — デフォルト値付きパース（推奨）
const type = getValidDiscountType(input)  // デフォルト: DiscountType.none
const type = getValidDiscountType(input, DiscountType.percentage)  // カスタムデフォルト
```

### ローカルEnum型ガード（Prisma enumが存在しない場合のみ）

```typescript
// Prisma enum にない値のみローカル定義可
const CONNECTION_METHODS = ['oauth', 'manual'] as const
type ConnectionMethod = (typeof CONNECTION_METHODS)[number]
const CONNECTION_METHOD_SET = new Set<string>(CONNECTION_METHODS)

function isConnectionMethod(value: string): value is ConnectionMethod {
  return CONNECTION_METHOD_SET.has(value)
}
```

### unknownからのパース

```typescript
// Zod safeParse推奨
const result = schema.safeParse(unknownValue)
if (result.success) {
  // result.data は型安全
}

// 型ガード関数（シンプルなケース）
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}
```

## React Hook Form連携

```typescript
import { zodResolver } from '@hookform/resolvers/zod'

const form = useForm({
  resolver: zodResolver(postSchema),
  defaultValues: {
    title: '',
    content: '',
    isPublished: false,
  },
})
```

## 禁止事項

1. **z.any() / z.unknown() の乱用禁止**
   - 具体的な型を定義する

2. **型アサーションとの併用禁止**
   - `safeParse`の結果をそのまま使用

3. **バリデーションなしのServer Action禁止**
   - 必ず`safeParse`でバリデーション

4. **z.nativeEnum() 禁止（Zod 4 非推奨）**
   - `z.enum(PrismaEnum)` を使用

5. **Zodデフォルト値での文字列リテラル禁止（Prisma enum存在時）**
   - `.default('none')` → `.default(DiscountType.none)`

## ファイル配置

| パス | 内容 |
|------|------|
| `@/shared/lib/validations/` | 共有スキーマ |
| `@/admin/lib/validations/` | 管理画面専用スキーマ |
| `@/public/lib/validations/` | 公開ページ専用スキーマ |
