---
paths:
  - src/**
---

# Zod パターンルール

> Zod 4.3.6対応

## 基本パターン

### エラーメッセージ（error: パラメータ）

**重要**: Zod 4では `message` パラメータは非推奨。`error` パラメータを使用:

```typescript
import { z } from 'zod'

// NG: Zod 3スタイル（非推奨）
z.string().min(1, 'タイトルは必須です')
z.string().min(1, { message: 'タイトルは必須です' })

// OK: Zod 4スタイル
z.string().min(1, { error: 'タイトルは必須です' })
z.string({ error: 'フィールドは必須です' })
z.uuid({ error: '有効なUUIDを入力してください' })

// OK: 動的エラーメッセージ（コンテキスト依存）
z.string({
  error: (iss) => iss.input === undefined ? 'フィールドは必須です' : '入力が無効です',
})
```

### スキーマ定義

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

// カスタムバリデーション（refine）
const lexicalJsonSchema = z.string().refine(
  (val) => {
    try {
      const parsed: unknown = JSON.parse(val)
      return typeof parsed === 'object' && parsed !== null && 'root' in parsed
    } catch {
      return false
    }
  },
  { error: '有効なLexical EditorState JSONではありません' }
)
```

### 複合スキーマ（実際のプロジェクト例）

```typescript
import { z } from 'zod'
import { PostStatus, LayoutWidth } from '@/shared/generated/prisma/enums'
import { seoOgpFieldsSchema } from '@/shared/lib/validations/seo'
import { lexicalJsonSchema } from '@/shared/lib/validations/lexical'

// Server Action用スキーマ（型厳格）
export const updatePostSchema = z
  .object({
    title: z.string()
      .min(1, { error: 'タイトルは必須です' })
      .max(200, { error: 'タイトルは200文字以内' }),
    slug: z.string()
      .min(1, { error: 'スラッグは必須です' })
      .max(200)
      .regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ' }),
    contentJson: lexicalJsonSchema,
    contentWidth: z.enum(LayoutWidth).nullable().optional(),
    tags: z.array(z.string().uuid({ error: 'タグIDが不正です' })).default([]),
  })
  .merge(seoOgpFieldsSchema)  // SEO/OGPフィールドを合成

export type UpdatePostInput = z.infer<typeof updatePostSchema>

// フォーム用スキーマ（空文字許可・文字列型）
export const postFormSchema = z
  .object({
    title: z.string().min(1, { error: 'タイトルは必須です' }),
    slug: z.string().min(1, { error: 'スラッグは必須です' }),
    status: z.enum(PostStatus),
    contentJson: z.string().min(1, { error: '本文は必須です' }),
    tags: z.string().optional(),       // フォーム: comma-separated string
    publishedAt: z.string().optional(), // フォーム: 文字列のまま
  })
  .merge(seoOgpFieldsFormSchema)

export type PostFormData = z.infer<typeof postFormSchema>
```

**Server Action用スキーマ vs フォーム用スキーマの使い分け**:

| 用途 | 特徴 | 例 |
|------|------|-----|
| Server Action | 型厳格（Date, number, UUID検証） | `updatePostSchema` |
| フォーム (React Hook Form) | 空文字許可・文字列型 | `postFormSchema` |

### Server Actions での使用

```typescript
'use server'

import { z } from 'zod'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { checkPermission } from '@/admin/lib/action-auth'
import { createSuccess, createFailure } from '@/shared/lib/errors'
import type { ActionResult } from '@/shared/types/server-actions'

export async function updatePost(id: string, input: unknown): Promise<ActionResult<Post>> {
  // 1. 認証・権限チェック
  const auth = await checkPermission('post', 'update')
  if (!auth.success) return auth.error

  // 2. バリデーション（safeParse + flattenError）
  const validated = updatePostSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, error: z.flattenError(validated.error) }
  }

  // 3. データ操作
  const post = await prisma.post.update({ where: { id }, data: validated.data })

  // 4. キャッシュ無効化
  updateTag(CACHE_TAGS.POSTS)

  return createSuccess(post)
}
```

**`z.flattenError` の出力形式**:

```typescript
{
  formErrors: string[],     // トップレベルエラー
  fieldErrors: {            // フィールド別エラー
    [field: string]: string[]
  }
}
```

## Prisma Enum バリデーション

### z.enum() で Prisma enum を使用（nativeEnum 禁止）

Zod 4 では `z.nativeEnum()` は非推奨。Prisma 7 の `@map` enum は TypeScript 側で `as const` オブジェクトとして生成されるため、`z.enum()` で直接受け付ける:

```typescript
import { z } from 'zod'
import { DiscountType, TaxRateType, PostStatus } from '@/shared/generated/prisma/enums'

// NG: z.nativeEnum()（Zod 4 非推奨）
z.nativeEnum(DiscountType)

// NG: 文字列リテラル配列（Prisma enum と乖離するリスク）
z.enum(['none', 'percentage', 'fixed'])

// OK: Prisma enum を z.enum() に渡す
z.enum(DiscountType)
z.enum(PostStatus)

// OK: Zodスキーマのフィールドで使用
discountType: z.enum(DiscountType).default(DiscountType.none)
status: z.enum(PostStatus)
taxRateType: z.enum(TaxRateType).default(TaxRateType.standard)
```

### デフォルト値もenum定数で

```typescript
// NG: 文字列リテラルのデフォルト（Prisma enum と乖離するリスク）
discountType: z.enum(DiscountType).default('none')

// OK: enum定数のデフォルト（型安全）
discountType: z.enum(DiscountType).default(DiscountType.none)
taxRateType: z.enum(TaxRateType).default(TaxRateType.standard)
```

## 共通スキーマの再利用

### SEOフィールド（seoFieldsSchema / ogpFieldsSchema）

```typescript
// @/shared/lib/validations/seo.ts
export const SEO_LIMITS = {
  META_DESCRIPTION: 160,
  META_KEYWORDS: 500,
  OGP_TITLE: 70,
  OGP_DESCRIPTION: 200,
} as const

// Server Action用（nullable）
export const seoFieldsSchema = z.object({
  metaDescription: z.string().max(SEO_LIMITS.META_DESCRIPTION).nullable().optional(),
  metaKeywords: z.string().max(SEO_LIMITS.META_KEYWORDS).nullable().optional(),
})

export const ogpFieldsSchema = z.object({
  ogpTitle: z.string().max(SEO_LIMITS.OGP_TITLE).nullable().optional(),
  ogpDescription: z.string().max(SEO_LIMITS.OGP_DESCRIPTION).nullable().optional(),
  ogpImageUrl: z.string().url().nullable().optional(),
})

// 統合スキーマ（merge で合成）
export const seoOgpFieldsSchema = seoFieldsSchema.merge(ogpFieldsSchema)

// フォーム用（空文字許可）
export const seoFieldsFormSchema = z.object({
  metaDescription: z.string().max(SEO_LIMITS.META_DESCRIPTION).optional(),
  metaKeywords: z.string().max(SEO_LIMITS.META_KEYWORDS).optional(),
})
export const seoOgpFieldsFormSchema = seoFieldsFormSchema.merge(ogpFieldsFormSchema)
```

**スキーマ合成の使い分け**:

| 方法 | 用途 | 備考 |
|------|------|------|
| `.merge(other)` | 既存 `ZodObject` どうし | Zod 4 推奨（型推論効率） |
| `z.object({ ...A.shape, ...B.shape })` | 複数スキーマのスプレッド合成 | tsc 効率優先時 |

### URLバリデーション

```typescript
// 空文字列も許可するURL（フォーム用）
const optionalUrlSchema = z.string().url().optional().or(z.literal(''))

// nullable + 空文字も許可（DB nullable フィールドのフォーム用）
const imageUrlSchema = z.string().url().nullable().optional()
  .or(z.literal(''))
  .or(z.literal(null))

// 安全なURL（相対パスも許可）
const safeUrlSchema = z.string()
  .refine(
    (val) => !val || val.startsWith('/') || val.startsWith('http'),
    { error: 'URLは / または http で始まる必要があります' }
  )
```

### URLパラメータバリデーション

```typescript
// @/shared/lib/validations/params.ts — 'use cache' 関数の入口検証
export const slugParamSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const idParamSchema = z.string().min(1).max(100)

// 使用例（'use cache' 関数内）
export async function getPublishedPost(slug: string) {
  'use cache'
  const validated = slugParamSchema.safeParse(slug)
  if (!validated.success) return null  // 不正な入力をDB到達前にブロック

  return prisma.post.findUnique({ where: { slug: validated.data } })
}
```

## 型ガードパターン

### Prisma Enum型ガード（enums.ts から import — ローカル定義禁止）

全Prisma enumの型ガードは `@/shared/lib/validations/enums.ts` に集約。ローカル定義禁止:

```typescript
import {
  isValidDiscountType,
  getValidDiscountType,
  isValidPostStatus,
  getValidPostStatus,
} from '@/shared/lib/validations/enums'

// isValid* — boolean判定（UIイベントハンドラ等）
onValueChange={(value) => {
  if (isValidDiscountType(value)) setDiscountType(value)
}}

// getValid* — デフォルト値付きパース（DB値・フォーム初期値のパースに最適）
const type = getValidDiscountType(rawValue)                        // デフォルト: DiscountType.none
const type = getValidDiscountType(rawValue, DiscountType.percentage)  // カスタムデフォルト
```

### ローカルEnum型ガード（Prisma enumが存在しない場合のみ）

Prisma enum に対応しない値のみローカル定義可:

```typescript
// OK: Prisma に対応するenumがない場合
const CONNECTION_METHODS = ['oauth', 'manual'] as const
type ConnectionMethod = (typeof CONNECTION_METHODS)[number]
const CONNECTION_METHOD_SET = new Set<string>(CONNECTION_METHODS)

function isConnectionMethod(value: string): value is ConnectionMethod {
  return CONNECTION_METHOD_SET.has(value)
}
```

### unknown からのパース

```typescript
// Zod safeParse 推奨（型安全）
const result = schema.safeParse(unknownValue)
if (result.success) {
  // result.data は型安全
}

// 型ガード関数（シンプルなケース）
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}
```

## React Hook Form 連携

```typescript
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

// フォーム用スキーマ（空文字許可・文字列型）を resolver に渡す
const form = useForm<PostFormData>({
  resolver: zodResolver(postFormSchema),
  defaultValues: {
    title: '',
    slug: '',
    status: PostStatus.draft,
    contentJson: '',
    metaDescription: '',
    ogpTitle: '',
    ogpDescription: '',
    ogpImageUrl: '',
  },
})

// フォーム送信時は Server Action 用スキーマで再バリデーション
const onSubmit = async (formData: PostFormData) => {
  const result = await updatePost(id, transformFormData(formData))
  // ...
}
```

**注意**: React Hook Form に渡すスキーマはフォーム用（空文字許可・文字列型）。
Server Action 側で改めてサーバー用スキーマで検証する二段構成。

## Zod 4 新機能

### z.fromJSONSchema()

既存の JSON Schema 定義を Zod スキーマに変換:

```typescript
import { z } from 'zod'

// 外部ライブラリや OpenAPI spec の JSON Schema を Zod へ変換
const jsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    age: { type: 'number', minimum: 0 },
  },
  required: ['name'],
}

const schema = z.fromJSONSchema(jsonSchema)
type Schema = z.infer<typeof schema>
// => { name: string; age?: number }
```

**ユースケース**: 外部 API の JSON Schema 仕様から型安全なバリデーターを自動生成する場合。

## 禁止事項

1. **z.any() / z.unknown() の乱用禁止**
   - 具体的な型を定義する。`unknown` を受け取ってすぐ `safeParse` するのは正しいパターン

2. **型アサーションとの併用禁止**
   - `safeParse` の結果は `result.data` をそのまま使用。`as` でキャストしない

3. **バリデーションなしの Server Action 禁止**
   - 入力は必ず `safeParse` でバリデーション後に使用

4. **z.nativeEnum() 禁止（Zod 4 非推奨）**
   - `z.enum(PrismaEnum)` を使用

5. **Zodデフォルト値での文字列リテラル禁止（Prisma enum存在時）**
   - `z.enum(DiscountType).default('none')` → `.default(DiscountType.none)`

6. **ローカルファイルへの Prisma enum 型ガード定義禁止**
   - `isValid*` / `getValid*` は `@/shared/lib/validations/enums.ts` から import

7. **message: パラメータ禁止（Zod 4）**
   - `{ message: 'エラー' }` → `{ error: 'エラー' }`

## ファイル配置

| パス | 内容 |
|------|------|
| `@/shared/lib/validations/enums.ts` | Prisma enum型ガード（`isValid*` / `getValid*`）、re-export |
| `@/shared/lib/validations/seo.ts` | SEO/OGP 共通スキーマ（Server Action用 + フォーム用） |
| `@/shared/lib/validations/section.ts` | セクション設定スキーマ |
| `@/shared/lib/validations/lexical.ts` | Lexical EditorState JSON バリデーション |
| `@/shared/lib/validations/params.ts` | URL パラメータバリデーション（slugParamSchema等） |
| `@/shared/lib/validations/` | その他共有スキーマ |
| `@/admin/lib/validations/` | 管理画面専用スキーマ |
| `@/public/lib/validations/` | 公開ページ専用スキーマ |
