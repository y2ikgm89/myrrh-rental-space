# Blog Sidebar — Editorial Magazine Design

## Overview

ブログ系ページ（`/journal`, `/posts/[...segments]`, `/news/[slug]`）に Editorial Magazine トーンのサイドバーを実装する。管理画面のサイドバー設定（既存）を公開ページで描画する。

## Scope

### In Scope

- サイドバー描画コンポーネント群（Server Component ベース）
- 2カラムレイアウトへの書き換え（3ページ）
- サイドバーデータ取得クエリ（`'use cache'`）
- ウィジェット並び替え（dnd-kit）
- カスタムウィジェット（title + description + linkUrl + linkLabel）
- `sidebarWidgets` スキーマを順序付き配列に破壊的変更
- 管理画面 `SidebarSection` の書き換え

### Out of Scope

- トップページ・スペース一覧のサイドバー
- カスタムウィジェットの Lexical リッチテキスト（Phase 2）
- ウィジェットの画像アップロード

## Data Model

### Schema Change (Breaking)

`Settings.sidebarWidgets` の JSON 構造を変更:

**Before:**

```json
{
  "search": true,
  "recent": true,
  "popular": true,
  "categories": true,
  "tags": true
}
```

**After:**

```json
[
  { "type": "search", "enabled": true },
  { "type": "recent", "enabled": true },
  { "type": "popular", "enabled": true },
  { "type": "categories", "enabled": true },
  { "type": "tags", "enabled": true }
]
```

Custom widget entry:

```json
{
  "type": "custom",
  "enabled": true,
  "id": "cuid",
  "title": "お問い合わせ",
  "description": "お気軽にご連絡ください",
  "linkUrl": "/contact",
  "linkLabel": "お問い合わせフォーム"
}
```

- 配列順序 = 表示順序
- 組み込み5種（`search` / `recent` / `popular` / `categories` / `tags`）は各1個、削除不可
- `custom` タイプは複数追加可、`id` で識別（`cuid()` 生成）
- Prisma マイグレーション不要（JSON カラムの値構造変更のみ）

### Zod Schema

```typescript
// src/shared/lib/validations/sidebar.ts (full rewrite)

const builtinWidgetTypes = [
  "search",
  "recent",
  "popular",
  "categories",
  "tags",
] as const;

const builtinWidgetSchema = z.object({
  type: z.enum(builtinWidgetTypes),
  enabled: z.boolean(),
});

const customWidgetSchema = z.object({
  type: z.literal("custom"),
  enabled: z.boolean(),
  id: z.string().min(1),
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  linkUrl: z.string().max(500).optional(),
  linkLabel: z.string().max(100).optional(),
});

const sidebarWidgetSchema = z
  .discriminatedUnion("type", [
    builtinWidgetSchema,
    // custom は builtinWidgetTypes に含まれないので別で union
  ])
  .or(customWidgetSchema);

// 実際は z.array(z.union([builtinWidgetSchema, customWidgetSchema]))
export const sidebarWidgetsSchema = z.array(
  z.union([builtinWidgetSchema, customWidgetSchema]),
);

export const sidebarSettingsSchema = z.object({
  sidebarEnabled: z.boolean(),
  sidebarWidgets: sidebarWidgetsSchema,
  sidebarRecentCount: z.number().int().min(1).max(20),
  sidebarPopularCount: z.number().int().min(1).max(20),
});
```

### Page.showSidebar Override

`Page` テーブルの `showSidebar: Boolean?` フィールド（既存）:

- `null` → グローバル `sidebarEnabled` に従う
- `true` → 強制表示
- `false` → 強制非表示

journal ページは `Page` レコード（slug: `"journal"`）の `showSidebar` を参照。
記事詳細（`/posts/*`, `/news/*`）はグローバル設定のみ。

## Architecture

### Data Queries

```
src/shared/domain/settings/queries/sidebar.ts (new)
  getSidebarSettings()
    'use cache' + cacheTag(CACHE_TAGS.SIDEBAR_SETTINGS)
    → { enabled, widgets, recentCount, popularCount }

src/shared/domain/sidebar/queries.ts (new domain)
  getSidebarData(settings: SidebarSettings)
    'use cache' + cacheTag(CACHE_TAGS.SIDEBAR_DATA)
    → { recentPosts?, popularPosts?, categories?, tags? }
    → enabled widgets のみ DB クエリ実行
```

`getSidebarData` は `settings.sidebarWidgets` の `enabled: true` なウィジェットのみデータ取得する。全ウィジェット無効なら空オブジェクト。

### Component Tree

```
BlogSidebar (SC) — src/app/(public)/_shared/components/layouts/blog-sidebar.tsx
  settings + data を取得し、widgets 配列順にレンダリング
  ├── SidebarSearch (CC) — 検索フォーム（SearchBar 流用）
  ├── SidebarRecentPosts (SC) — 新着記事リスト
  ├── SidebarPopularPosts (SC) — 人気記事リスト
  ├── SidebarCategories (SC) — カテゴリ + 件数
  ├── SidebarTags (SC) — タグクラウド
  └── SidebarCustom (SC) — カスタムウィジェット

BlogLayout (SC) — src/app/(public)/_shared/components/layouts/blog-layout.tsx
  2カラム or シングルカラムを切り替えるレイアウトラッパー
```

`BlogLayout` は `getSidebarSettings()` + `Page.showSidebar` を評価し:

- サイドバー有効 → `lg:grid-cols-[1fr_320px] gap-12`
- サイドバー無効 → シングルカラム（現状維持）

### Page Integration

**`/journal/page.tsx`:**

```tsx
<PageLayout variant="content" hero={...} cta={<SiteCTA />}>
  <BlogLayout pageSlug="journal">
    <section>...</section>  {/* 既存のメインコンテンツ */}
  </BlogLayout>
</PageLayout>
```

