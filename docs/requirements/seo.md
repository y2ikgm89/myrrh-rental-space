# SEO要件定義

> **Note**: このドキュメントには、レンタルスペース管理システムのSEO（検索エンジン最適化）に関する包括的な要件定義が記載されています。サイト全体のSEO設定については[`settings.md`](./settings.md)を、ブログ機能のSEO要件については[`posts.md`](./posts.md)を参照してください。

**最終更新**: 2026-01-08

---

## 目的

レンタルスペース管理システムの検索エンジン最適化（SEO）を包括的に実装し、検索エンジンでの可視性とランキングを向上させます。

---

## SEO要件の全体像

### 1. メタタグ最適化

#### 基本メタタグ

**すべてのページに必須**:

- `<title>`: ページタイトル（1-60文字推奨、50-60文字が最適）
- `<meta name="description">`: メタディスクリプション（1-160文字推奨、120-160文字が最適）
- `<meta name="keywords">`: メタキーワード（カンマ区切り、オプション、主要検索エンジンでは重要度が低い）
- `<meta charset="utf-8">`: 文字エンコーディング
- `<meta name="viewport">`: レスポンシブデザイン対応（`width=device-width, initial-scale=1`）

**モバイル最適化メタタグ**:

- `<meta name="theme-color">`: モバイルブラウザのテーマカラー（例: `#000000`）
- `<meta name="apple-mobile-web-app-capable">`: iOS SafariのWeb Appモード（`content="yes"`）
- `<meta name="apple-mobile-web-app-status-bar-style">`: iOSステータスバーのスタイル（`default`、`black`、`black-translucent`）
- `<meta name="format-detection">`: 電話番号やメールアドレスの自動リンク（`telephone=no`、`email=no`）

**実装場所**:

- Next.js 16の`Metadata` APIを使用（`generateMetadata`関数）
- ページ固有のメタデータを優先、設定されていない場合はデフォルト値を使用

#### OGP（Open Graph Protocol）タグ

**すべてのページに推奨**:

- `<meta property="og:title">`: OGPタイトル（1-60文字）
- `<meta property="og:description">`: OGP説明（1-200文字）
- `<meta property="og:image">`: OGP画像（推奨サイズ: 1200x630px、最小: 600x315px）
- `<meta property="og:image:width">`: 画像の幅（ピクセル）
- `<meta property="og:image:height">`: 画像の高さ（ピクセル）
- `<meta property="og:image:alt">`: 画像の代替テキスト
- `<meta property="og:url">`: カノニカルURL
- `<meta property="og:type">`: コンテンツタイプ（`website`、`article`など）
- `<meta property="og:site_name">`: サイト名
- `<meta property="og:locale">`: ロケール（`ja_JP`、将来的に多言語対応時は`en_US`なども）
- `<meta property="og:locale:alternate">`: 代替ロケール（将来的に多言語対応時）

**実装場所**:

- Next.js 16の`Metadata` APIで`openGraph`プロパティを使用
- ページ固有のOGP設定を優先、設定されていない場合はデフォルト値を使用
- 画像は複数指定可能（配列形式）

#### Twitter Cardタグ

**すべてのページに推奨**:

- `<meta name="twitter:card">`: カードタイプ（`summary_large_image`推奨、`summary`、`app`、`player`も可）
- `<meta name="twitter:title">`: Twitterタイトル（70文字以内）
- `<meta name="twitter:description">`: Twitter説明（200文字以内）
- `<meta name="twitter:image">`: Twitter画像（推奨サイズ: 1200x675px、最小: 300x157px）
- `<meta name="twitter:image:alt">`: 画像の代替テキスト
- `<meta name="twitter:site">`: Twitterアカウント（`@username`形式、オプション）
- `<meta name="twitter:creator">`: コンテンツ作成者のTwitterアカウント（`@username`形式、オプション）

**実装場所**:

- Next.js 16の`Metadata` APIで`twitter`プロパティを使用
- OGPタグと併用可能（Twitter Cardが優先される）

---

### 2. 構造化データ（JSON-LD）

#### 実装するスキーマタイプ

**1. Organization（組織情報）**

- サイト全体の組織情報
- 実装場所: ルートレイアウト（`src/app/layout.tsx`）
- 使用フィールド: サイト名、ロゴ、連絡先情報、SNSリンク

**2. WebSite（ウェブサイト情報）**

