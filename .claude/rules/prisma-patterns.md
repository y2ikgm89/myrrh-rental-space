# Prisma パターンルール

> Prisma 7.3 / PostgreSQL対応

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

### 2. 複雑なJSONフィールド

型定義と型ガードをセットで提供:

```typescript
// @/shared/types/json-fields.ts
export interface TimeSlot {
  open: string   // "09:00" 形式
  close: string  // "18:00" 形式
}

export type BusinessHours = {
  [K in DayOfWeek]: TimeSlot | null
}

// 型ガード関数
export function isBusinessHours(value: unknown): value is BusinessHours {
  if (!isRecord(value)) return false
  // バリデーションロジック
}

// パース関数
export function parseBusinessHours(value: unknown): BusinessHours | null {
  if (!isBusinessHours(value)) return null
  return value
}
```

### 3. 配置規則

| ファイル | 内容 |
|----------|------|
| `@/shared/types/json-fields.ts` | 型定義、型ガード |
| `@/shared/lib/json-validators.ts` | Zodスキーマ、パース関数 |

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

- `@/shared/types/json-fields.ts` - JSON型定義
- `@/shared/lib/json-validators.ts` - JSONバリデーション
- `@/shared/types/prisma.ts` - Prisma型拡張
