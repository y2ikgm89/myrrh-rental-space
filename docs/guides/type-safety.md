# 型安全・型定義要件定義

> **Note**: このドキュメントには、レンタルスペース管理システムにおける型安全・型定義の包括的な要件定義が記載されています。技術スタックの詳細については、`[CLAUDE.md](../CLAUDE.md)`を参照してください。実装ベストプラクティスについては、`[BEST_PRACTICES.md](coding-standards.md)`を参照してください。

**最終更新**: 2026-01-08

**注意**: このドキュメントは、公式ドキュメント（TypeScript 5.9、Zod 4.3、Prisma 7、Next.js 16、React 19、nuqs 2.8.8）の最新情報を確認して作成されています。

---

## 目的

このドキュメントは、プロジェクト全体で型安全性を確保し、一貫した型定義を維持するための包括的な要件定義を記載します。型安全性の向上により、コンパイル時のエラー検出、コードの可読性向上、保守性の向上を実現します。

---

## 概要

### 型安全性の重要性

型安全性は、以下の理由で重要です：

1. **コンパイル時のエラー検出**: 実行時エラーを事前に防止
2. **コードの可読性向上**: 型情報により、コードの意図が明確になる
3. **保守性の向上**: 型変更時の影響範囲を明確に把握可能
4. **開発効率の向上**: IDEの自動補完やリファクタリングが正確に動作
5. **ドキュメントとしての役割**: 型定義が実質的なAPI仕様書として機能

### プロジェクトでの型安全性の位置づけ

このプロジェクトでは、以下の技術スタックを使用して型安全性を確保します：

- **TypeScript 5.9.3**: 型システムの基盤
- **Prisma 7.2.0**: データベーススキーマから型を自動生成
- **Zod 4.3.5**: ランタイムバリデーションと型推論
- **nuqs 2.8.8**: URLクエリパラメータの型安全な管理
- **React 19.2.3 + Next.js 16.1.1**: Server Components、Server Actionsの型安全性

---

## 1. TypeScript Strict Modeの徹底

### 1.1 要件ID: REQ-TYPE-001

**要件名**: TypeScript Strict Modeの徹底

**詳細仕様**:

#### 1.1.1 TypeScript Strict Modeの有効化

- `**tsconfig.json`での設定**: `strict: true`を有効化
- **すべてのstrictオプションを有効化**:
  - `strict: true`（すべてのstrictオプションを有効化）
  - `noImplicitAny: true`（暗黙の`any`を禁止）
  - `strictNullChecks: true`（null/undefinedの厳密なチェック）
  - `strictFunctionTypes: true`（関数型の厳密なチェック）
  - `strictBindCallApply: true`（bind/call/applyの厳密なチェック）
  - `strictPropertyInitialization: true`（プロパティ初期化の厳密なチェック）
  - `noImplicitThis: true`（暗黙の`this`を禁止）
  - `alwaysStrict: true`（常にstrictモードで解析）

#### 1.1.2 型注釈の徹底

- **関数のパラメータ**: すべての関数パラメータに明示的な型注釈を付与
- **関数の戻り値**: すべての関数の戻り値に明示的な型注釈を付与
- **変数**: 型が明確でない場合は明示的な型注釈を付与
- `**any`型の使用禁止**: `any`型の使用を完全に禁止（`unknown`を使用）

#### 1.1.3 適用範囲

- **すべてのTypeScriptファイル**: `.ts`, `.tsx`ファイルすべて
- **すべての関数**: 公開関数、非公開関数、アロー関数すべて
- **すべての変数**: グローバル変数、ローカル変数すべて

**成功基準**:

- TypeScript Strict Modeが有効化されている
- すべての関数に明示的な型注釈がある
- `any`型の使用が0件である
- `bun run type-check`で型エラーがない

**検証方法**:

- `tsconfig.json`の設定を確認
- `bun run type-check`で型エラーがないことを確認
- コードレビューで型注釈を確認
- ESLintルールで`any`型の使用を検出

**参照ドキュメント**:

- `[../plans/001-architecture-improvements.md](./../plans/001-architecture-improvements.md)` - REQ-TYPE-001
- `[BEST_PRACTICES.md](coding-standards.md)` - 型安全性の基本原則
- `[.cursor/skills/typescript-strict/SKILL.md](../.cursor/skills/typescript-strict/SKILL.md)` - TypeScript strict modeガイド

---

## 2. 型定義の統一と一元管理

### 2.1 要件ID: REQ-TYPE-002

**要件名**: 型定義の統一

**詳細仕様**:

#### 2.1.1 型定義の統一

- **Prisma生成型の活用**: Prismaスキーマから自動生成される型を優先的に使用
- **Zodスキーマからの型推論**: `z.infer`, `z.input`, `z.output`を使用して型を推論
- **型定義の重複排除**: 同じ型定義を複数箇所で定義しない（DRY原則）

#### 2.1.2 型定義の管理