- サイト全体の基本情報
- 実装場所: ルートレイアウト（`src/app/layout.tsx`）
- 使用フィールド: サイト名、URL、検索機能（将来的に）

**3. LocalBusiness（ローカルビジネス情報）**

- レンタルスペースのビジネス情報
- 実装場所: トップページ（`src/app/(public)/page.tsx`）
- 使用フィールド: 名前、住所、電話番号、営業時間、価格帯

**4. Article（記事情報）**

- ブログ記事の詳細情報
- 実装場所: ブログ詳細ページ（`src/app/(public)/posts/[slug]/page.tsx`）
- 使用フィールド: タイトル、公開日時、更新日時、著者、カテゴリ、画像

**5. BreadcrumbList（パンくずリスト）**

- ページ階層の表示
- 実装場所: すべてのページ（必須）
- 使用フィールド: 階層構造、各階層の名前とURL

**6. FAQPage（よくある質問）**

- FAQページの構造化データ
- 実装場所: FAQページ（`/faq`、将来的に実装）
- 使用フィールド: 質問と回答のペア

**7. Review/Rating（レビュー・評価）**

- 顧客レビューと評価の構造化データ
- 実装場所: スペース詳細ページ（将来的に実装）
- 使用フィールド: 評価値、レビュー数、個別レビュー

**8. Event（イベント情報）**

- イベント情報の構造化データ
- 実装場所: イベント告知ページ（将来的に実装）
- 使用フィールド: イベント名、日時、場所、価格

**9. Service（サービス情報）**

- サービス提供情報の構造化データ
- 実装場所: スペース詳細ページ、サービスページ
- 使用フィールド: サービス名、説明、価格、提供エリア

**10. ItemList（リストページ）**

- リスト形式のコンテンツの構造化データ
- 実装場所: スペース一覧ページ、ブログ一覧ページ
- 使用フィールド: リスト項目、順序、説明

**11. VideoObject（動画コンテンツ）**

- 動画コンテンツの構造化データ
- 実装場所: 動画を含むページ（将来的に実装）
- 使用フィールド: 動画URL、サムネイル、再生時間、説明

**実装方法**:

- Next.js 16のServer ComponentsでJSON-LD形式で出力
- `<script type="application/ld+json">`タグで埋め込み
- 複数の構造化データを同じページに配置可能

---

### 3. サイトマップ（sitemap.xml）

#### 要件

**必須ページ**:

- トップページ（`/`）
- スペース一覧ページ（`/spaces`）
- 各スペース詳細ページ（`/spaces/[id]`）
- ブログ一覧ページ（`/posts`）
- 各ブログ記事ページ（`/posts/[slug]`）
- お知らせ一覧ページ（`/news`）
- 各お知らせページ（`/news/[id]`）
- 静的ページ（`/privacy`、`/terms`など）

**実装方法**:

- Next.js 16の`app/sitemap.ts`（または`app/sitemap.xml/route.ts`）を使用
- 動的ルート（スペース、ブログ記事）はデータベースから取得
- 公開済み（`isPublished = true`）のコンテンツのみ含める
- 更新頻度（`changefreq`）と優先度（`priority`）を設定
- 大量のページがある場合は、サイトマップインデックス（`sitemap-index.xml`）を使用して複数のサイトマップに分割

**サイトマップの分割**:

- 1つのサイトマップに含めるURL数: 最大50,000件（推奨: 10,000件以下）
- サイトマップファイルサイズ: 最大50MB（圧縮時: 10MB）
- 分割例:
  - `sitemap-spaces.xml`: スペース関連ページ
  - `sitemap-posts.xml`: ブログ記事
  - `sitemap-news.xml`: お知らせ
  - `sitemap-static.xml`: 静的ページ

**画像サイトマップ**:

- 画像を含むページ（スペース詳細、ブログ記事）には画像情報を含める
- `images`プロパティで画像URL、タイトル、キャプションを指定

**更新頻度の設定**:

- トップページ: `daily`
- スペース一覧・詳細: `weekly`
- ブログ一覧・記事: `daily`
- お知らせ: `weekly`
- 静的ページ: `monthly`

**優先度の設定**:

- トップページ: `1.0`
- スペース一覧・詳細: `0.8`
- ブログ一覧・記事: `0.7`
- お知らせ: `0.6`
- 静的ページ: `0.5`

---

