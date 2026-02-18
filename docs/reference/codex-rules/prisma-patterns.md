# Prisma パターンルール

> Prisma 7.3 / PostgreSQL対応

## Enum パターン（Prisma 7 mapped enums）

### 1. Prisma enum定数を使用（文字列リテラル禁止）

Prisma 7 の `@map` enum はTypeScript側で `as const` オブジェクトとして生成される。
**文字列リテラルではなくenum定数を使用すること**:

```typescript
import { DiscountType, CalendarSyncMethod } from '@/shared/generated/prisma/enums'

// NG: 文字列リテラル
if (space.discountType === 'none') { ... }
const defaultValue = 'polling'

// OK: Prisma enum定数
if (space.discountType === DiscountType.none) { ... }
const defaultValue = CalendarSyncMethod.polling
```

**注意**: `@map` enumのTS値はスキーマメンバー名（例: `post_name`）。DBマッピング値（例: `post-name`）ではない。

### 2. 型ガードは `enums.ts` に集約（Single Source of Truth）

全Prisma enumの型ガード（`isValid*`）とデフォルト値取得（`getValid*`）は `enums.ts` に一元化。
**ローカルファイルに型ガードを定義しない**:

```typescript
// NG: ローカルファイルに型ガードを定義
const VALID_TYPES = new Set<string>(Object.values(DiscountType))
function isDiscountType(value: unknown): value is DiscountType { ... }

// OK: enums.ts から import
import { isValidDiscountType, getValidDiscountType } from '@/shared/lib/validations/enums'

// 使用例（SelectionBox onChange）
onChange={(value) => {
  if (isValidDiscountType(value)) setDiscountType(value)
}}

// 使用例（デフォルト値付きパース）
const type = getValidDiscountType(rawValue)  // デフォルト: DiscountType.none
const type = getValidDiscountType(rawValue, DiscountType.percentage)  // カスタムデフォルト
```

### 3. Prisma enum を直接使用（型エイリアス不要）

型エイリアスによる間接参照は完了済み。Prisma enumを直接使用する:

```typescript
// NG: 型エイリアス（不要）
export type SpaceDiscountType = DiscountType

// OK: Prisma enumを直接使用
import { DiscountType } from '@/shared/generated/prisma/enums'
type Foo = { discountType: DiscountType }
```

### 4. SelectItem値にenum定数を使用

```tsx
// NG:
<SelectItem value="polling">ポーリング</SelectItem>

// OK:
<SelectItem value={CalendarSyncMethod.polling}>ポーリング</SelectItem>
```

### 5. 禁止事項（enum関連）

| 禁止 | 代替 |
|------|------|
| `'none'`, `'polling'` 等の文字列リテラル比較 | `DiscountType.none`, `CalendarSyncMethod.polling` |
| `new Set(['none', 'percentage', 'fixed'])` | `enums.ts` の `isValid*` / `getValid*` を使用 |
| `export type Foo = 'a' \| 'b'`（Prisma enumと同じ値） | Prisma enumを直接使用 |
| `.default('none')` (Zodスキーマ) | `.default(DiscountType.none)` |
| ローカルファイルに `isValid*` / `new Set(Object.values(...))` 定義 | `enums.ts` から import |
| `export type Foo = PrismaEnum`（不要な型エイリアス） | Prisma enumを直接使用 |

### 6. 配置規則（enum関連）

| ファイル | 内容 |
|----------|------|
| `@/shared/generated/prisma/enums` | Prisma生成enum定数（自動生成、編集禁止） |
| `@/shared/lib/validations/enums.ts` | 全enumの型ガード（`isValid*`）、デフォルト値取得（`getValid*`）、re-export、フィルターヘルパー |
| 各ドメインファイル | enum定数の import のみ。型ガードは `enums.ts` から import |

---

## JSONフィールドの型安全化

### 1. prisma-json-types-generator（推奨）

公式推奨の方法。スキーマレベルで型安全を実現:

```bash
npm install -D prisma-json-types-generator
```

```prisma
// schema.prisma
generator client {
  provider = "prisma-client"
}

generator json {
  provider = "prisma-json-types-generator"
}

model Settings {
  id   Int @id

  /// [SettingsJson]
  data Json
}
```