- **型定義の一元管理**: `src/types/`ディレクトリに型定義を集約
- **型定義の命名規則の統一**: 
  - エンティティ型: `Entity`（例: `Space`, `Reservation`）
  - 入力型: `EntityInput`（例: `CreateSpaceInput`, `UpdateSpaceInput`）
  - 出力型: `EntityOutput`（例: `SpacePublic`, `ReservationWithDetails`）
  - Props型: `ComponentNameProps`（例: `SpaceCardProps`）
- **型定義のドキュメント化**: JSDocコメントで型定義を説明

#### 2.1.3 適用範囲

- **すべての型定義**: エンティティ型、入力型、出力型、Props型すべて
- **すべてのスキーマ定義**: Zodスキーマ、Prismaスキーマすべて
- **すべてのAPIレスポンス**: Server Actions、Route Handlersの戻り値すべて

**実装例**:

```typescript
// ✅ 良い例: Zodスキーマから型を推論
// src/lib/validations/space.ts
import { z } from 'zod'

export const createSpaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  capacity: z.number().int().positive(),
  hourlyPrice: z.number().nonnegative(),
})

// src/types/space.ts
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { createSpaceSchema, updateSpaceSchema } from '@/lib/validations/space'

// Zodスキーマから型を推論
export type CreateSpaceInput = z.infer<typeof createSpaceSchema>
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>

// Prisma型を再利用
export type Space = Prisma.SpaceGetPayload<{}>
export type SpaceCreateInput = Prisma.SpaceCreateInput
export type SpaceUpdateInput = Prisma.SpaceUpdateInput

// カスタム型を定義
export type SpaceWithReservations = Prisma.SpaceGetPayload<{
  include: {
    reservations: true
  }
}>

export type SpacePublic = Prisma.SpaceGetPayload<{
  select: {
    id: true
    name: true
    mainImageUrl: true
    hourlyPrice: true
  }
}>

// Server Actionでの使用
// src/actions/admin/spaces.ts
import type { CreateSpaceInput } from '@/types/space'

export async function createSpace(
  data: CreateSpaceInput
): Promise<{ success: boolean; spaceId?: string; error?: string }> {
  // ...
}
```

**成功基準**:

- 型定義が統一されている
- Prisma生成型が適切に活用されている
- Zodスキーマからの型推論が適切に使用されている
- 型定義の重複がない

**検証方法**:

- 型定義の実装をレビュー
- 型定義の統一性を確認
- 型推論が適切に機能していることを確認
- 型定義の重複を検出（ESLintルール）

**参照ドキュメント**:

- `[../plans/001-architecture-improvements.md](./../plans/001-architecture-improvements.md)` - REQ-TYPE-002
- `[BEST_PRACTICES.md](coding-standards.md)` - 型の再利用とDRY原則
- `[PROJECT_STRUCTURE.md](../architecture/PROJECT_STRUCTURE.md)` - 型定義の配置（`src/types/`）

---

## 3. バリデーションスキーマの統一

### 3.1 要件ID: REQ-TYPE-003

**要件名**: バリデーションスキーマの統一

**詳細仕様**:

#### 3.1.1 バリデーションスキーマの統一

- **クライアントとサーバーで同じZodスキーマを使用**: フォームバリデーションとServer Actionsで同じスキーマを使用
- **バリデーションエラーの型安全な処理**: `z.ZodError`を型安全に処理
- **エラーメッセージの国際化対応**: 将来的な多言語対応を考慮した設計（現時点では日本語のみ）

#### 3.1.1.1 最新推奨（Zod 4.3.5）

- **入力境界は`unknown`からZodで確定**: `safeParse`で検証し、成功時のみ`z.output`型を扱う
- **`z.input`/`z.output`の使い分け**: 前処理/変換がある場合は`z.input`と`z.output`を分離する
- **キャスト禁止**: `as`による型の強制は避け、Zodスキーマで型を確定する
- **デフォルト値の一元化**: 検証失敗時のフォールバックはスキーマと同じ場所に定義する

**推奨パターン**:

```typescript
const input = { email: value, password: value }
const result = credentialsSchema.safeParse(input)
if (!result.success) {
  return { error: '入力内容を確認してください' }
}
const data = result.data // z.output<typeof credentialsSchema>
```

#### 3.1.2 バリデーションスキーマの管理

- **バリデーションスキーマの一元管理**: `src/lib/validations/`ディレクトリにスキーマを集約
- **バリデーションスキーマの命名規則の統一**:
  - 作成スキーマ: `createEntitySchema`（例: `createSpaceSchema`）
  - 更新スキーマ: `updateEntitySchema`（例: `updateSpaceSchema`）
  - クエリスキーマ: `entityQuerySchema`（例: `spaceQuerySchema`）
- **バリデーションスキーマのドキュメント化**: JSDocコメントでスキーマを説明

#### 3.1.3 適用範囲

- **すべてのフォーム**: 公開ページ、管理画面のフォームすべて
- **すべてのAPI Routes**: Route Handlersのリクエストバリデーションすべて
- **すべてのServer Actions**: Server Actionsの入力バリデーションすべて

