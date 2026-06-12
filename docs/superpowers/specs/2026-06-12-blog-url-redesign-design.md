# Blog URL 再設計仕様

ブログ記事・カテゴリー・タグの公開 URL 構造を刷新する設計仕様。
破壊的変更・後方互換性なし（プレリリースサイト）。

## 背景と目的

現状の `/posts/[...segments]` 構造は以下の問題を抱える:

- 訪問者に `/posts` という内部表現が露出する（Ghost/Stripe 等の業界標準は `/blog`）
- パーマリンク構造切替（`postPermalinkStructure`）による catch-all 複雑性が不要
- カテゴリー・タグ別一覧ページが存在しない（SEO・ナビゲーション的に損失）

## 最終 URL 構造

| ページ           | URL                                       |
| ---------------- | ----------------------------------------- |
| ブログ記事一覧   | `/blog`                                   |
| ブログ記事詳細   | `/blog/[slug]`                            |
| カテゴリー別一覧 | `/category/[slug]`                        |
| タグ別一覧       | `/tag/[slug]`                             |
| 廃止             | `/posts/**`（削除のみ、リダイレクトなし） |

`/blog/[slug]` はフラットルート（catch-all 廃止）。スラッグのみの 1 セグメント構造に統一する。

`/category` と `/tag` はトップレベルに配置する（`/blog/category` は不要、コンテンツと分類が同列に見える問題を回避）。

## アーキテクチャ決定

### ブログ一覧 `/blog`

既存の `/posts` 一覧と同じ Section アーキテクチャ（`getPageSectionsWithFallback("blog")`）を継続使用。
`Page.slug` を `"posts"` から `"blog"` に変更（migration または seed 更新）。

### カテゴリー・タグ一覧

Section アーキテクチャを使わず軽量 RSC で実装する。理由:

- 分類ページは content-first（記事一覧が主コンテンツ）
- セクション設計のオーバーヘッドが不要
- `/spaces/[slug]` や `/access/[slug]` と同じ「詳細ページ RSC パターン」と一致

コンポーネント構成: `page.tsx`（RSC、データフェッチ + notFound）+ `loading.tsx`（スケルトン）。

### permalink 設定の簡略化

`getPostPermalinkConfig()` のプレフィックスを `/blog` にハードコード。
`postUrlPrefixEnabled`・`postPermalinkStructure` の Settings フィールドはコードレベルで無視し、DB カラムは残す（migration 不要）。
管理画面の `PermalinkSection` からこれら 2 フィールドの UI を削除する。

## 変更対象ファイル

### 削除

- `src/app/(public)/posts/` ディレクトリ全体（page.tsx / loading.tsx / error.tsx / `[...segments]/*` / `_components/*`）

### 新規作成

- `src/app/(public)/blog/page.tsx` + `loading.tsx` + `error.tsx`（一覧、Section アーキテクチャ）
- `src/app/(public)/blog/[slug]/page.tsx` + `loading.tsx` + `error.tsx`（記事詳細）
- `src/app/(public)/category/[slug]/page.tsx` + `loading.tsx`（カテゴリー一覧）
- `src/app/(public)/tag/[slug]/page.tsx` + `loading.tsx`（タグ一覧）

### routing.ts の変更

`src/shared/domain/posts/routing.ts`:

- `getPostPermalinkConfig()` のプレフィックスを `"/blog"` 固定（`postUrlPrefixEnabled` 参照削除）
- `PermalinkSettingsLike` から `postUrlPrefixEnabled` フィールド削除
- `resolvePostDetailRoute()` 関数を削除（catch-all が不要になるため）
- `ResolvedPostRoute` 型を削除
- `RESERVED_POST_SEGMENTS` から `"posts"` を削除、`"blog"` を追加

### queries.ts の変更

`src/shared/domain/posts/queries.ts`:

- `getPublishedPostsList()` に `tagSlug: string = ""` 引数を追加
- `tagSlug` フィルタを where 句に追加（`postTags: { some: { tag: { slug: tagSlug } } }`）
- `getPostCategoryBySlug(slug)` クエリを追加（カテゴリーページ用）
- `getPostTagBySlug(slug)` クエリを追加（タグページ用）
- cacheTag: カテゴリー・タグ系は `CACHE_TAGS.POST_CATEGORIES` / `CACHE_TAGS.POST_TAGS` を使用（存在確認後、なければ `CACHE_TAGS.POSTS` に相乗り）

### preview-routes.ts の変更

`src/shared/lib/preview-routes.ts`:

- `normalizePreviewPathname()` の `/preview/posts/` → `/posts` マッピングを `/blog` に変更

### sitemap.ts の変更