### 4. robots.txt

#### 要件

**許可するパス**:

- `/`（トップページ）
- `/spaces`（スペース一覧）
- `/spaces/*`（スペース詳細）
- `/posts`（ブログ一覧）
- `/posts/*`（ブログ記事）
- `/news`（お知らせ一覧）
- `/news/*`（お知らせ詳細）
- `/privacy`、`/terms`（静的ページ）

**禁止するパス**:

- `/admin/*`（管理画面）
- `/api/*`（APIエンドポイント、認証が必要なもの）
- `/_next/*`（Next.js内部ファイル）
- `/favicon.ico`、`/robots.txt`、`/sitemap.xml`（除外不要）

**実装方法**:

- Next.js 16の`app/robots.ts`（または`app/robots.txt/route.ts`）を使用
- サイトマップのURLを指定（`Sitemap: https://example.com/sitemap.xml`）

---

### 5. カノニカルURL

#### 要件

**すべてのページに実装**:

- `<link rel="canonical">`タグを追加
- 重複コンテンツの防止
- パラメータ付きURLの正規化（例: `/posts?page=1` → `/posts`）

**実装方法**:

- Next.js 16の`Metadata` APIで`alternates.canonical`プロパティを使用
- 絶対URLで指定（`https://example.com/path`）

---

### 6. ページ固有のSEO要件

#### トップページ（`/`）

**メタタグ**:

- タイトル: サイト名 + キャッチコピー（例: `Myrrh Rental Space - 会議室・イベントスペースのレンタル`）
- 説明: サイトの概要（1-160文字）
- キーワード: レンタルスペース、会議室、イベントスペースなど

**構造化データ**:

- Organization
- WebSite
- LocalBusiness

**OGP**:

- タイトル: サイト名
- 説明: サイトの概要
- 画像: デフォルトOGP画像（設定画面で設定）

#### スペース一覧ページ（`/spaces`）

**メタタグ**:

- タイトル: `スペース一覧 | サイト名`
- 説明: 利用可能なスペースの概要
- キーワード: スペース一覧、会議室、イベントスペース

**構造化データ**:

- WebSite
- ItemList（スペース一覧の構造化データ）
  - リスト項目（各スペースへのリンク）
  - 順序、説明
- BreadcrumbList（必須）

**OGP**:

- タイトル: `スペース一覧 | サイト名`
- 説明: 利用可能なスペースの概要
- 画像: デフォルトOGP画像

#### スペース詳細ページ（`/spaces/[id]`）

**メタタグ**:

- タイトル: `{スペース名} | サイト名`
- 説明: スペースの詳細説明（1-160文字）
- キーワード: スペース名、設備、料金など

**構造化データ**:

- LocalBusiness（各スペースの情報、詳細なフィールドを使用）
  - 名前、説明、住所、電話番号、営業時間
  - 価格帯（`priceRange`）
  - 画像（複数可能）
  - 評価・レビュー（将来的に実装）
- Service（サービス情報）
  - サービス名、説明、提供エリア、価格
- BreadcrumbList（必須）

**OGP**:

- タイトル: `{スペース名} | サイト名`
- 説明: スペースの詳細説明
- 画像: スペースのメイン画像（複数可能）
- タイプ: `website`または`business.business`

#### ブログ一覧ページ（`/posts`）

**メタタグ**:

- タイトル: `ブログ | サイト名`
- 説明: ブログの概要（1-160文字）
- キーワード: ブログ、記事、レンタルスペース情報など

**構造化データ**:

- WebSite
- ItemList（ブログ記事一覧の構造化データ）
  - リスト項目（各記事へのリンク）
  - 順序、説明
- BreadcrumbList（必須）

**OGP**:

- タイトル: `ブログ | サイト名`
- 説明: ブログの概要
- 画像: デフォルトOGP画像

**詳細**: [`posts.md`](./posts.md)の「SEO最適化」セクションを参照

#### ブログ記事詳細ページ（`/posts/[slug]`）

**メタタグ**:

- タイトル: `{記事タイトル} | サイト名`（`ogpTitle`があれば優先）
- 説明: メタディスクリプション（`metaDescription`があれば優先、なければ`excerpt`）
- キーワード: メタキーワード（`metaKeywords`があれば使用）

**構造化データ**:

- Article（記事情報）
- BreadcrumbList

**OGP**:

- タイトル: OGPタイトル（`ogpTitle`があれば優先、なければ`title`）
- 説明: OGP説明（`ogpDescription`があれば優先、なければ`excerpt`）
- 画像: OGP画像（`ogpImageUrl`があれば優先、なければ`thumbnailUrl`）
- タイプ: `article`

**詳細**: [`posts.md`](./posts.md)の「SEO最適化」セクションを参照

#### お知らせページ（`/news`、`/news/[id]`）

**メタタグ**:

- タイトル: `お知らせ | サイト名`（一覧）、`{お知らせタイトル} | サイト名`（詳細）
- 説明: お知らせの概要または詳細
- キーワード: お知らせ、ニュースなど

**構造化データ**:

- WebSite
- ItemList（一覧ページ、お知らせ一覧の構造化データ）
- BreadcrumbList（必須）

**OGP**:

- タイトル: お知らせタイトル
- 説明: お知らせの概要
- 画像: デフォルトOGP画像

---

### 7. サイト全体のSEO設定

#### 管理画面での設定項目

**SEO設定タブ** (`/admin/settings/seo`):

- デフォルトメタディスクリプション（1-160文字）
- デフォルトメタキーワード（カンマ区切り）
- デフォルトOGPタイトル（1-60文字）
- デフォルトOGP説明（1-200文字）
- Google Analytics ID（G-XXXXXXXXXX形式）
- Google Search Console ID

**詳細**: [`settings.md`](./settings.md)の「SEO設定」セクションを参照

---

### 8. 技術的な実装要件

#### Next.js 16 Metadata API

**実装方法**:

- Server Componentsで`generateMetadata`関数を使用
- ページ固有のメタデータを優先、設定されていない場合はデフォルト値を使用
- 動的ルート（`[id]`、`[slug]`）ではデータベースから取得

**例**:

```typescript
// src/app/(public)/posts/[slug]/page.tsx
export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const post = await getBlogPost(slug);

  if (!post) {
    return {
      title: "記事が見つかりません",
    };
  }

  return {
    title: post.ogpTitle || post.title,
    description: post.metaDescription || post.excerpt,
    keywords: post.metaKeywords?.split(",").map((k) => k.trim()),
    openGraph: {
      title: post.ogpTitle || post.title,
      description: post.ogpDescription || post.excerpt,
      images: [post.ogpImageUrl || post.thumbnailUrl],
      type: "article",
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: [post.author.name],
    },
    twitter: {
      card: "summary_large_image",
      title: post.ogpTitle || post.title,
      description: post.ogpDescription || post.excerpt,
      images: [post.ogpImageUrl || post.thumbnailUrl],
    },
    alternates: {
      canonical: `https://example.com/posts/${post.slug}`,
    },
  };
}
```

#### 構造化データ（JSON-LD）の実装

**実装方法**:

- Server ComponentsでJSON-LD形式のデータを生成
- `<script type="application/ld+json">`タグで埋め込み

**例**:

```typescript
// src/app/(public)/posts/[slug]/page.tsx
export default async function BlogPostPage(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params
  const post = await getBlogPost(slug)

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: post.ogpImageUrl || post.thumbnailUrl,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: {
      '@type': 'Person',
      name: post.author.name,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Myrrh Rental Space',
      logo: {
        '@type': 'ImageObject',
        url: 'https://example.com/logo.png',
      },
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      {/* コンテンツ */}
    </>
  )
}
```

#### サイトマップの実装

**実装方法**:

- Next.js 16の`app/sitemap.ts`を使用

**例**:

```typescript
// src/app/sitemap.ts
import { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://example.com";

  // 静的ページ
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/spaces`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/posts`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
  ];

  // 動的ページ（スペース）
  const spaces = await prisma.space.findMany({
    where: { isPublished: true },
    select: { id: true, updatedAt: true },
  });
  const spacePages: MetadataRoute.Sitemap = spaces.map((space) => ({
    url: `${baseUrl}/spaces/${space.id}`,
    lastModified: space.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // 動的ページ（ブログ記事）
  const blogPosts = await prisma.blogPost.findMany({
    where: { isPublished: true },
    select: { slug: true, updatedAt: true },
  });
  const blogPages: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/posts/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [...staticPages, ...spacePages, ...blogPages];
}
```

#### robots.txtの実装

**実装方法**:

- Next.js 16の`app/robots.ts`を使用

**例**:

```typescript
// src/app/robots.ts
import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/"],
    },
    sitemap: "https://example.com/sitemap.xml",
  };
}
```

---

### 9. Google Analytics統合

#### 要件

**実装方法**:

- Google Analytics 4（GA4）を使用
- Next.js 16の`next/script`コンポーネントで読み込み
- 設定画面（`/admin/settings/seo`）でGoogle Analytics IDを設定

**実装場所**:

- ルートレイアウト（`src/app/layout.tsx`）
- 設定画面でIDが設定されている場合のみ読み込み

**例**:

```typescript
// src/app/layout.tsx
import Script from 'next/script'
import { getSettings } from '@/actions/admin/settings'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings()

  return (
    <html lang="ja">
      <body>
        {children}
        {settings.googleAnalyticsId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${settings.googleAnalyticsId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${settings.googleAnalyticsId}');
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  )
}
```

---

### 10. Google Search Console統合

#### 要件

**実装方法**:

- Google Search Consoleの検証用メタタグを追加
- 設定画面（`/admin/settings/seo`）でGoogle Search Console IDを設定

**実装場所**:

- ルートレイアウト（`src/app/layout.tsx`）
- 設定画面でIDが設定されている場合のみ追加

**例**:

```typescript
// src/app/layout.tsx
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();

  return {
    // ... その他のメタデータ
    verification: {
      google: settings.googleSearchConsoleId || undefined,
    },
  };
}
```

---

### 11. パフォーマンス最適化（SEO関連）

#### Core Web Vitals

**重要指標**:

- **LCP（Largest Contentful Paint）**: 2.5秒以内
- **FID（First Input Delay）**: 100ミリ秒以内
- **CLS（Cumulative Layout Shift）**: 0.1以内

**最適化方法**:

- Next.js Imageコンポーネントの使用（自動最適化、遅延読み込み）
- 画像の最適化（WebP形式、適切なサイズ、`srcset`対応）
- フォントの最適化（`next/font`、`font-display: swap`）
- コード分割と動的インポート（`dynamic`、`React.lazy`）
- リソースヒント（`dns-prefetch`、`preconnect`、`preload`、`prefetch`）
- クリティカルCSSのインライン化
- 非クリティカルJavaScriptの遅延読み込み

#### ページ速度

**要件**:

- ページ読み込み時間: 3秒以内（モバイル）
- Time to First Byte（TTFB）: 600ミリ秒以内

**最適化方法**:

- ISR（Incremental Static Regeneration）の活用
- キャッシュ戦略の最適化（Next.js Cache API、CDNキャッシュ）
- CDNの活用（Cloudflare）
- Edge Cachingの活用（Cloudflare Edge）
- データベースクエリの最適化（Prisma、インデックス活用）
- APIレスポンスの最適化（必要なフィールドのみ取得）

---

### 12. モバイル最適化

#### レスポンシブデザイン

**要件**:

- すべてのページがモバイル対応
- タッチフレンドリーなUI
- 適切なフォントサイズ（最小16px）

#### モバイルフレンドリーテスト

**要件**:

- Google Search Consoleのモバイルフレンドリーテストで合格
- モバイルでの表示確認

---

### 13. アクセシビリティ（SEO関連）

#### 要件

**WCAG 2.1 AA準拠**:

- 適切な見出し構造（H1-H6、1ページにH1は1つのみ、階層構造を維持）
- 画像のalt属性（装飾画像は空文字列、意味のある画像は適切な説明）
- キーボードナビゲーション対応（フォーカス順序、スキップリンク）
- コントラスト比の確保（テキスト: 4.5:1以上、大きなテキスト: 3:1以上）
- セマンティックHTML（`<article>`、`<section>`、`<nav>`、`<header>`、`<footer>`など）
- ARIA属性の適切な使用（必要に応じて）

**SEOへの影響**:

- アクセシビリティの向上はSEOにも寄与
- 検索エンジンがコンテンツを理解しやすくなる
- セマンティックHTMLは検索エンジンがコンテンツの構造を理解するのに重要

---

### 14. セキュリティ（SEO関連）

#### HTTPS

**要件**:

- すべてのページがHTTPSで配信
- 混合コンテンツ（HTTPリソース）の排除

#### セキュリティヘッダー

**要件**:

- 適切なセキュリティヘッダーの設定
- 詳細は[`SECURITY.md`](../security/README.md)を参照

---

### 15. 国際化（将来的に）

#### 多言語対応

**将来的な要件**:

- 多言語対応（日本語、英語など）
- `hreflang`タグの実装
- 言語別のサイトマップ

**現時点では日本語のみ対応**

---

### 16. コンテンツSEO

#### 見出し構造の最適化

**要件**:

- 1ページにH1は1つのみ（ページタイトル）
- H2-H6は階層構造を維持（H2の後にH3、H3の後にH4など）
- 見出しタグはコンテンツの構造を反映
- 見出し内にキーワードを含める（自然に）

#### 内部リンク戦略

**要件**:

- 関連コンテンツへの内部リンクを適切に配置
- アンカーテキストは意味のあるテキストを使用（`クリック here`は避ける）
- リンク先のコンテンツと関連性がある
- パンくずリストの実装（すべてのページ）

#### コンテンツの深さと階層

**要件**:

- トップページから3クリック以内で主要コンテンツにアクセス可能
- サイト構造が論理的で分かりやすい
- カテゴリとタグによる分類（ブログ、スペース）

---

### 17. リソースヒント

#### 実装するリソースヒント

**dns-prefetch**:

- 外部ドメインへのDNS解決を事前に行う
- 例: Google Analytics、外部フォント、CDN

**preconnect**:

- 外部リソースへの接続を事前に確立
- 例: Google Fonts、外部API

**preload**:

- クリティカルリソースを事前に読み込む
- 例: クリティカルCSS、重要なフォント、ヒーロー画像

**prefetch**:

- 次のページ遷移で使用される可能性の高いリソースを事前に読み込む
- 例: 次のページのJavaScript、画像

**実装方法**:

- Next.js 16の`Metadata` APIで`other`プロパティを使用
- または`<link>`タグを直接追加

**例**:

```typescript
// src/app/layout.tsx
export const metadata: Metadata = {
  other: {
    "dns-prefetch": "https://www.googletagmanager.com",
    preconnect: "https://fonts.googleapis.com",
  },
};
```

---

### 18. エラーページのSEO

#### 404エラーページ

**要件**:

- カスタム404ページ（`app/not-found.tsx`）
- 適切なメタタグ（`noindex`を設定）
- ユーザーフレンドリーなエラーメッセージ
- サイト内検索や主要ページへのリンク

#### 500エラーページ

**要件**:

- カスタム500ページ（`app/error.tsx`）
- 適切なメタタグ（`noindex`を設定）
- エラーログの記録

#### メタタグの設定

**エラーページ**:

- `<meta name="robots" content="noindex, nofollow">`: 検索エンジンにインデックスさせない

---

## 実装優先順位

### フェーズ1: 基本SEO（必須）

1. **メタタグ実装**
   - すべてのページに`<title>`と`<meta name="description">`を追加
   - ページ固有のメタデータを優先、デフォルト値を使用

2. **OGPタグ実装**
   - すべてのページにOGPタグを追加
   - 画像の最適化（1200x630px）

3. **サイトマップ生成**
   - `app/sitemap.ts`の実装
   - 動的ルートの対応

4. **robots.txt生成**
   - `app/robots.ts`の実装

### フェーズ2: 構造化データ（重要）

5. **構造化データ実装**
   - Organization
   - WebSite
   - LocalBusiness
   - Article（ブログ記事）

6. **カノニカルURL実装**
   - すべてのページにカノニカルURLを追加

### フェーズ3: 分析・検証（拡張）

7. **Google Analytics統合**
   - GA4の実装
   - 設定画面でのID設定

8. **Google Search Console統合**
   - 検証用メタタグの追加
   - 設定画面でのID設定

### フェーズ4: 最適化（継続的改善）

9. **パフォーマンス最適化**
   - Core Web Vitalsの改善
   - ページ速度の最適化
   - リソースヒントの実装

10. **アクセシビリティ向上**
    - WCAG 2.1 AA準拠
    - 見出し構造の最適化
    - セマンティックHTMLの使用

11. **コンテンツSEO**
    - 見出し構造の最適化
    - 内部リンク戦略の実装
    - パンくずリストの実装（すべてのページ）

12. **追加の構造化データ**
    - FAQPage（FAQページ）
    - Review/Rating（レビュー機能）
    - Event（イベント情報）
    - Service（サービス情報）
    - ItemList（リストページ）

---

## テスト要件

### SEOテスト

**テスト項目**:

- メタタグの存在確認（すべてのページ）
- OGPタグの存在確認（すべてのページ）
- 構造化データの検証（Google Rich Results Test）
- サイトマップの検証（Google Search Console）
- robots.txtの検証
- カノニカルURLの確認

**テストツール**:

- Google Search Console（インデックス状況、検索パフォーマンス、エラー確認）
- Google Rich Results Test（構造化データの検証）
- PageSpeed Insights（パフォーマンス、Core Web Vitals）
- Lighthouse（SEOスコア、パフォーマンス、アクセシビリティ、ベストプラクティス）
- Schema Markup Validator（構造化データの検証）
- Mobile-Friendly Test（モバイルフレンドリーテスト）
- Bing Webmaster Tools（Bing検索エンジン最適化）

### 実装後の確認

**確認項目**:

- すべてのページがGoogle Search Consoleに登録されているか
- サイトマップが正しく生成されているか（サイトマップインデックス含む）
- 構造化データが正しく認識されているか（Google Rich Results Testで検証）
- モバイルフレンドリーテストが合格しているか
- Core Web Vitalsが目標値を満たしているか（LCP < 2.5s、FID < 100ms、CLS < 0.1）
- すべてのページにカノニカルURLが設定されているか
- パンくずリストがすべてのページに実装されているか
- エラーページ（404、500）が適切に設定されているか
- リソースヒントが適切に実装されているか

---

## 参考資料

### プロジェクトドキュメント

- [`settings.md`](./settings.md) - サイト設定画面のSEO設定
- [`posts.md`](./posts.md) - 投稿機能のSEO要件
- [`README.md`](./README.md) - 機能要件（SEO関連）
- [`DATABASE_DESIGN.md`](../architecture/DATABASE_DESIGN.md) - データベース設計（SEOフィールド）
- [`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) - システムアーキテクチャ

