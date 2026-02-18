---
paths:
  - src/**
---

# Prisma パターンルール

> Prisma 7.4 / WASM エンジン（`engineType = "client"` + `runtime = "bun"`）/ PostgreSQL

## Enum パターン（Prisma 7 mapped enums）

### 1. Prisma enum 定数を使用（文字列リテラル禁止）

Prisma 7 の `@map` enum は TypeScript 側で `as const` オブジェクトとして生成される。
**文字列リテラルではなく enum 定数を使用すること**:

```typescript
import { DiscountType, CalendarSyncMethod } from '@/shared/generated/prisma/client'

// NG: 文字列リテラル比較
if (space.discountType === 'none') { ... }
const defaultValue = 'polling'

// OK: Prisma enum 定数
if (space.discountType === DiscountType.none) { ... }
const defaultValue = CalendarSyncMethod.polling
```

**注意**: `@map` enum の TS 値はスキーマメンバー名（例: `post_name`）。DB マッピング値（例: `post-name`）ではない。

**Prisma 7 既知バグ（v7.2.0〜）**: mapped enum 値を Prisma Client 操作に渡すとランタイムエラーが発生する場合がある（[#28591](https://github.com/prisma/prisma/issues/28591)）。修正が出るまでは本コードベースの既存パターンに従い、enum 定数を使用し続ける。

### 2. 型ガードは enums.ts に集約（Single Source of Truth）

全 Prisma enum の型ガード（`isValid*`）とデフォルト値取得（`getValid*`）は `enums.ts` に一元化。
**ローカルファイルに型ガードを定義しない**:

```typescript
// NG: ローカルファイルに型ガードを定義
const VALID_TYPES = new Set<string>(Object.values(DiscountType))
function isDiscountType(value: unknown): value is DiscountType { ... }

// OK: enums.ts から import
import { isValidDiscountType, getValidDiscountType } from '@/shared/lib/validations/enums'

// 使用例（SelectionBox / Select の onChange）
onChange={(value) => {
  if (isValidDiscountType(value)) setDiscountType(value)
}}

// 使用例（デフォルト値付きパース — DB 値やフォーム初期値に最適）
const type = getValidDiscountType(rawValue)                       // デフォルト: DiscountType.none
const type = getValidDiscountType(rawValue, DiscountType.percentage)  // カスタムデフォルト
```

内部実装（参考）— `Set` による O(1) ルックアップ:

```typescript
// enums.ts 内部（編集禁止。パターン参照のみ）
const VALID_DISCOUNT_TYPES = new Set<string>(Object.values(DiscountType))

export function isValidDiscountType(value: unknown): value is DiscountType {
  return typeof value === 'string' && VALID_DISCOUNT_TYPES.has(value)
}
```

### 3. Prisma enum を直接使用（型エイリアス不要）

型エイリアスによる間接参照は不要。Prisma enum を直接使用する:

```typescript
// NG: 型エイリアス（削除済み。追加禁止）
export type SpaceDiscountType = DiscountType

// OK: Prisma enum を直接使用
import { DiscountType } from '@/shared/generated/prisma/client'
type Foo = { discountType: DiscountType }
```

### 4. SelectItem 値に enum 定数を使用

```tsx
// NG:
<SelectItem value="polling">ポーリング</SelectItem>

// OK:
<SelectItem value={CalendarSyncMethod.polling}>ポーリング</SelectItem>
```

### 5. 禁止事項（enum 関連）

| 禁止 | 代替 |
|------|------|
| `'none'`, `'polling'` 等の文字列リテラル比較 | `DiscountType.none`, `CalendarSyncMethod.polling` |
| `new Set(['none', 'percentage', 'fixed'])` | `enums.ts` の `isValid*` / `getValid*` を使用 |
| `export type Foo = 'a' \| 'b'`（Prisma enum と同じ値） | Prisma enum を直接使用 |
| `.default('none')` （Zod スキーマ） | `.default(DiscountType.none)` |
| ローカルファイルに `isValid*` / `new Set(Object.values(...))` 定義 | `enums.ts` から import |
| `export type Foo = PrismaEnum`（不要な型エイリアス） | Prisma enum を直接使用 |
| `z.nativeEnum(DiscountType)` （Zod 4 非推奨） | `z.enum(DiscountType)` |

### 6. 配置規則（enum 関連）

| ファイル | 内容 |
|----------|------|
| `@/shared/generated/prisma/client` | Prisma 生成 enum 定数（自動生成、編集禁止） |
| `@/shared/lib/validations/enums.ts` | 全 enum の型ガード（`isValid*`）、デフォルト値取得（`getValid*`）、re-export、フィルターヘルパー |
| 各ドメインファイル | enum 定数の import のみ。型ガードは `enums.ts` から import |

---

## JSON フィールドの型安全化

### Zod スキーマによるランタイムバリデーション

`Prisma.JsonValue` は `unknown` 相当のため、ランタイムで Zod 検証を行う。
全パース関数は `@/shared/lib/json-validators.ts` に集約:

```typescript
import { parseStringArray, parseBusinessHours } from '@/shared/lib/json-validators'

// string[] へのパース（失敗時は空配列を返す）
const imageUrls = parseStringArray(space.imageUrls)   // string[]
const facilities = parseStringArray(space.facilities)  // string[]
const tags = parseStringArray(post.tags)               // string[]

// 複雑な JSON フィールドのパース（失敗時は null を返す）
const businessHours = parseBusinessHours(settings.businessHours)  // BusinessHours | null
```

### 複雑な JSON フィールド（Zod スキーマ + 型推論）

Zod スキーマから型を推論し、パース関数を提供:

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
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema,
})

// 型は Zod スキーマから推論（手動型定義禁止）
export type BusinessTimeSlot = z.infer<typeof businessTimeSlotSchema>
export type BusinessHoursDay = z.infer<typeof businessHoursDaySchema>
export type BusinessHours = z.infer<typeof businessHoursSchema>

export function parseBusinessHours(value: unknown): BusinessHours | null {
  const result = businessHoursSchema.safeParse(value)
  return result.success ? result.data : null
}
```

### React 19 シリアライゼーション（toPlainObject / toPlainArray）

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

**注意**: `safeFetch` + `'use cache'` で取得した公開データは同様に `toPlainObject()` でラップする（`server-actions.md` §公開データ取得パターン 参照）。

### JSON フィールド配置規則

| ファイル | 内容 |
|----------|------|
| `@/shared/lib/json-validators.ts` | Zod スキーマ、型推論、パース関数 |
| `@/shared/lib/serialize.ts` | `toPlainObject`、`toPlainArray`、`keysOf` |

---

## Decimal 自動変換（$extends）

`prisma.ts` の `$extends` により、全 Decimal フィールドが自動的に `number` に変換される。
**手動で `Number()` を呼び出す必要はない**:

```typescript
// NG: 手動変換（不要）
const price = Number(space.pricePerHour)

// OK: $extends が自動変換済み
const price = space.pricePerHour  // number 型
```

**例外**: 集計結果（`_sum`, `_avg` 等）は `$extends` が効かないため、手動で `Number()` を使用:

```typescript
// 集計結果のみ手動変換が必要
const totalRevenue = await prisma.reservation.aggregate({ _sum: { totalPrice: true } })
const total = Number(totalRevenue._sum.totalPrice ?? 0)
```

### 対象モデルと型エクスポート

`prisma.ts` から `ConvertDecimalFields<T>` 適用済みの型をエクスポート済み:

```typescript
import type { Space, Reservation, Customer, Settings, Coupon } from '@/shared/lib/prisma'

// これらの型は Decimal が number に変換済み
const space: Space = await prisma.space.findUniqueOrThrow({ where: { id } })
space.pricePerHour  // number（Decimal ではない）
```

---

## Lexical JSON Primary パターン

7 モデル（Post, PostVersion, News, NewsVersion, TermsVersion, Section, FaqItem）が以下の構成を持つ:

```prisma
contentHtml String  @db.Text @map("content")  // HTML キャッシュ（公開表示用）
contentJson Json?                              // Lexical EditorState JSON（プライマリ）
```

### Server Actions での保存パターン

Editor の `onChange` は JSON 文字列を返す。Server Actions で `renderEditorStateToHtmlLazy()` を使い HTML を生成し、DB に同時保存する:

```typescript
import { renderEditorStateToHtmlLazy } from '@/admin/lib/lazy-renderer'

export async function updatePost(id: string, data: PostInput) {
  // contentJson（プライマリ）と contentHtml（キャッシュ）を同時保存
  const contentJson = JSON.parse(data.contentJson) as Prisma.InputJsonObject
  const contentHtml = await renderEditorStateToHtmlLazy(data.contentJson)

  await prisma.post.update({
    where: { id },
    data: { contentJson, contentHtml },
  })
}
```

### lazy-renderer が必須な理由

`renderEditorStateToHtml` は Lexical headless editor を使用する。Server Actions でトップレベル import するとビルド時に `createContext is not a function` エラーが発生する。
`lazy-renderer.ts` の動的 import パターンが必須:

```typescript
// NG: トップレベル import（ビルドエラー）
import { renderEditorStateToHtml } from '@/admin/components/editor/lexical/preview/headless-renderer'

// OK: lazy-renderer 経由の動的 import
import { renderEditorStateToHtmlLazy } from '@/admin/lib/lazy-renderer'
const html = await renderEditorStateToHtmlLazy(jsonString)
```

### 公開表示でのレンダリング

公開ページでは `contentHtml` を直接使用（再レンダリング不要）:

```typescript
// 公開ページコンポーネント
import { SanitizedHtml } from '@/shared/components/SanitizedHtml'

export function PostContent({ post }: { post: Post }) {
  return <SanitizedHtml html={post.contentHtml} />
}
```

既存 HTML のみのデータ（`contentJson` が null）は `HtmlInitializerPlugin` でフォールバック表示。

---

## クエリパターン

### Select 句で型を限定

```typescript
// OK: 必要なフィールドのみ取得
const post = await prisma.post.findUnique({
  where: { id },
  select: {
    id: true,
    title: true,
    contentHtml: true,
  },
})

// NG: 全フィールド取得（パフォーマンス低下・不要なデータ転送）
const post = await prisma.post.findUnique({ where: { id } })
```

### Include vs Select

```typescript
// OK: リレーションが必要な場合
const post = await prisma.post.findUnique({
  where: { id },
  include: { author: true },
})

// OK: リレーションの一部フィールドのみ（推奨）
const post = await prisma.post.findUnique({
  where: { id },
  select: {
    id: true,
    title: true,
    author: {
      select: { name: true },
    },
  },
})
```

### トランザクション

```typescript
// バッチトランザクション（複数操作の原子性）
const [post, auditLog] = await prisma.$transaction([
  prisma.post.create({ data: postData }),
  prisma.auditLog.create({ data: auditData }),
])

// インタラクティブトランザクション（依存関係あり）
await prisma.$transaction(async (tx) => {
  const post = await tx.post.create({ data: postData })
  await tx.postTag.createMany({
    data: tags.map((tagId) => ({ postId: post.id, tagId })),
  })
  return post
})
```

---

## 禁止事項

1. **型アサーション禁止**
   - `value as string[]` → `parseStringArray(value)`
   - `value as DiscountType` → `isValidDiscountType(value)` または `getValidDiscountType(value)`

2. **raw クエリの乱用禁止**
   - Prisma Client で表現できるクエリは Client を使用
   - `prisma.$queryRaw` は Prisma で表現不可能な場合のみ

3. **N+1 クエリ禁止**
   - ループ内でクエリを発行しない
   - `include` / `select` でまとめて取得

4. **手動 `Number()` 変換禁止（集計以外）**
   - `$extends` が自動変換済み。手動の `Number(space.pricePerHour)` は不要

5. **Prisma オブジェクトの直接 props 渡し禁止**
   - `toPlainObject()` / `toPlainArray()` でシリアライズしてから渡す

6. **`renderEditorStateToHtml` のトップレベル import 禁止**
   - `renderEditorStateToHtmlLazy()` を使用（ビルドエラー回避）

---

## ファイル配置

| パス | 内容 |
|------|------|
| `@/shared/generated/prisma/client` | Prisma 生成クライアント・enum（自動生成、編集禁止） |
| `@/shared/lib/prisma.ts` | Prisma シングルトン・`$extends`（Decimal 自動変換）・型エクスポート |
| `@/shared/lib/json-validators.ts` | JSON フィールド Zod スキーマ・型・パース関数 |
| `@/shared/lib/serialize.ts` | `toPlainObject`、`toPlainArray`、`keysOf` |
| `@/shared/lib/validations/enums.ts` | 全 enum 型ガード（`isValid*`）・デフォルト値取得（`getValid*`）・re-export |
| `@/admin/lib/lazy-renderer.ts` | `renderEditorStateToHtmlLazy`（動的 import ラッパー） |