`src/app/sitemap.ts`:

- `{ url: \`\${BASE_URL}/posts\`` }` を `{ url: \`\${BASE_URL}/blog\`` }` に変更
- カテゴリー一覧エントリを追加（`/category/[slug]` × カテゴリー数）
- タグ一覧エントリを追加（`/tag/[slug]` × タグ数）
- カテゴリー・タグ取得クエリを sitemap.ts に追加

### feed.xml/route.ts の変更

`src/app/(public)/feed.xml/route.ts`:

- チャンネル `<link>` の `/posts` を `/blog` に変更

### admin 管理画面リンクの変更

以下ファイルで `post.url` または `/posts` を参照している箇所を確認・更新:

- `src/app/(admin)/.../posts/_components/PostActionCell.tsx`（公開ページリンク）
- `src/app/(admin)/.../posts/_components/PostEditor.tsx`（プレビューリンク）
- その他 `buildPostCanonicalPath` を使うコンポーネント

`buildPostCanonicalPath` がプレフィックスを `/blog` に返すようになるため、`post.url` 経由のリンクは自動修正される。ハードコードの `/posts` が残っていないか grep で確認する。

### PermalinkSection の変更

`src/app/(admin)/.../settings/_components/sections/PermalinkSection.tsx`:

- `postUrlPrefixEnabled` のトグル UI を削除
- `postPermalinkStructure` の選択 UI を削除（または `/blog/[slug]` 固定の説明テキストに差し替え）

### seed / NavigationItem の変更

`prisma/seed.ts`:

- `Page.slug = "posts"` → `"blog"` に更新（upsert）
- ナビゲーションアイテムの URL `/posts` → `/blog` に更新

### E2E fixtures の変更

`e2e/` 配下の `/posts` 参照を `/blog` に変更。カテゴリー・タグページのスモークテスト URL 追加。

## データフロー

```
管理画面 post.url
  ← buildPostCanonicalPath(post, settings)
    ← getPostPermalinkConfig(settings) → prefix="/blog" (fixed)
    ← generatePostUrl(post, config) → "/blog/{slug}"

公開 /blog/[slug]/page.tsx
  ← getPublishedPost(slug) (既存)

公開 /category/[slug]/page.tsx
  ← getPostCategoryBySlug(slug) → name, description
  ← getPublishedPostsList(page, perPage, search="", categorySlug=slug, tagSlug="")

公開 /tag/[slug]/page.tsx
  ← getPostTagBySlug(slug) → name
  ← getPublishedPostsList(page, perPage, search="", categorySlug="", tagSlug=slug)

公開 /blog/page.tsx
  ← getPageSectionsWithFallback("blog") (Section アーキテクチャ)

sitemap.ts
  ← buildPostCanonicalPath (自動 /blog プレフィックス)
  ← getAllPublishedCategories() (新規)
  ← getAllPublishedTags() (新規)
```

## カテゴリー・タグページの実装詳細

### ページ UI

- `H1`: カテゴリー名 / タグ名
- 記事グリッド: 既存 `PostGrid` / `PostCard` コンポーネントを流用
- ページネーション: nuqs `parseAsInteger` でページ番号管理
- `loading.tsx`: `Skeleton` ベースのグリッドスケルトン

### メタデータ

```typescript
export async function generateMetadata({ params }) {
  const category = await getPostCategoryBySlug(params.slug);
  if (!category) return {};
  return { title: `${category.name} | ブログ` };
}
```

### notFound

`getPostCategoryBySlug` / `getPostTagBySlug` が null を返した場合 `notFound()` を呼ぶ。

## DB マイグレーション

不要。`postUrlPrefixEnabled` / `postPermalinkStructure` カラムは DB に残し、コードで参照しなくなる（dead column）。
Page.slug の `"posts"` → `"blog"` 変更は seed upsert で対応（migration ではなくデータ更新）。

## テスト方針

- Unit: `routing.ts` の `buildPostCanonicalPath` が `/blog/{slug}` を返すことを確認
- Unit: `getPublishedPostsList` の `tagSlug` フィルタを確認
- Integration: カテゴリー・タグ別一覧の記事フィルタリング
- E2E smoke: `/blog`・`/blog/[slug]`・`/category/[slug]`・`/tag/[slug]` が 200 を返すことを確認

## 非対応項目

- `/posts/**` → `/blog/**` リダイレクトなし（プレリリース、不要）
- タグ用 `CACHE_TAGS.POST_TAGS` の新規追加は実装時に既存タグ定数との整合を確認後判断
- ブログ一覧での カテゴリー・タグフィルタ UI（`PostListSection` はすでに `categorySlug` をサポート、`tagSlug` は今回追加）