### 外部リソース

- [Next.js 16 Metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [Google Search Central](https://developers.google.com/search/docs)
- [Schema.org](https://schema.org/)
- [Open Graph Protocol](https://ogp.me/)
- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [PageSpeed Insights](https://pagespeed.web.dev/)
- [Web.dev SEO Guide](https://web.dev/learn/seo/)
- [Context7 MCP](https://github.com/upstash/context7) - LLM向けの最新コードドキュメント

### Context7 MCP

**自動使用ルール**: SEO関連のライブラリドキュメント（Next.js Metadata API、構造化データ、OGP設定など）が必要な場合、Context7 MCPを自動的に使用して最新のドキュメントとコード例を取得してください。

**使用タイミング**:

- Next.js Metadata APIの詳細な使用方法
- 構造化データ（JSON-LD）の最新スキーマ仕様
- OGPタグの実装パターン
- Google Analytics/Search Consoleの統合方法

---

## 更新履歴

- **2026-01-08**: 整合性確認とブラッシュアップ、以下の修正を実施:
  - Next.js 16の`generateMetadata`関数の非同期params構文を修正（`Promise<{ slug: string }>`形式に更新）
  - お知らせページの構造化データにItemListとBreadcrumbList（必須）を追加
  - 外部リソースにWeb.dev SEO GuideとContext7 MCPリファレンスを追加
  - Context7 MCPセクションを追加（SEO関連ドキュメント取得の自動使用ルール）
  - コード例のJSON-LD実装パターンを最新のNext.js 16構文に更新
- **2026-01-07**: SEO要件定義を強化、以下の改善を追加:
  - 追加の構造化データ（FAQPage、Review/Rating、Event、Service、ItemList、VideoObject）
  - モバイル最適化メタタグ（theme-color、apple-mobile-web-app-capableなど）
  - OGPタグの詳細化（画像サイズ、alt属性、localeなど）
  - Twitter Cardタグの詳細化
  - サイトマップの分割と画像サイトマップ対応
  - リソースヒント（dns-prefetch、preconnect、preload、prefetch）
  - コンテンツSEO（見出し構造、内部リンク戦略）
  - エラーページのSEO
  - アクセシビリティの詳細化（セマンティックHTML、ARIA属性）
  - パフォーマンス最適化の詳細化
  - テストツールと確認項目の拡充
- **2026-01-07**: 初版作成、包括的なSEO要件定義を追加
