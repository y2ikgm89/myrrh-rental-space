# 061 - パーマリンク設定機能

## 概要

汎用CMSとしての柔軟性を高めるため、ブログ記事のパーマリンク（URL構造）を管理画面から設定可能にする。

## 目標

- WordPressライクなパーマリンク設定
- 後方互換性なし（クリーンな実装）
- Next.js App Router のベストプラクティス準拠

## パーマリンク構造オプション

| オプション      | URL例                         | 用途                   |
| --------------- | ----------------------------- | ---------------------- |
| `post-name`     | `/blog/{slug}`                | デフォルト（現状）     |
| `simple`        | `/{slug}`                     | シンプルなブログサイト |
| `date-name`     | `/blog/{year}/{month}/{slug}` | ニュース・日記系       |
| `category-name` | `/blog/{category}/{slug}`     | カテゴリ重視サイト     |

## 技術設計

### 1. データベース変更

```prisma
model Settings {
  // 既存フィールド...

  // Permalink Settings
  blogPermalinkStructure String @default("post-name") // post-name | simple | date-name | category-name
  blogUrlPrefix          String @default("blog")       // URL プレフィックス
}
```

### 2. ルーティング戦略

Next.js App Router では動的ルート構造の変更が困難なため、**Catch-all Route + Middleware** アプローチを採用。

```
src/app/(public)/
├── [[...path]]/           # Catch-all route
│   └── page.tsx           # 設定に基づいてコンテンツを振り分け
└── _resolvers/
    └── permalink.ts       # パーマリンク解決ロジック
```

### 3. Middleware によるルーティング

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const settings = await getPermalinkSettings();
  const resolvedPath = resolvePermalink(request.nextUrl.pathname, settings);

  if (resolvedPath.type === "blog") {
    return NextResponse.rewrite(
      new URL(`/blog/${resolvedPath.slug}`, request.url),
    );
  }
  // ...
}
```

### 4. 正規URL生成ユーティリティ

```typescript
// src/shared/lib/permalink.ts
export function getBlogPostUrl(post: {
  slug: string;
  publishedAt: Date;
  category: { slug: string };
}) {
  const settings = getPermalinkSettings();

  switch (settings.blogPermalinkStructure) {
    case "simple":
      return `/${post.slug}`;
    case "date-name":
      return `/blog/${format(post.publishedAt, "yyyy/MM")}/${post.slug}`;
    case "category-name":
      return `/blog/${post.category.slug}/${post.slug}`;
    default:
      return `/blog/${post.slug}`;
  }
}
```

## 実装ステップ

### Phase 1: DB & 設定UI

- [ ] Prisma スキーマに `blogPermalinkStructure`, `blogUrlPrefix` 追加
- [ ] マイグレーション実行
- [ ] 管理画面 > 設定 > ブログ にパーマリンク設定セクション追加

### Phase 2: URL生成ユーティリティ

- [ ] `src/shared/lib/permalink.ts` 作成
- [ ] `getBlogPostUrl()`, `getBlogCategoryUrl()`, `getBlogTagUrl()` 実装
- [ ] 全ブログリンクをユーティリティ経由に変更

### Phase 3: ルーティング対応

- [ ] Catch-all route 作成
- [ ] Middleware でのルーティング解決
- [ ] sitemap.xml 動的生成対応

### Phase 4: 検証

- [ ] 全パーマリンク構造のテスト
- [ ] SEO（canonical URL）確認
- [ ] パフォーマンス確認

## リスク・考慮事項

1. **SEO影響**: URL変更時は301リダイレクト設定が必要（別途対応）
2. **キャッシュ**: パーマリンク設定変更時はキャッシュ全クリアが必要
3. **OGP**: 正規URLがOGPタグに反映される必要あり

## 見積もり

- Phase 1: 小規模
- Phase 2: 小規模
- Phase 3: 中規模（Middleware対応が複雑）
- Phase 4: 小規模

合計: 中〜大規模