**`/posts/[...segments]/page.tsx`:**

```tsx
<PostDetailPageContent post={post} />
// 内部で BlogLayout を使用
```

**`/news/[slug]/page.tsx`:**

```tsx
<NewsDetailPageContent newsItem={newsItem} />
// 内部で BlogLayout を使用
```

## Visual Design (Editorial Magazine)

### Layout

- Desktop (`lg`+): 2カラム `grid-cols-[1fr_320px] gap-12`
- Mobile: サイドバー非表示（`hidden lg:block`）
- Sidebar: `sticky top-[calc(var(--header-height)+2rem)]`
- Container: default (1280px) — `variant="narrow"` は使わない（2カラムで幅不足になるため）

### Widget Styling

**共通:**

- ウィジェット間: `space-y-8`
- 見出し: `text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground mb-4`（editorial ラベルスタイル）

**Search:**

- `SearchBar` コンポーネントを流用（`placeholder="記事を検索..."`）

**Recent Posts / Popular Posts:**

- リスト: `space-y-4`
- 各アイテム: タイトル（`text-sm hover:text-foreground transition-colors`）+ 日付（`text-xs text-muted-foreground`）
- サムネイルなし（editorial ミニマリズム）
- Link でラップ

**Categories:**

- リスト: `space-y-3`
- 各アイテム: `flex justify-between` — カテゴリ名（Link, `text-sm`）+ 件数（`text-xs text-muted-foreground`）

**Tags:**

- Flex wrap: `flex flex-wrap gap-2`
- 各タグ: `border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors`（記事詳細のタグスタイルと統一）
- Link でラップ（`/journal?tag=xxx` — 将来のタグフィルタ対応用、初回は `/journal` に遷移）

**Custom:**

- `border-t border-border pt-6`（他ウィジェットと同じ区切り）
- title: 見出しスタイル（上記共通）
- description: `text-sm text-muted-foreground mt-2`
- link: `Button variant="editorial"` または `text-sm hover:text-foreground`（linkUrl がある場合のみ）

## Admin UI Changes (Breaking)

`SidebarSection.tsx` を全面書き換え:

1. **ウィジェットリスト**: dnd-kit ソータブルリスト（既存パターン準拠）
   - ドラッグハンドル + ウィジェット名 + enabled Switch + ActionDropdown
   - 組み込みウィジェットは削除不可（enabled toggle のみ）
   - カスタムウィジェットは編集・削除可

2. **カスタムウィジェット追加**: 「+ カスタムウィジェット追加」ボタン → インラインフォーム or ダイアログ
   - title (必須), description (任意), linkUrl (任意), linkLabel (任意)

3. **表示件数**: `sidebarRecentCount` / `sidebarPopularCount` は既存のまま維持

4. **プレビュー**: なし（実装コスト過大）

## Cache Strategy

| クエリ                 | タグ               | ライフ                   |
| ---------------------- | ------------------ | ------------------------ |
| `getSidebarSettings()` | `SIDEBAR_SETTINGS` | `STATIC_SETTINGS` (days) |
| `getSidebarData()`     | `SIDEBAR_DATA`     | `PUBLIC_CONTENT` (hours) |

無効化:

- `updateSidebarSettings` → `updateTag(CACHE_TAGS.SIDEBAR_SETTINGS)` + `updateTag(CACHE_TAGS.SIDEBAR_DATA)`
- `createPost` / `updatePost` / `deletePost` → `updateTag(CACHE_TAGS.SIDEBAR_DATA)`（新着・人気が変わる）
- `createNews` / `updateNews` / `deleteNews` → 同上（新着に影響）

## File Structure

```
src/shared/lib/validations/sidebar.ts          — Zod schema (rewrite)
src/shared/domain/settings/queries/sidebar.ts  — getSidebarSettings (new)
src/shared/domain/sidebar/                     — new domain
  queries.ts                                   — getSidebarData
src/app/(public)/_shared/components/layouts/
  blog-layout.tsx                              — 2カラム/1カラム切替 (new)
  blog-sidebar.tsx                             — サイドバー本体 (new)
src/app/(public)/_shared/components/sidebar/   — ウィジェットコンポーネント (new)
  sidebar-search.tsx                           — CC
  sidebar-recent-posts.tsx                     — SC
  sidebar-popular-posts.tsx                    — SC
  sidebar-categories.tsx                       — SC
  sidebar-tags.tsx                             — SC
  sidebar-custom.tsx                           — SC
src/app/(admin)/.../settings/_components/sections/
  SidebarSection.tsx                           — full rewrite
src/app/(admin)/admin/actions/settings/schemas/
  form-schemas-privacy-appearance.ts           — sidebarFormSchema update
```

## Breaking Changes Summary

1. `sidebarWidgets` JSON 構造: object → ordered array
2. `sidebar.ts` Zod schema: 全面書き換え
3. `SidebarSection.tsx`: 全面書き換え（dnd-kit ソータブル）
4. `sidebarFormSchema`: 新スキーマ対応
5. `/journal/page.tsx`: 2カラムレイアウト
6. `post-detail-page-content.tsx`: 2カラムレイアウト
7. `news-detail-page-content.tsx`: 2カラムレイアウト
8. 既存の `sidebarWidgets` DB データは seed 再実行またはマイグレーションスクリプトで更新

## Migration

DB カラム型は `Json` のまま変更なし。値構造のみ変更:

- seed.ts のデフォルト値を新形式に更新
- 既存データがある場合: `updateSidebarSettings` の初回呼び出しで新形式に上書き
- パース時のフォールバック: 旧形式を検出したらデフォルト配列に変換するヘルパーを `sidebar.ts` に用意
