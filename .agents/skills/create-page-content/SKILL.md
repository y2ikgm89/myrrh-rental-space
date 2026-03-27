---
name: create-page-content
description: >
  Page-First Architecture の公開ページコンテンツ一式をスキャフォールド生成する。
  Zod スキーマ + デフォルトコンテンツ + seed + page.tsx テンプレート。
  新規公開ページ追加時に使用。
  引数: ページキー（英語 kebab-case, 例: space-list, news-list, gallery）
---

# 公開ページコンテンツ スキャフォールド

このスキルは Page-First Architecture に基づく公開ページのコンテンツ一式を生成します。

## 実行前の確認事項

生成前に必ず以下を確認する（不明な場合は AskUserQuestion で確認）:

1. **ページキー**: 英語 kebab-case（例: `gallery`, `pricing`, `staff`）
2. **ルートパス**: `/gallery` 等の URL パス
3. **ページタイトル**: 日本語（例: `ギャラリー`）
4. **コンテンツ構造**: ヒーローのみ or カスタムセクションあり

## 生成ファイル構成

```
src/app/(public)/
├── <route>/
│   └── page.tsx                                    # ページ本体（Server Component）
└── _shared/lib/content/
    ├── schemas/<page-key>.ts                       # Zod スキーマ
    └── defaults/<page-key>.ts                      # デフォルトコンテンツ
```

- `prisma/seed.ts` の `seedPageContent()` に upsert 追加

## 実行手順

### Step 1: Zod スキーマ作成

`src/app/(public)/_shared/lib/content/schemas/<page-key>.ts`

シンプルページ（ヒーロータイトル + 説明のみ）の場合は `simplePageContentSchema` を re-export:

```typescript
// schemas/<page-key>.ts
export { simplePageContentSchema as <pageKey>ContentSchema } from "../schemas"
export type { SimplePageContent as <PageKey>Content } from "../schemas"
```

カスタムフィールドがある場合は専用スキーマを定義:

```typescript
import { z } from "zod"
import { imageRefSchema, buttonItemSchema } from "../schemas"

export const <pageKey>ContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    description: z.string(),
  }),
  // ページ固有フィールド
})

export type <PageKey>Content = z.infer<typeof <pageKey>ContentSchema>
```

### Step 2: デフォルトコンテンツ作成

`src/app/(public)/_shared/lib/content/defaults/<page-key>.ts`

```typescript
import type { <PageKey>Content } from "../schemas/<page-key>"

export const default<PageKey>Content: <PageKey>Content = {
  hero: {
    title: "<日本語タイトル>",
    description: "<日本語説明文>",
  },
}
```

`defaults/index.ts` barrel に追加:

```typescript
export { default<PageKey>Content } from "./<page-key>"
```

### Step 3: seed.ts に追加

`prisma/seed.ts` の `seedPageContent()` 内の pages 配列に追加:

```typescript
{
  pageKey: "<page-key>",
  content: default<PageKey>Content,
  metaTitle: "<タイトル> | Myrrh Rental Space",
  metaDescription: "<説明文>",
},
```

### Step 4: page.tsx 作成

`src/app/(public)/<route>/page.tsx`

```typescript
import { connection } from "next/server"
import { getPageContent } from "../_shared/lib/content/queries"
import { <pageKey>ContentSchema } from "../_shared/lib/content/schemas/<page-key>"
import { default<PageKey>Content } from "../_shared/lib/content/defaults/<page-key>"
import { PageHero } from "../_shared/components/layouts/page-hero"
import { Breadcrumb } from "../_shared/components/layouts/breadcrumb"
import { SiteCTA } from "../_shared/components/layouts/site-cta"
import { Container } from "../_shared/components/design-system/container"
import { generatePageMetadata } from "../_shared/lib/seo/page-metadata"

export async function generateMetadata() {
  await connection()
  return generatePageMetadata("<page-key>")
}

export default async function <PageName>Page() {
  await connection()
  const content = await getPageContent(
    "<page-key>",
    <pageKey>ContentSchema,
    default<PageKey>Content,
  )

  return (
    <>
      <PageHero
        variant="compact"
        title={content.hero.title}
        breadcrumb={<Breadcrumb items={[{ label: content.hero.title }]} />}
      />
      <section className="py-[var(--spacing-section)]">
        <Container>
          {content.hero.description ? (
            <p className="text-center text-muted-foreground">{content.hero.description}</p>
          ) : null}
          {/* ページ固有コンテンツをここに追加 */}
        </Container>
      </section>
      <SiteCTA />
    </>
  )
}
```

### Step 5: 検証

```bash
bun run type-check
bun run validate
```

## 必須パターン

- **Design System Primitives 使用**: `Container`, `Heading`, `Stack`, `Button` 等は `_shared/components/design-system/` から
- **PageHero + Breadcrumb + SiteCTA**: 全ページ共通レイアウト
- **`connection()` 必須**: PPR 動的 opt-in
- **`getPageContent()` 使用**: `'use cache'` + `cacheTag` 付きクエリ
- **kebab-case ファイル名**: 公開ページコンポーネントの命名規則
- **`readonly` props**: 全 interface に必須
- **`import type`**: 型のみの import は必ず `type` キーワード付き

## 参照

- `src/app/(public)/_shared/lib/content/schemas.ts` — 共通スキーマ (`simplePageContentSchema`, `buttonItemSchema`, `imageRefSchema`)
- `src/app/(public)/_shared/lib/content/defaults/` — 既存デフォルト値の実装例
- `src/app/(public)/page.tsx` — ホームページの Page-First 実装例（最も複雑）
- `src/app/(public)/faq/page.tsx` — シンプルページの実装例