**実装例**:

```typescript
// ✅ 良い例: クライアントとサーバーで同じスキーマを使用
// src/lib/validations/reservation.ts
import { z } from 'zod'

export const createReservationSchema = z.object({
  spaceId: z.string().uuid(),
  customerLastName: z.string().min(1).max(50),
  customerFirstName: z.string().min(1).max(50),
  customerEmail: z.string().email(),
  startTime: z.date(),
  endTime: z.date(),
}).refine((data) => data.endTime > data.startTime, {
  message: '終了時刻は開始時刻より後である必要があります',
  path: ['endTime'],
})

// 型推論
export type CreateReservationInput = z.infer<typeof createReservationSchema>

// Server Actionでの使用
// src/actions/reservation.ts
'use server'

import { createReservationSchema } from '@/lib/validations/reservation'
import type { CreateReservationInput } from '@/lib/validations/reservation'

export async function createReservation(
  data: CreateReservationInput
): Promise<{ success: boolean; reservationId?: string; error?: string }> {
  try {
    // サーバーサイドで再度バリデーション
    const validatedData = createReservationSchema.parse(data)
    // ...
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'バリデーションエラー',
        details: error.errors,
      }
    }
    // ...
  }
}

// Client Componentでの使用
// src/components/public/ReservationForm.tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createReservationSchema } from '@/lib/validations/reservation'

export function ReservationForm() {
  const form = useForm({
    resolver: zodResolver(createReservationSchema),
  })
  // ...
}
```

**成功基準**:

- クライアントとサーバーで同じZodスキーマが使用されている
- バリデーションエラーが型安全に処理されている
- バリデーションスキーマが統一されている

**検証方法**:

- バリデーションスキーマの実装をレビュー
- バリデーションスキーマの統一性を確認
- バリデーションエラーの処理を確認

**参照ドキュメント**:

- `[../plans/001-architecture-improvements.md](./../plans/001-architecture-improvements.md)` - REQ-TYPE-003
- `[API.md](../guides/coding-standards.md)` - Server Actionsのバリデーション
- `[README.md](../security/README.md)` - 入力検証

---

## 4. Prisma型定義の活用

### 4.1 Prisma 7の型生成

**要件**: Prisma 7のカスタム出力パスを使用して型を生成

**詳細仕様**:

#### 4.1.1 Prisma型のインポート

- **カスタム出力パス**: `@/generated/prisma/client`から型をインポート（Prisma 7では必須）
- **型のみのインポート**: `import type`を使用して型のみをインポート
- **PrismaClientのインポート**: `import { PrismaClient } from '@/generated/prisma/client'`
- **ドライバーアダプター**: Prisma 7では、データベース接続にドライバーアダプターが必要（例: `@prisma/adapter-pg`）

**重要**: Prisma 7では、カスタム出力パスの指定が必須です。`node_modules/.prisma/client`へのデフォルト出力は廃止されました。

**実装例**:

```typescript
// ✅ 良い例: Prisma 7の型インポート
// src/types/space.ts
import type { Prisma } from '@/generated/prisma/client'

// Prismaの生成型を使用
export type SpaceCreateInput = Prisma.SpaceCreateInput
export type SpaceUpdateInput = Prisma.SpaceUpdateInput
export type SpaceWhereInput = Prisma.SpaceWhereInput

// カスタム型をPrisma型から構築
export type SpaceWithReservations = Prisma.SpaceGetPayload<{
  include: {
    reservations: true
  }
}>

// 特定のフィールドのみを含む型
export type SpacePublic = Prisma.SpaceGetPayload<{
  select: {
    id: true
    name: true
    hourlyPrice: true
  }
}>
```

**Prisma 7のドライバーアダプター設定**:

```typescript
// ✅ 良い例: Prisma 7のドライバーアダプター設定
// src/lib/prisma.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const adapter = new PrismaPg(pool)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**注意**: Prisma 7では、データベース接続にドライバーアダプターが必要です。PostgreSQLの場合は`@prisma/adapter-pg`を使用します。

#### 4.1.2 Prisma型の活用パターン

- `**Prisma.EntityGetPayload**`: `select`や`include`を使用したカスタム型の定義
- `**Prisma.EntityCreateInput**`: エンティティ作成時の入力型
- `**Prisma.EntityUpdateInput**`: エンティティ更新時の入力型
- `**Prisma.EntityWhereInput**`: エンティティ検索時の条件型
- **Enum型**: Prisma Enum型を直接使用（例: `CustomerStatus`）

**参照ドキュメント**:

- `[PRISMA_7.md](../guides/prisma.md)` - Prisma 7のインポート方法
- `[DATABASE_DESIGN.md](./DATABASE_DESIGN.md)` - Prismaスキーマ設計
- `[BEST_PRACTICES.md](coding-standards.md)` - Prisma 7の型安全性

---

## 5. Zod型定義の活用

### 5.1 Zod 4.3.5の型推論

**要件**: Zodスキーマから型を推論し、ランタイムバリデーションと型安全性を両立

**詳細仕様**:

#### 5.1.1 `z.infer`, `z.input`, `z.output`の使い分け

- `**z.infer**`: スキーマから推論される型（通常は`z.output`と同じ）
- `**z.input**`: 入力時の型（変換前、`z.preprocess`を使用する場合）
- `**z.output**`: 出力時の型（変換後、`z.transform`を使用する場合）

**実装例**:

```typescript
// ✅ 良い例: Zod型の使い分け
import { z } from 'zod'

const createSpaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  capacity: z.number().int().positive(),
  hourlyPrice: z.number().nonnegative(),
})

// z.infer: スキーマから推論される型（通常はz.outputと同じ）
type CreateSpaceInput = z.infer<typeof createSpaceSchema>

// z.input: 入力時の型（変換前、例: z.preprocessを使用する場合）
type CreateSpaceInputRaw = z.input<typeof createSpaceSchema>

// z.output: 出力時の型（変換後、例: z.transformを使用する場合）
type CreateSpaceOutput = z.output<typeof createSpaceSchema>

// Server Actionでの使用
export async function createSpace(
  data: CreateSpaceInput
): Promise<{ success: boolean; spaceId?: string }> {
  // parse()はz.output型を返す
  const validatedData = createSpaceSchema.parse(data)
  
  // validatedDataの型はCreateSpaceOutput（この場合はCreateSpaceInputと同じ）
  const space = await prisma.space.create({
    data: validatedData,
  })

  return { success: true, spaceId: space.id }
}
```

#### 5.1.2 型ガードとしてのZodスキーマ

- **Zodスキーマを型ガードとして使用**: `safeParse`を使用して型ガード関数を作成
- `**safeParse`の推奨**: 例外を投げずにバリデーション結果を返すため、より制御されたエラーハンドリングが可能

**実装例**:

```typescript
// ✅ 良い例: Zodスキーマを型ガードとして使用
import { z } from 'zod'

const spaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hourlyPrice: z.number().nonnegative(),
})

// 型ガード関数
function isSpace(data: unknown): data is z.infer<typeof spaceSchema> {
  return spaceSchema.safeParse(data).success
}

// ✅ より良い例: safeParseを使用した関数型のエラーハンドリング
function processSpace(data: unknown): { success: true; data: z.infer<typeof spaceSchema> } | { success: false; error: z.ZodError } {
  const result = spaceSchema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  } else {
    return { success: false, error: result.error }
  }
}

// 使用例
const result = processSpace(data)
if (result.success) {
  // result.dataの型が保証されている
  console.log(result.data.name, result.data.hourlyPrice)
} else {
  // result.errorの型がz.ZodErrorに絞り込まれる
  console.error('Validation errors:', result.error.errors)
}
```

**参照ドキュメント**:

- `[BEST_PRACTICES.md](coding-standards.md)` - Zod 4.3.5の型安全性
- [Zod Documentation - safeParse](https://zod.dev/?id=safeparse) - safeParseの公式ドキュメント

---

## 6. React 19 + Next.js 16の型安全性

### 6.1 Server Componentsの型安全性

**要件**: Next.js 16のServer Componentsで適切な型定義を使用

**詳細仕様**:

#### 6.1.1 Server Componentの型定義

- `**params`はPromise**: Next.js 16では`params`が`Promise`型
- `**searchParams`はPromise**: Next.js 16では`searchParams`が`Promise`型
- **明示的な型注釈**: Server ComponentのPropsに明示的な型注釈を付与

**実装例**:

```typescript
// ✅ 良い例: Server Componentの型定義
// src/app/spaces/[id]/page.tsx
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function SpacePage({ params }: PageProps) {
  const { id } = await params // Next.js 16ではparamsはPromise
  
  const space = await prisma.space.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      hourlyPrice: true,
    },
  })

  if (!space) {
    notFound()
  }

  return <SpaceDetails space={space} />
}
```

#### 6.1.2 Promise型の扱い（React 19の`use()`フック）

- **Promise型を明示的に定義**: Client Componentに渡すPromise型を明示的に定義
- `**use()`フックの型安全性**: React 19の`use()`フックでPromise型を型安全に処理
- **Promiseの作成場所**: Promiseはrender内で作成せず、Server Componentで作成してClient Componentに渡す
- **条件付き使用**: `use()`フックは条件付きで呼び出すことができる（従来のフックとは異なる）

**実装例**:

```typescript
// ✅ 良い例: Promise型の型安全性
// Server Component
import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'

async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const post = await prisma.post.findUnique({
    where: { slug },
  })

  if (!post) {
    notFound()
  }

  // Promise型を明示的に定義
  const commentsPromise: Promise<Comment[]> = prisma.comment.findMany({
    where: { postId: post.id },
  })

  return (
    <article>
      <h1>{post.title}</h1>
      <Suspense fallback={<CommentsLoading />}>
        <Comments commentsPromise={commentsPromise} />
      </Suspense>
    </article>
  )
}

