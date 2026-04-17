# Blog/News Separation Design

> `/journal` 統合ページを廃止し、`/posts`（ブログ一覧）と `/news`（お知らせ一覧）に分離する。
> 破壊的変更。後方互換リダイレクトなし。

## 背景

現在 `/journal` に posts と news を統合表示しているが:

- お知らせ（営業情報）とブログ（コンテンツ記事）は検索意図が異なり SEO 的に不利
- seed.ts のナビは既に `/posts` `/news` で分離定義済みだが一覧ページが存在しない
- ユーザーにとって「Journal」は直感的でない

## スコープ

### 新規作成

| ファイル                             | 内容                                                                  |
| ------------------------------------ | --------------------------------------------------------------------- |
| `src/app/(public)/posts/page.tsx`    | ブログ一覧（カテゴリフィルタ + 検索 + サイドバー + ページネーション） |
| `src/app/(public)/posts/loading.tsx` | ブログ一覧スケルトン                                                  |
| `src/app/(public)/posts/error.tsx`   | ブログ一覧エラー                                                      |
| `src/app/(public)/news/page.tsx`     | お知らせ一覧（検索 + ページネーション、サイドバーなし）               |
| `src/app/(public)/news/loading.tsx`  | お知らせ一覧スケルトン                                                |
| `src/app/(public)/news/error.tsx`    | お知らせ一覧エラー                                                    |
| `src/app/(public)/feed.xml/route.ts` | ブログ RSS フィード（Route Handler）                                  |

### 削除

| ファイル                                                  | 理由                       |
| --------------------------------------------------------- | -------------------------- |
| `src/app/(public)/journal/page.tsx`                       | 統合一覧ページ廃止         |
| `src/app/(public)/journal/_components/JournalContent.tsx` | journal 専用コンポーネント |
| `src/app/(public)/journal/loading.tsx`                    | journal ローディング       |
| `src/app/(public)/journal/error.tsx`                      | journal エラー             |

### 修正

| ファイル                                                             | 変更内容                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/app/(public)/_shared/lib/search-params.ts`                      | `journalSearchParamsParsers` / `journalSearchParams` 削除                             |
| `src/app/(public)/posts/_components/post-detail-page-content.tsx`    | パンくず `/journal?tab=posts` → `/posts`                                              |
| `src/app/(public)/news/_components/news-detail-page-content.tsx`     | パンくず `/journal?tab=news` → `/news`                                                |
| `src/app/(public)/_shared/components/sidebar/sidebar-categories.tsx` | リンク先 `/journal?tab=posts&category=` → `/posts?category=`                          |
| `src/app/(public)/_shared/components/sidebar/sidebar-tags.tsx`       | リンク先 `/journal?tag=` → `/posts?tag=`                                              |
| `src/shared/lib/sections/definitions/post-list/schema.ts`            | デフォルト URL `/journal?tab=posts` → `/posts`                                        |
| `src/shared/lib/sections/definitions/news-list/schema.ts`            | デフォルト URL `/journal?tab=news` → `/news`                                          |
| `e2e/fixtures/test-data.ts`                                          | `journal` URL → `posts` / `news` に分離                                               |
| `e2e/visual/public-pages.spec.ts`                                    | journal テスト → posts + news テストに変更                                            |
| `e2e/a11y/axe-public-pages.spec.ts`                                  | journal テスト → posts + news テストに変更                                            |
| `prisma/seed.ts`                                                     | Page レコード: `journal` → `posts` + `news` に分離（DB のナビアイテムは既に分離済み） |
| `CLAUDE.md` / `.claude/rules/gotchas.md`                             | `/journal` 関連の記述を更新                                                           |

## 設計詳細

### `/posts/page.tsx` — ブログ一覧

```
PageLayout variant="content"
├── PageHero (セクションシステムから)
└── Section (pt-10 pb-section md:pt-14)
    └── Container
        └── BlogLayout showSidebar={pageShowSidebar}
            ├── FilterBar (カテゴリ + 検索)
            ├── PostGrid (既存コンポーネント再利用)
            └── Pagination
```

- `getPublishedPostsList(page, perPage, search, categorySlug)` でデータ取得
- `getPageSectionsWithFallback("posts")` で hero セクション取得
- `getPageShowSidebar("posts")` でサイドバー表示判定
- `postsSearchParams` を使用（既に定義済み）
- カテゴリフィルタは `FilterBar` コンポーネント（既存の共通 UI）を使用
- `generatePageMetadata("posts")` で SEO
- `BreadcrumbJsonLd` でパンくず構造化データ

### `/news/page.tsx` — お知らせ一覧

```
PageLayout variant="content"
├── PageHero (セクションシステムから)
└── Section (pt-10 pb-section md:pt-14)
    └── Container
        ├── SearchBar
        ├── NewsList (既存コンポーネント再利用)
        └── Pagination
```

- `getPublishedNewsList(page, perPage, search)` でデータ取得
- `getPageSectionsWithFallback("news")` で hero セクション取得
- サイドバーなし（ニュースにはカテゴリ/タグがない）
- `newsSearchParams` を使用（既に定義済み）
- `generatePageMetadata("news")` で SEO
- `BreadcrumbJsonLd` でパンくず構造化データ

### `/feed.xml/route.ts` — RSS フィード

- Route Handler で XML 生成
- `getPublishedPostsList(1, 20)` で最新20件取得
- XML エスケープ必須（XSS 防止）
- `Content-Type: application/xml`
- `'use cache'` + `cacheLife('hours')` + `cacheTag(CACHE_TAGS.POSTS)` でキャッシュ

### seed.ts 更新

- `journal` Page レコードを `posts` と `news` の2つに分離
- ナビアイテムは既に `/posts` `/news` で定義済みのため変更不要

### gotchas.md 更新

現在の記述:

> **`/news` `/posts` 一覧ページは `/journal` に統合済み**

変更後:

> **`/posts` はブログ一覧、`/news` はお知らせ一覧** — 各詳細ページ（`/news/[slug]`、`/posts/[...segments]`）も個別に維持

## 既存コンポーネント再利用

- `PostGrid` — そのまま使用（カード型グリッド、Container Queries 対応済み）
- `NewsList` — そのまま使用（日付+タイトル行リスト）
- `BlogLayout` — ブログ一覧でそのまま使用
- `FilterBar` — カテゴリフィルタ用（既存共通コンポーネント）
- `SearchBar` — 検索用（既存共通コンポーネント）
- `Pagination` — ページネーション（既存共通コンポーネント）
- `PageLayout` / `PageHero` / `SiteCTA` — ページテンプレート
- `SectionRenderer` — セクションシステム

## 変更しないもの

- `/posts/[...segments]/page.tsx` — 詳細ページのルーティングロジックは維持
- `/news/[slug]/page.tsx` — 詳細ページは維持
- `/posts/preview/[slug]/page.tsx` — プレビューは維持
- `/news/preview/[slug]/page.tsx` — プレビューは維持
- 管理画面（`/admin/posts`, `/admin/news`）— 変更なし
- ドメイン層（queries, commands）— 変更なし
- Prisma スキーマ — 変更なし