```typescript
// types/prisma-json.d.ts
declare global {
  namespace PrismaJson {
    type SettingsJson = {
      theme: 'light' | 'dark'
      notifications: boolean
    }
  }
}
export {}
```

### 2. Zodスキーマによるランタイムバリデーション

`Prisma.JsonValue`は`unknown`相当のため、ランタイムでZod検証:

```typescript
// @/shared/lib/json-validators.ts
import { z } from 'zod'

const stringArraySchema = z.array(z.string())

export function parseStringArray(value: unknown): string[] {
  const result = stringArraySchema.safeParse(value)
  return result.success ? result.data : []
}

// 使用例
const imageUrls = parseStringArray(space.imageUrls)  // string[]
```

### 3. 複雑なJSONフィールド（Zodスキーマ + 型推論）

Zodスキーマから型を推論し、パース関数を提供:

```typescript
// @/shared/lib/json-validators.ts
const businessTimeSlotSchema = z.object({
  openTime: z.string(),
  closeTime: z.string(),
})

const businessHoursDaySchema = z.object({
  isOpen: z.boolean(),
  slots: z.array(businessTimeSlotSchema),
})

const businessHoursSchema = z.object({
  monday: businessHoursDaySchema,
  // ... 全曜日
})

// 型はZodスキーマから推論
export type BusinessHours = z.infer<typeof businessHoursSchema>

// パース関数（旧形式の自動マイグレーション付き）
export function parseBusinessHours(value: unknown): BusinessHours | null {
  const result = businessHoursSchema.safeParse(value)
  if (result.success) return result.data
  // 旧形式からの変換を試行
  return null
}
```

### 4. React 19 シリアライゼーション

PrismaオブジェクトはSymbolプロパティを含むため、Client Componentsに直接渡せない。
`toPlainObject()` でプレーンオブジェクトに変換:

```typescript
import { toPlainObject, toPlainArray } from '@/shared/lib/serialize'

// Server Component → Client Component
const settings = await prisma.settings.findFirst({ select: { ... } })
return toPlainObject(settings)  // Symbolプロパティを除去

// 配列の場合
const items = await prisma.post.findMany({ ... })
return toPlainArray(items)
```

### 5. 配置規則

| ファイル | 内容 |
|----------|------|
| `@/shared/lib/json-validators.ts` | Zodスキーマ、型推論、パース関数 |
| `@/shared/lib/serialize.ts` | toPlainObject、toPlainArray、keysOf |

## クエリパターン

### Select句で型を限定

```typescript
// OK: 必要なフィールドのみ取得
const post = await prisma.post.findUnique({
  where: { id },
  select: {
    id: true,
    title: true,
    content: true,
  },
})

// NG: 全フィールド取得（パフォーマンス低下）
const post = await prisma.post.findUnique({
  where: { id },
})
```

### Include vs Select

```typescript
// OK: リレーションが必要な場合
const post = await prisma.post.findUnique({
  where: { id },
  include: { author: true },
})

// OK: リレーションの一部フィールドのみ
const post = await prisma.post.findUnique({
  where: { id },
  select: {
    id: true,
    author: {
      select: { name: true },
    },
  },
})
```

## トランザクション

### 複数操作の原子性

```typescript
const [post, auditLog] = await prisma.$transaction([
  prisma.post.create({ data: postData }),
  prisma.auditLog.create({ data: auditData }),
])
```

### インタラクティブトランザクション

```typescript
await prisma.$transaction(async (tx) => {
  const post = await tx.post.create({ data: postData })
  await tx.postTag.createMany({
    data: tags.map((tagId) => ({ postId: post.id, tagId })),
  })
  return post
})
```

## 禁止事項

1. **型アサーション禁止**
   - `value as string[]` → `parseStringArray(value)`

2. **rawクエリの乱用禁止**
   - Prisma Clientで表現できるクエリはClientを使用

3. **N+1クエリ禁止**
   - ループ内でクエリを発行しない
   - `include` / `select` でまとめて取得

## 参考

- `@/shared/lib/json-validators.ts` - JSONスキーマ、型推論、パース関数
- `@/shared/lib/serialize.ts` - シリアライゼーション（toPlainObject等）
- `@/shared/types/prisma.ts` - Prisma型拡張
