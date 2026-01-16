# 021: SEO/アクセシビリティ最適化

## 概要

SEOとアクセシビリティの包括的な最適化を実装。メタデータ管理、JSON-LD構造化データ、WCAG 2.1 AA準拠のアクセシビリティ機能を追加。

## 完了日

2026-01-13

## 変更内容

### 1. SEO基盤構築

#### 新規ファイル
- `src/lib/seo/metadata-factory.ts` - SEOメタデータ生成ファクトリ
  - `getSeoSettings()`: Settings DBからSEO設定を取得（use cache対応）
  - `generateHomeMetadata()`: ホームページ用メタデータ生成
  - `generateArticleMetadata()`: 記事ページ用メタデータ生成
  - `generatePageMetadata()`: 汎用ページメタデータ生成
  - canonical URL対応

- `src/lib/seo/json-ld-config.ts` - JSON-LD設定取得
  - `getWebSiteJsonLdData()`: WebSite構造化データ用設定
  - `getOrganizationJsonLdData()`: Organization構造化データ用設定

- `src/lib/seo/index.ts` - SEOライブラリエクスポート

#### 修正ファイル
- `src/components/seo/JsonLd.tsx`
  - `NewsArticleJsonLd`コンポーネント追加
  - XSSサニタイズ強化（< > & U+2028 U+2029をエスケープ）

- `src/app/(public)/page.tsx`
  - `generateMetadata()`追加（DBから動的取得）
  - `WebSiteJsonLd`追加

- `src/app/(public)/blog/[slug]/page.tsx`
  - `ArticleJsonLd`追加

- `src/app/(public)/news/[id]/page.tsx`
  - `NewsArticleJsonLd`追加

### 2. アクセシビリティ基盤構築

#### 新規ファイル
- `src/lib/a11y/skip-link.ts` - スキップリンク設定
- `src/lib/a11y/motion-utils.ts` - prefers-reduced-motionユーティリティ
- `src/lib/a11y/aria-live.ts` - ARIAライブリージョン設定
- `src/lib/a11y/index.ts` - A11yライブラリエクスポート
- `src/contexts/aria-live-context.tsx` - ARIA通知用React Context
- `src/contexts/index.ts` - Contextsエクスポート
- `src/components/a11y/SkipLink.tsx` - スキップリンクコンポーネント
- `src/components/a11y/AriaLiveRegion.tsx` - ライブリージョンコンポーネント
- `src/components/a11y/index.ts` - A11yコンポーネントエクスポート

#### 修正ファイル
- `src/app/globals.css`
  - コントラスト比改善（WCAG AA準拠: 45.1% → 40%）
  - `prefers-reduced-motion`サポート追加

- `src/app/(public)/layout.tsx`
  - `SkipLink`追加（キーボードナビゲーション改善）
  - `AriaLiveProvider`追加（スクリーンリーダー通知）
  - `AriaLiveRegion`追加

## 技術的詳細

### キャッシュ戦略
- `use cache`ディレクティブ + `cacheLife('hours')` + `cacheTag`
- 設定更新時にキャッシュ無効化可能

### アクセシビリティ機能
1. **スキップリンク**: 初回Tab押下時に表示、メインコンテンツへジャンプ
2. **ARIAライブリージョン**: polite/assertive両方のアナウンスメント対応
3. **prefers-reduced-motion**: 全アニメーション・トランジションを無効化
4. **コントラスト比**: WCAG 2.1 AA基準（4.5:1以上）準拠

### JSON-LD構造化データ
- `WebSite`: サイト全体の情報 + 検索アクション
- `Article`: ブログ記事（著者、公開日、更新日）
- `NewsArticle`: ニュース記事（公開者情報）

## ファイル構成

```
src/
├── lib/
│   ├── seo/
│   │   ├── index.ts
│   │   ├── metadata-factory.ts
│   │   └── json-ld-config.ts
│   └── a11y/
│       ├── index.ts
│       ├── skip-link.ts
│       ├── motion-utils.ts
│       └── aria-live.ts
├── contexts/
│   ├── index.ts
│   └── aria-live-context.tsx
└── components/
    ├── seo/
    │   └── JsonLd.tsx (修正)
    └── a11y/
        ├── index.ts
        ├── SkipLink.tsx
        └── AriaLiveRegion.tsx
```

## 使用方法

### SEOメタデータ
```typescript
// ページでのメタデータ生成
import { generateHomeMetadata, generateArticleMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  return generateHomeMetadata()
}
```

### ARIA通知
```typescript
import { useAriaLive } from '@/contexts'

function MyComponent() {
  const { announce } = useAriaLive()

  const handleAction = () => {
    announce('操作が完了しました', 'polite')
  }
}
```

## コードレビューで修正した項目

1. **XSSサニタイズ強化**: `<`, `>`, `&`, U+2028, U+2029をエスケープ
2. **null check追加**: news.contentのnull安全性
3. **canonical URL追加**: 全メタデータジェネレータにalternates.canonical追加

## 関連要件

- WCAG 2.1 AA準拠
- Schema.org構造化データ
- Next.js 16 PPR対応
