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
    return { success: false, error: validated.error.flatten() }
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
    'URLは/または http で始まる必要があります'
  )
```

## 型ガードパターン

### Enum型ガード

```typescript
// @/shared/lib/validations/enums.ts
const STATUS_VALUES = ['draft', 'published', 'archived'] as const
type Status = typeof STATUS_VALUES[number]

const STATUS_SET = new Set<string>(STATUS_VALUES)

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && STATUS_SET.has(value)
}

// 使用例
const status = isStatus(input) ? input : 'draft'
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

const { form } = useForm({
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

## ファイル配置

| パス | 内容 |
|------|------|
| `@/shared/lib/validations/` | 共有スキーマ |
| `@/admin/lib/validations/` | 管理画面専用スキーマ |
| `@/public/lib/validations/` | 公開ページ専用スキーマ |