// Client Component
'use client'
import { use } from 'react'

interface CommentsProps {
  commentsPromise: Promise<Comment[]>
}

function Comments({ commentsPromise }: CommentsProps) {
  // ✅ 良い例: Promise型が保証されている
  const comments = use(commentsPromise)
  
  return (
    <div>
      {comments.map(comment => (
        <CommentItem key={comment.id} comment={comment} />
      ))}
    </div>
  )
}

// ❌ 悪い例: render内でPromiseを作成（再レンダリング時に不安定になる）
function BadComments() {
  // これは避けるべき
  const commentsPromise = fetchComments() // 再レンダリングのたびに新しいPromiseが作成される
  const comments = use(commentsPromise)
  // ...
}
```

**重要な注意事項**:
- **Promiseの作成**: PromiseはServer Componentで作成し、Client Componentにpropsとして渡す
- **再レンダリング**: Client Componentのrender内でPromiseを作成すると、再レンダリングのたびに新しいPromiseが作成され、不安定な動作を引き起こす可能性がある
- **条件付き使用**: `use()`フックは条件付きで呼び出すことができる（従来のフックとは異なる）

**参照ドキュメント**:

- `[BEST_PRACTICES.md](coding-standards.md)` - React 19 + Next.js 16の型安全性

---

## 7. Server Actionsの型安全性

### 7.1 Server Actionsの型定義

**要件**: Server ActionsでZodスキーマから型を推論し、明示的な戻り値の型を定義

**詳細仕様**:

#### 7.1.1 Server Actionの型定義パターン

- **入力型**: Zodスキーマから`z.infer`で推論
- **戻り値型**: 判別可能なユニオン型（Discriminated Union）を使用
- **エラーハンドリング**: 型安全なエラーハンドリング

**実装例**:

```typescript
// ✅ 良い例: Server Actionの型安全性
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { createSpaceSchema } from '@/lib/validations/space'

// Zodスキーマから型を推論
type CreateSpaceInput = z.infer<typeof createSpaceSchema>

// 戻り値の型を明示的に定義（判別可能なユニオン型）
type CreateSpaceResult =
  | { success: true; spaceId: string }
  | { success: false; error: string; details?: z.ZodError }

export async function createSpace(
  data: CreateSpaceInput
): Promise<CreateSpaceResult> {
  try {
    // サーバーサイドで再度バリデーション（型安全性の確保）
    const validatedData = createSpaceSchema.parse(data)
    
    const space = await prisma.space.create({
      data: validatedData,
    })

    revalidatePath('/spaces')
    
    return { success: true, spaceId: space.id }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Validation error',
        details: error,
      }
    }
    
    return {
      success: false,
      error: 'Failed to create space',
    }
  }
}
```

**参照ドキュメント**:

- `[API.md](../guides/coding-standards.md)` - Server Actions仕様
- `[BEST_PRACTICES.md](coding-standards.md)` - Server Actionsの型安全性

---

## 8. Route Handlersの型安全性

### 8.1 Route Handlersの型定義

**要件**: Route Handlersで`NextRequest`と`NextResponse`の型を適切に使用

**詳細仕様**:

#### 8.1.1 Route Handlerの型定義パターン

- **リクエスト型**: `NextRequest`を使用
- **レスポンス型**: `NextResponse`を使用
- **クエリパラメータ**: Zodスキーマでバリデーションし、型推論

**実装例**:

```typescript
// ✅ 良い例: Route Handlerの型安全性
// src/app/api/spaces/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const getSpacesQuerySchema = z.object({
  page: z.string().optional().transform(val => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform(val => (val ? parseInt(val, 10) : 12)),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const query = getSpacesQuerySchema.parse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
    })

    const spaces = await prisma.space.findMany({
      where: { isPublished: true },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    })

    return NextResponse.json({ spaces })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

**参照ドキュメント**:

- `[API.md](../guides/coding-standards.md)` - Route Handlers仕様
- `[BEST_PRACTICES.md](coding-standards.md)` - Route Handlersの型安全性

---

## 9. URLクエリパラメータの型安全性（nuqs）

### 9.1 nuqsによる型安全なクエリパラメータ管理

**要件**: nuqsを使用してURLクエリパラメータを型安全に管理

**詳細仕様**:

#### 9.1.1 nuqsパーサーの定義

- **パーサーの一元管理**: `src/lib/nuqs/`ディレクトリにパーサーを集約
- **型安全なパーサー**: `parseAsInteger`, `parseAsString`, `parseAsBoolean`等を使用
- **Server Componentsでの使用**: `createSearchParamsCache`を使用して型安全にアクセス

**実装例**:

```typescript
// ✅ 良い例: nuqsパーサーの定義
// src/lib/nuqs/post-parsers.ts
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from 'nuqs/server'

export const postParsers = {
  page: parseAsInteger.withDefault(1),
  category: parseAsString,
  tag: parseAsString,
  search: parseAsString,
}

export const postSearchParamsCache = createSearchParamsCache(postParsers)

// Server Componentでの使用
// src/app/posts/page.tsx
import { postSearchParamsCache } from '@/lib/nuqs/post-parsers'
import type { SearchParams } from 'nuqs/server'

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  // ⚠️ Next.js 16では searchParams が Promise
  const { page, category, tag, search } = await postSearchParamsCache.parse(searchParams)

  // データ取得（ISRキャッシュ）
  const { posts, totalPages } = await getPosts({ page, category, tag, search })

  return (
    <div>
      <PostFilters />
      <PostList posts={posts} />
      <Pagination currentPage={page} totalPages={totalPages} />
    </div>
  )
}

// Client Componentでの使用
// src/components/public/PostFilters.tsx
'use client'
import { useQueryStates } from 'nuqs'
import { postParsers } from '@/lib/nuqs/post-parsers'

export function PostFilters() {
  const [filters, setFilters] = useQueryStates(postParsers)

  // フィルタ変更時にURLを更新
  const handleCategoryChange = (categorySlug: string | null) => {
    setFilters({ category: categorySlug, page: 1 })
  }

  return (
    <div>
      {/* フィルタUI */}
    </div>
  )
}

// ネストされたServer Componentでの使用
// src/components/public/PostResults.tsx
import { postSearchParamsCache } from '@/lib/nuqs/post-parsers'

export function PostResults() {
  // ネストされたServer Componentでも型安全にアクセス可能
  const maxResults = postSearchParamsCache.get('limit') ?? 12

  return <span>最大{maxResults}件表示</span>
}
```

**重要な注意事項**:
- **ネストされたServer Components**: `createSearchParamsCache`の`get`メソッドを使用して、ネストされたServer Componentsでも型安全にクエリパラメータにアクセス可能
- **Prop drillingの回避**: `get`メソッドを使用することで、propsとして渡す必要がなくなる

**参照ドキュメント**:

- [`nuqs.md`](./nuqs.md) - nuqs要件定義
- [nuqs Documentation - Server-side](https://nuqs.dev/docs/server-side) - nuqsのサーバーサイド使用法の公式ドキュメント

---

## 10. エラーハンドリングの型安全性

### 10.1 判別可能なユニオン型（Discriminated Unions）

**要件**: エラーハンドリングで判別可能なユニオン型を使用して型安全性を確保

**詳細仕様**:

#### 10.1.1 Result型パターン

- **判別可能なユニオン型**: `success`フラグで型を判別
- **型の絞り込み**: TypeScriptが自動的に型を絞り込む

**実装例**:

```typescript
// ✅ 良い例: 判別可能なユニオン型
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string; details?: unknown }

export async function createSpace(
  data: CreateSpaceInput
): Promise<Result<Space>> {
  try {
    const validatedData = createSpaceSchema.parse(data)
    const space = await prisma.space.create({
      data: validatedData,
    })

    return { success: true, data: space }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      }
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return {
          success: false,
          error: 'Duplicate entry',
          code: 'DUPLICATE_ENTRY',
        }
      }
    }

    return {
      success: false,
      error: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
      details: error,
    }
  }
}

// 使用例: 型安全性が保証される
const result = await createSpace(data)
if (result.success) {
  // result.dataの型がSpaceに絞り込まれる
  console.log(result.data.name)
} else {
  // result.errorの型がstringに絞り込まれる
  console.error(result.error, result.code)
}
```

**参照ドキュメント**:

- `[BEST_PRACTICES.md](coding-standards.md)` - エラーハンドリングの型安全性

---

## 11. コンポーネントPropsの型定義

### 11.1 コンポーネントPropsの型定義

**要件**: コンポーネントPropsの型定義を適切に管理

**詳細仕様**:

#### 11.1.1 Props型の定義パターン

- `**interface`を使用**: オブジェクト形状で拡張可能な場合は`interface`を使用
- `**type`を使用**: ユニオン型、交差型、計算型の場合は`type`を使用
- **型のエクスポート**: Props型をエクスポートして再利用可能に

**実装例**:

```typescript
// ✅ 良い例: コンポーネントPropsの型定義
// src/components/public/SpaceCard.tsx
import type { SpacePublic } from '@/types/space'

interface SpaceCardProps {
  space: SpacePublic
  onSelect?: (id: string) => void
  className?: string
}

export function SpaceCard({ space, onSelect, className }: SpaceCardProps) {
  return (
    <div className={className}>
      <h2>{space.name}</h2>
      <img src={space.mainImageUrl} alt={space.name} />
      <p>¥{space.hourlyPrice}/hour</p>
      {onSelect && (
        <button onClick={() => onSelect(space.id)}>選択</button>
      )}
    </div>
  )
}
```

**参照ドキュメント**:

- `[BEST_PRACTICES.md](coding-standards.md)` - コンポーネントPropsの型定義
- `[.cursor/rules/code-style/RULE.md](../.cursor/rules/code-style/RULE.md)` - コードスタイル標準

---

## 12. 型定義の配置と命名規則

### 12.1 型定義の配置

**要件**: 型定義を適切な場所に配置し、命名規則を統一

**詳細仕様**:

#### 12.1.1 型定義の配置

- `**src/types/**`: エンティティ型、入力型、出力型、Props型を配置
- `**src/lib/validations/**`: Zodスキーマを配置（型推論も含む）
- `**src/lib/nuqs/**`: nuqsパーサーを配置（型定義も含む）
- **モジュール内**: そのモジュールでのみ使用する型はモジュール内に定義

#### 12.1.2 型定義の命名規則

- **エンティティ型**: `Entity`（例: `Space`, `Reservation`, `Customer`）
- **入力型**: `CreateEntityInput`, `UpdateEntityInput`（例: `CreateSpaceInput`, `UpdateSpaceInput`）
- **出力型**: `EntityPublic`, `EntityWithDetails`（例: `SpacePublic`, `ReservationWithDetails`）
- **Props型**: `ComponentNameProps`（例: `SpaceCardProps`, `ReservationFormProps`）
- **Enum型**: PascalCase（例: `CustomerStatus`, `ReservationStatus`）

**参照ドキュメント**:

- `[PROJECT_STRUCTURE.md](../architecture/PROJECT_STRUCTURE.md)` - プロジェクト構造

---

## 13. 型安全性チェックリスト

### 13.1 実装時のチェックリスト

実装時に以下のチェックリストを確認します：

- 関数のパラメータと戻り値に型注釈がある
- `any`型を使用していない（`unknown`を使用）
- Zodスキーマから型を推論している（`z.infer`）
- Prisma型を適切に使用している（`Prisma.*`型）
- エラーハンドリングで判別可能なユニオン型を使用している
- 型ガードを適切に使用している
- 型定義を再利用可能にしている（DRY原則）
- Server ComponentsとServer Actionsで適切な型を使用している
- Next.js 16の`params`と`searchParams`が`Promise`型として扱われている
- nuqsパーサーで型安全にクエリパラメータを管理している

**参照ドキュメント**:

- `[BEST_PRACTICES.md](coding-standards.md)` - 型安全性チェックリスト

---

## 14. 検証方法と成功基準

### 14.1 検証方法

#### 14.1.1 自動検証

- **型チェック**: `bun run type-check`で型エラーがないことを確認
- **ESLint**: `any`型の使用を検出するルールを設定
- **CI/CD**: プルリクエスト時に自動的に型チェックを実行

#### 14.1.2 手動検証

- **コードレビュー**: 型注釈の有無、型定義の統一性を確認
- **型定義のレビュー**: 型定義の命名規則、配置を確認

### 14.2 成功基準

- TypeScript Strict Modeが有効化されている
- すべての関数に明示的な型注釈がある
- `any`型の使用が0件である
- 型定義が統一されている
- Prisma生成型が適切に活用されている
- Zodスキーマからの型推論が適切に使用されている
- バリデーションスキーマが統一されている
- `bun run type-check`で型エラーがない

---

## 15. 不足している要件の洗い出し

### 15.1 現状の不足点

以下の要件が不足している、または不十分な可能性があります：

#### 15.1.1 型定義のドキュメント化

- **現状**: 型定義のJSDocコメントが不足している可能性
- **要件**: すべての公開型定義にJSDocコメントを追加
- **優先度**: 中

#### 15.1.2 型定義のバージョン管理

- **現状**: 型定義の変更履歴が不明確
- **要件**: 型定義の変更履歴を記録（CHANGELOGまたはGit履歴）
- **優先度**: 低

#### 15.1.3 型定義のテスト

- **現状**: 型定義のテストが不足している可能性
- **要件**: 型定義のテストを追加（型テスト、型ガードのテスト）
- **優先度**: 中

#### 15.1.4 型定義のマイグレーション

- **現状**: 型定義の変更時のマイグレーション手順が不明確
- **要件**: 型定義の変更時のマイグレーション手順を文書化
- **優先度**: 低

#### 15.1.5 型定義のパフォーマンス影響

- **現状**: 型定義がパフォーマンスに与える影響が不明確
- **要件**: 型定義のパフォーマンス影響を調査・文書化
- **優先度**: 低

#### 15.1.6 型定義の国際化対応

- **現状**: 型定義の国際化対応が不足している可能性
- **要件**: 将来的な多言語対応を考慮した型定義の設計
- **優先度**: 低

#### 15.1.7 型定義のアクセシビリティ対応

- **現状**: 型定義のアクセシビリティ対応が不足している可能性
- **要件**: アクセシビリティ関連の型定義を追加（ARIA属性等）
- **優先度**: 低

#### 15.1.8 型定義のセキュリティ対応

- **現状**: 型定義のセキュリティ対応が不足している可能性
- **要件**: セキュリティ関連の型定義を追加（認証トークン、セッション情報等）
- **優先度**: 中

#### 15.1.9 型定義の監視・ログ対応

- **現状**: 型定義の監視・ログ対応が不足している可能性
- **要件**: 監視・ログ関連の型定義を追加（エラーログ、監査ログ等）
- **優先度**: 低

#### 15.1.10 型定義の拡張性

- **現状**: 型定義の拡張性が不足している可能性
- **要件**: 将来的な機能追加を考慮した型定義の設計
- **優先度**: 中

---

## 16. 実装優先順位

### 16.1 フェーズ1: 基盤整備（高優先度）

**期間**: 1-2週間

1. **TypeScript Strict Modeの徹底** (REQ-TYPE-001)
  - `tsconfig.json`でstrict modeを有効化
  - すべての関数に明示的な型注釈
  - `any`型の使用を0件に
2. **型定義の統一** (REQ-TYPE-002)
  - Prisma生成型の活用
  - Zodスキーマからの型推論
  - 型定義の一元管理
3. **バリデーションスキーマの統一** (REQ-TYPE-003)
  - クライアントとサーバーで同じZodスキーマを使用
  - バリデーションエラーの型安全な処理

**成功基準**:

- TypeScript Strict Modeが有効化されている
- すべての関数に明示的な型注釈がある
- `any`型の使用が0件である
- 型定義が統一されている

### 16.2 フェーズ2: 拡張と最適化（中優先度）

**期間**: 1-2週間

1. **型定義のドキュメント化**
  - すべての公開型定義にJSDocコメントを追加
2. **型定義のセキュリティ対応**
  - セキュリティ関連の型定義を追加
3. **型定義の拡張性向上**
  - 将来的な機能追加を考慮した型定義の設計

**成功基準**:

- すべての公開型定義にJSDocコメントがある
- セキュリティ関連の型定義が追加されている
- 型定義の拡張性が向上している

### 16.3 フェーズ3: テストと品質向上（低優先度）

**期間**: 1-2週間

1. **型定義のテスト**
  - 型定義のテストを追加
2. **型定義のマイグレーション手順**
  - 型定義の変更時のマイグレーション手順を文書化

**成功基準**:

- 型定義のテストが追加されている
- 型定義のマイグレーション手順が文書化されている

---

## 17. 参考資料

### 17.1 プロジェクトドキュメント

- `[CLAUDE.md](../CLAUDE.md)` - プロジェクト全体の仕様書
- `[../plans/001-architecture-improvements.md](./../plans/001-architecture-improvements.md)` - 型安全性の向上要件（REQ-TYPE-001, REQ-TYPE-002, REQ-TYPE-003）
- `[BEST_PRACTICES.md](coding-standards.md)` - 型安全性のベストプラクティス
- `[API.md](../guides/coding-standards.md)` - Server ActionsとRoute Handlersの型定義
- `[DATABASE_DESIGN.md](./DATABASE_DESIGN.md)` - Prisma型定義
- `[PROJECT_STRUCTURE.md](../architecture/PROJECT_STRUCTURE.md)` - 型定義の配置
- `[nuqs.md](./nuqs.md)` - URLクエリパラメータの型定義
- `[PRISMA_7.md](../guides/prisma.md)` - Prisma 7のインポート方法

### 17.2 Cursor設定

- `[.cursor/skills/typescript-strict/SKILL.md](../.cursor/skills/typescript-strict/SKILL.md)` - TypeScript strict modeガイド
- `[.cursor/rules/code-style/RULE.md](../.cursor/rules/code-style/RULE.md)` - コードスタイル標準

### 17.3 外部リソース

- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)
- [Zod Documentation](https://zod.dev/)
- [Zod Documentation - safeParse](https://zod.dev/?id=safeparse)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Documentation - Generating Prisma Client](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client)
- [Prisma Documentation - Driver Adapters](https://www.prisma.io/docs/orm/overview/databases/driver-adapters)
- [Next.js Documentation](https://nextjs.org/docs)
- [Next.js Documentation - Route Parameters](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes)
- [React Documentation](https://react.dev/)
- [React Documentation - use Hook](https://react.dev/reference/react/use)
- [nuqs Documentation](https://nuqs.47ng.com/)
- [nuqs Documentation - Server-side](https://nuqs.dev/docs/server-side)

---

## 18. 更新履歴

- **2026-01-08**: nuqsバージョンを2.8.5から2.8.8に更新（nuqs.mdとの整合性）、ドキュメント相互参照パスを修正（BEST_PRACTICES.md、PROJECT_STRUCTURE.md、API.md、README.md、PRISMA_7.mdへのパスを正しいディレクトリに変更）
- **2026-01-06**: 公式ドキュメント確認後、最新情報を反映（Prisma 7のドライバーアダプター、React 19の`use`フックの注意事項、nuqsのネストされたServer Componentsでの使用、Zodの`safeParse`の推奨事項）
- **2026-01-06**: 初版作成、型安全・型定義の包括的な要件定義を追加

