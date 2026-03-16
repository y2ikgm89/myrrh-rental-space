# Public Pages Redesign — Page-First Architecture

> Status: Draft
> Date: 2026-03-16
> Scope: 公開ページ全面刷新（デザイン + UX + アーキテクチャ）

## 1. 概要

### 目的

公開ページを「汎用セクション CMS パターン」から「Page-First Architecture」に移行し、コード側のデザイン自由度を最大化する。管理画面はコンテンツ編集（テキスト・画像・ボタン・カード）に特化させ、ページの構成・レイアウト・アニメーションはすべてコードで制御する。

### 原則

- **破壊的変更を許容** — 後方互換性のないクリーンな実装
- **Page-First** — 各ページに専用コンポーネントツリーを持つ
- **Slots + Collections** — コンテンツモデルを固定値（Slot）と可変長リスト（Collection）に分類
- **Design System** — 全ページ共通の Primitives で一貫性を担保
- **Best Practices** — Next.js 16 / React 19 / Tailwind CSS 4 の公式推奨パターン準拠

### 決定事項

| 項目           | 決定                                                      |
| -------------- | --------------------------------------------------------- |
| デザイン方向性 | 洗練・モダン + ラグジュアリー（Aesop + ブティックホテル） |
| カラー         | Deep Neutral + Warm Accent（Champagne Gold 廃止）         |
| ターゲット     | 個人利用 + ビジネス利用（同等）                           |
| UX             | 全面再設計（導線、インタラクション、モバイル体験）        |
| 管理画面       | コンテンツ編集に特化（ページ構成はコード定義）            |
| カスタムページ | `[...segments]` のみセクション方式を維持                  |

---

## 2. デザインシステム

### 2.1 カラーパレット

「写真が主役」の額縁デザイン。高コントラスト・高可読性。

```css
@theme {
  /* === Base === */
  --color-background: oklch(0.985 0 0);
  --color-surface: oklch(0.96 0.005 80);
  --color-foreground: oklch(0.15 0.01 250);
  --color-muted-foreground: oklch(0.55 0.01 250);
  --color-border: oklch(0.88 0.005 80);

  /* === Accent (Deep Warm Brown) === */
  --color-accent: oklch(0.45 0.03 60);
  --color-accent-light: oklch(0.94 0.015 60);
  --color-accent-foreground: oklch(0.985 0 0);

  /* === Semantic === */
  --color-success: oklch(0.55 0.15 145);
  --color-warning: oklch(0.7 0.15 70);
  --color-destructive: oklch(0.55 0.2 25);
  --color-info: oklch(0.55 0.1 250);

  /* === Component === */
  --color-card: oklch(0.985 0 0);
  --color-card-foreground: oklch(0.15 0.01 250);
  --color-overlay: oklch(0 0 0 / 0.6);
}
```

**70/20/10 ルール**: Background 70% / Foreground+Border 20% / Accent 10%

**コントラスト比**: Foreground on Background = 15:1（WCAG AAA）、Muted on Background = 4.6:1（WCAG AA）

### 2.2 タイポグラフィ

```css
@theme {
  --font-sans: "Noto Sans JP", sans-serif;
  --font-serif: "Noto Serif JP", serif;

  --text-hero: clamp(2.5rem, 5vw + 1rem, 4.5rem); /* 40-72px */
  --text-h1: clamp(2rem, 3vw + 0.5rem, 3rem); /* 32-48px */
  --text-h2: clamp(1.5rem, 2vw + 0.5rem, 2.25rem); /* 24-36px */
  --text-h3: clamp(1.25rem, 1.5vw + 0.5rem, 1.5rem); /* 20-24px */
  --text-body: 1rem; /* 16px */
  --text-small: 0.875rem; /* 14px */
  --text-label: 0.6875rem; /* 11px */

  --leading-tight: 1.3;
  --leading-normal: 1.8; /* 日本語に最適化 */
  --leading-relaxed: 2;

  --tracking-tight: -0.02em; /* 見出し */
  --tracking-normal: 0; /* 本文 */
  --tracking-wide: 0.1em; /* ラベル */
}
```

- 見出し: Noto Serif JP 500/700, letter-spacing: tight
- 本文: Noto Sans JP 400/500, line-height: 1.8, max-width: 65ch
- ラベル: Noto Sans JP 500, 11px, uppercase, letter-spacing: wide

### 2.3 スペーシング

8px グリッドベース。

```css
@theme {
  --spacing-section: clamp(5rem, 8vw, 7.5rem); /* 80-120px */
  --spacing-block: clamp(2rem, 4vw, 3rem); /* 32-48px */
  --spacing-element: 1.5rem; /* 24px */
  --spacing-inline: 1rem; /* 16px */

  --container-max: 80rem; /* 1280px */
  --container-padding: clamp(1.5rem, 3vw, 3rem); /* 24-48px */

  --radius-sm: 0.375rem; /* 6px */
  --radius-md: 0.5rem; /* 8px */
  --radius-lg: 0.75rem; /* 12px */
  --radius-full: 9999px;
}
```

### 2.4 シャドウ

```css
@theme {
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px oklch(0 0 0 / 0.07);
  --shadow-lg: 0 10px 15px oklch(0 0 0 / 0.1);
  --shadow-card: 0 1px 3px oklch(0 0 0 / 0.04), 0 1px 2px oklch(0 0 0 / 0.06);
}
```

### 2.5 アニメーション定数

```typescript
export const DURATION = {
  fast: 0.3,
  normal: 0.6,
  slow: 0.8,
  hero: 1.2,
} as const;

export const EASE = {
  out: "power3.out",
  inOut: "power2.inOut",
  elastic: "elastic.out(1, 0.3)",
} as const;

export const STAGGER = {
  char: 0.03,
  word: 0.06,
  card: 0.1,
} as const;

export const SCROLL_TRIGGER = {
  reveal: { start: "top 85%", toggleActions: "play none none none" },
} as const;
```

**アニメーション原則**:

- 出現: fade + translate-y(24px), duration 0.6s, ease power3.out
- パララックス: speed 0.15 以下（控えめ）
- ホバー: scale 1.02, transition 0.3s
- SplitText は Hero のみ
- モバイル: duration 60% に短縮
- `prefers-reduced-motion: reduce`: アニメーション完全無効

---

## 3. UI コンポーネント

### 3.1 Design System Primitives

```
_design-system/
├── tokens.css          # CSS 変数定義
├── button.tsx          # variant: primary/secondary/ghost/link, size: sm/md/lg
├── card.tsx            # hover shadow+scale, clickable area全体
├── heading.tsx         # level (h1-h4) に応じた自動スタイリング
├── prose.tsx           # 本文コンテンツ用 (max-width: 65ch, leading: 1.8)
├── container.tsx       # max-w + padding, variant: default/narrow/wide
├── stack.tsx           # 垂直/水平 spacing 管理
├── badge.tsx           # ステータス表示
├── input.tsx           # テキスト入力
├── select.tsx          # セレクトボックス
├── textarea.tsx        # テキストエリア
└── image-frame.tsx     # next/image + aspect-ratio + skeleton loading
```

**Button 仕様**:

| Variant     | 用途                  | スタイル                                      |
| ----------- | --------------------- | --------------------------------------------- |
| `primary`   | CTA（予約する、送信） | bg-accent, text-accent-foreground, rounded-lg |
| `secondary` | 副次アクション        | border-border, bg-transparent, rounded-lg     |
| `ghost`     | テキストリンク風      | bg-transparent, hover:bg-surface              |
| `link`      | インラインリンク      | underline, text-accent                        |

最小タッチターゲット: 44x44px（WCAG 2.5.5）

**Card 仕様**:

- `bg-card border-border rounded-lg shadow-card`
- hover: `shadow-lg scale-[1.02] transition-all duration-300`
- clickable: カード全体がリンク（`<a>` でラップ）

### 3.2 Composite コンポーネント

```
_components/
├── site-header.tsx       # ロゴ + ナビ + 予約CTA
├── site-footer.tsx       # NAP + ナビ + ソーシャル + コピーライト
├── site-cta.tsx          # 全ページ共通の予約誘導セクション
├── page-hero.tsx         # variant: full(画像背景) / compact(タイトルのみ)
├── breadcrumb.tsx        # JSON-LD 対応パンくず
├── image-gallery.tsx     # ライトボックス付き画像グリッド
├── filter-bar.tsx        # スペース一覧用フィルタ/ソート
├── step-indicator.tsx    # 予約フロー用ステップ表示
├── mobile-nav.tsx        # モバイル下部固定ナビゲーション
└── share-buttons.tsx     # SNS シェアボタン
```

### 3.3 Animation Primitives

```
_animations/
├── scroll-reveal.tsx     # IntersectionObserver + GSAP
├── parallax-layer.tsx    # CSS transform ベース
├── split-text.tsx        # Hero 専用 GSAP SplitText
└── fade-in.tsx           # シンプルなフェードイン
```

---

## 4. ページ設計

### 4.1 トップページ

```
[PageHero: full]
  背景画像（フルブリード）+ オーバーレイ
  SplitText タイトル + サブタイトル
  CTA ボタン
  ScrollIndicator

[ConceptSection]
  左: 見出し + 本文（prose, max 65ch）
  右: 画像（ParallaxLayer）
  ※ モバイルは縦積み

[SpaceShowcase]
  セクションラベル + 見出し
  スペースカード × 3-4（横スクロール on mobile）
  「すべてのスペースを見る」リンク

[FeaturesSection]
  3カラムグリッド
  各カード: アイコン + タイトル + 説明文
  ScrollReveal（stagger: card）

[SiteCTA]
  見出し + ボタン群
  背景: surface
```

### 4.2 スペース一覧

```
[PageHero: compact]
  タイトル + パンくず

[FilterBar]
  カテゴリフィルタ + 人数フィルタ + ソート（価格/新着）
  モバイル: フィルタボタン → ボトムシート

[SpaceGrid]
  カードグリッド（2col desktop / 1col mobile）
  各カード: 画像 + 名前 + 容量 + 価格 + Badge（利用可能等）
  ページネーション（nuqs 維持）
```

### 4.3 スペース詳細（新規ルート: `spaces/[slug]`）

> **注意**: 現在 `spaces/[slug]` ルートは存在しない。新規作成が必要。
> Space モデルの `slug` フィールドが必要（既存の `id` or `name` からの slug 生成 or DB にカラム追加）。

```
[ImageGallery]
  メイン画像 + サムネイル 4枚
  クリックでライトボックス

[2-Column Layout]
  左（60%）:
    スペース名 + Badge
    説明文（prose）
    設備・備品リスト（アイコングリッド）
    アクセス情報 + 地図
    利用規約

  右（40%, sticky）:
    予約ウィジェット（カレンダー + 時間選択 + 人数 + CTA）
    料金テーブル

[RelatedSpaces]
  横スクロールカード × 3

[SiteCTA]
```

### 4.4 予約ページ

```
[StepIndicator]
  Step 1: 日時選択
  Step 2: 人数・オプション
  Step 3: お客様情報
  Step 4: 確認
  Step 5: 完了

[FormContent]
  各ステップのフォーム
  バリデーション: Zod + useActionState
  戻る/進むボタン

[OrderSummary]
  サイドバー（desktop）/ 折りたたみ（mobile）
  選択内容サマリー + 合計金額
```

**予約フォーム技術詳細**:

- **状態管理**: URL search params (nuqs) でステップ管理 (`?step=1`)。ブラウザバックで前ステップに戻れる
- **Stripe 連携**: Step 4（確認）で Stripe Payment Intent 作成、Step 5 で完了処理
- **Google Calendar**: 予約完了後にサーバーサイドで Google Calendar API 経由で予定登録
- **各ステップ**: 個別の Server Action。`useActionState` で各ステップのバリデーション + 次ステップ遷移
- **カレンダー UI**: 既存の予約システムのカレンダーコンポーネントをリファクタリングして使用

### 4.5 ニュース一覧 / ブログ一覧

```
[PageHero: compact]
[カテゴリフィルタ]  ※ ブログのみ
[CardList]
  日付 + タイトル + 抜粋 + サムネイル
  ページネーション
```

### 4.6 ニュース詳細 / ブログ詳細

```
[ArticleHero]
  タイトル + 日付 + カテゴリ + サムネイル

[ArticleBody]
  prose (max-width: 65ch, centered)
  Lexical リッチテキスト出力

[RelatedArticles]
  カード × 3

[ShareButtons]
```

### 4.7 お問い合わせ

```
[PageHero: compact]

[2-Column Layout]
  左: お問い合わせフォーム（名前、メール、電話、内容）
  右: 営業情報 + 地図 + ソーシャルリンク
```

### 4.8 会社概要

```
[PageHero: compact]
[ContentSections]
  見出し + 本文 のペア × N
  画像挿入可
[MapSection]
```

### 4.9 FAQ

```
[PageHero: compact]
[CategoryTabs]
  カテゴリ別タブ
[AccordionList]
  質問 + 回答のアコーディオン
```

### 4.10 利用規約 / プライバシーポリシー

```
[PageHero: compact]
[Prose]
  リッチテキスト本文（65ch centered）
  目次（見出しから自動生成）
```

---

## 5. UX 設計

### 5.1 ナビゲーション

**デスクトップ**:

- Header: ロゴ（左）+ ナビリンク（中央）+ 予約 CTA（右）
- スクロール: 透明 → 白背景（Hero ページ）、常時白（その他）
- アクティブ状態: accent color + underline

**モバイル**:

- Header: ロゴ（左）+ ハンバーガー（右）
- 下部固定ナビ: ホーム / スペース / 予約 / メニュー（4アイコン）
- ハンバーガー: フルスクリーンオーバーレイ

### 5.2 予約導線

```
トップページ Hero CTA
       ↓
スペース一覧（フィルタで絞り込み）
       ↓
スペース詳細（サイドバー予約ウィジェット）
       ↓
予約フォーム（ステップ式）
       ↓
予約完了
```

- スペース詳細の予約ウィジェットは sticky（デスクトップ）
- モバイルでは下部固定「予約する」ボタン
- 全ページ下部に SiteCTA（予約誘導）

### 5.3 レスポンシブ戦略

| 要素     | Desktop (1024px+) | Tablet (768-1023px)     | Mobile (-767px)             |
| -------- | ----------------- | ----------------------- | --------------------------- |
| ナビ     | 横並びリンク      | 横並びリンク            | ハンバーガー + 下部固定     |
| グリッド | 3-4col            | 2col                    | 1col                        |
| Hero     | フルブリード画像  | フルブリード画像        | 縦長クロップ                |
| 詳細     | 2col (60/40)      | 1col (ウィジェット上部) | 1col (ウィジェット下部固定) |
| アニメ   | フル              | フル                    | 軽量版（duration 60%）      |
| Lenis    | 有効              | 有効                    | 無効（ネイティブ）          |

### 5.4 アクセシビリティ

- コントラスト比: テキスト 7:1+（AAA）、UI 4.5:1+（AA）
- タッチターゲット: 最小 44x44px
- フォーカス: 2px ring, accent color, 2px offset
- SkipLink: 「メインコンテンツへ」
- ARIA: landmark roles, live regions, dialog labels
- キーボード: Tab 順序、Escape でモーダル閉じ
- `prefers-reduced-motion`: アニメーション無効
- `prefers-color-scheme`: 将来の dark mode 対応を考慮した token 設計

---

## 6. コンテンツモデル

### 6.1 Slots + Collections パターン

```typescript
// コンテンツ型の基本構造
type Slot<T> = T;
type Collection<T> = T[];

type ButtonItem = {
  label: string;
  href: string;
  variant: "primary" | "secondary" | "ghost";
};

type ImageRef = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

type FeatureCard = {
  icon: string; // Lucide アイコン名
  title: string;
  description: string;
};
```

### 6.2 ページ別コンテンツ型

```typescript
// トップページ
type HomepageContent = {
  hero: {
    title: string;
    subtitle: string;
    image: ImageRef;
    cta: ButtonItem;
  };
  concept: {
    label: string;
    heading: string;
    body: string; // リッチテキスト
    image: ImageRef;
  };
  features: {
    label: string;
    heading: string;
    items: Collection<FeatureCard>;
  };
  cta: {
    heading: string;
    body: string;
    buttons: Collection<ButtonItem>;
  };
};

// スペース一覧
type SpaceListContent = {
  hero: {
    title: string;
    description: string;
  };
};

// お問い合わせ
type ContactContent = {
  hero: {
    title: string;
    description: string;
  };
  form: {
    heading: string;
    submitLabel: string;
    successMessage: string;
  };
  info: {
    heading: string;
    body: string; // リッチテキスト
  };
};
```

### 6.3 DB スキーマ

```prisma
model PageContent {
  id        String   @id @default(cuid())
  pageKey   String   @unique    // "homepage", "space-list", "contact" 等
  content   Json                // 型定義に準拠した JSON
  updatedAt DateTime @updatedAt
  updatedBy String?

  // SEO（既存 Page モデルから移行）
  metaTitle       String?
  metaDescription String?
  ogpTitle        String?
  ogpDescription  String?
  ogpImage        String?
}
```

管理画面はページの `pageKey` に対応するフォームを表示し、`content` JSON を更新する。

**コンテンツ取得時のバリデーション**: `getPageContent<T>(pageKey, zodSchema)` はDB の JSON を Zod でパースし、失敗時はデフォルト値にフォールバック（500 エラーにしない）。

**既存モデルとの共存**:

- `Page` モデル: `[...segments]` カスタムページ用に維持（セクション方式）
- `Section` モデル + `SectionType` enum: カスタムページ用に維持
- `PageContent` モデル: 新規。固定ページ（トップ、一覧、お問い合わせ等）のコンテンツ格納
- マイグレーション: 既存の固定ページ（homepage 等）のセクションデータ → `PageContent` JSON に変換するスクリプトを `scripts/migrate-page-content.ts` に作成。ロールバック用に逆変換スクリプトも用意

---

## 7. 技術アーキテクチャ

### 7.1 ディレクトリ構造

```
src/app/(public)/
├── layout.tsx                        # Root Layout (html/body)
├── page.tsx                          # トップページ
├── loading.tsx                       # 共通 Suspense fallback
├── error.tsx                         # エラー境界
├── not-found.tsx                     # 404
│
├── spaces/
│   ├── page.tsx                      # スペース一覧
│   └── [slug]/page.tsx               # スペース詳細
│
├── reservation/page.tsx              # 予約
│
├── news/
│   ├── page.tsx                      # ニュース一覧
│   ├── [slug]/page.tsx               # ニュース詳細
│   └── preview/[slug]/page.tsx       # プレビュー（維持）
│
├── posts/
│   ├── page.tsx                      # ブログ一覧
│   ├── [...segments]/page.tsx        # ブログ詳細
│   └── preview/[slug]/page.tsx       # プレビュー（維持）
│
├── contact/page.tsx                  # お問い合わせ
├── about/page.tsx                    # 会社概要
├── faq/page.tsx                      # FAQ
├── terms/
│   ├── page.tsx                      # 利用規約一覧
│   └── [slug]/page.tsx               # 個別利用規約（維持）
├── privacy/page.tsx                  # プライバシーポリシー
│
├── [...segments]/page.tsx            # カスタムページ（セクション方式維持）
│
├── _shared/                              # 公開ページ共有コード（既存 _shared 規約を維持）
│   ├── components/
│   │   ├── design-system/                # Design System Primitives（新規）
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── heading.tsx
│   │   │   ├── prose.tsx
│   │   │   ├── container.tsx
│   │   │   ├── stack.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── textarea.tsx
│   │   │   └── image-frame.tsx
│   │   ├── layouts/                      # Composite コンポーネント（リファクタリング）
│   │   │   ├── site-header.tsx
│   │   │   ├── site-footer.tsx
│   │   │   ├── site-cta.tsx
│   │   │   ├── page-hero.tsx
│   │   │   ├── breadcrumb.tsx
│   │   │   └── mobile-nav.tsx
│   │   ├── ui/                           # ページ横断 UI（新規）
│   │   │   ├── image-gallery.tsx
│   │   │   ├── filter-bar.tsx
│   │   │   ├── step-indicator.tsx
│   │   │   └── share-buttons.tsx
│   │   ├── animations/                   # Animation Primitives（リファクタリング）
│   │   │   ├── scroll-reveal.tsx
│   │   │   ├── parallax-layer.tsx
│   │   │   ├── split-text.tsx
│   │   │   └── fade-in.tsx
│   │   ├── a11y/                         # 維持（SkipLink, AriaLiveRegion）
│   │   ├── analytics/                    # 維持
│   │   └── seo/                          # 維持
│   ├── lib/
│   │   ├── content/                      # ページ別コンテンツ取得クエリ（新規）
│   │   │   ├── queries.ts                # getPageContent<T>(pageKey, schema)
│   │   │   └── types.ts                  # コンテンツ型定義
│   │   ├── seo/                          # 維持（metadata-factory, json-ld）
│   │   └── animations.ts                 # DURATION, EASE, STAGGER 定数（リファクタリング）
│   └── hooks/                            # 維持
│
└── _styles/
    └── public.css                        # @theme + @layer（tokens は public.css 内に統合）
```

### 7.2 削除対象

| 対象                                                                  | 理由                                            |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| `SectionRenderer`                                                     | ページ固有コンポーネントに置換                  |
| 17個の汎用セクションコンポーネント (`_components/HeroSection.tsx` 等) | 各ページに統合                                  |
| `ExperienceShell`                                                     | 過剰な抽象化。Provider を layout.tsx に直接配置 |
| `section-style-maps.ts`                                               | セクション設定 → CSS クラスのマッピング不要     |
| `SectionWrapper`                                                      | 各ページコンポーネントで直接制御                |
| Three.js / PixiJS 関連 (`effects/`)                                   | 現時点で不要。必要時に追加                      |
| `SmoothScrollProvider` (モバイル)                                     | モバイルではネイティブスクロール                |

### 7.3 維持対象

| 対象                                      | 理由                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| GSAP + ScrollTrigger                      | Hero SplitText、パララックスに必要                                          |
| Lenis (デスクトップのみ)                  | スムーススクロール体験。layout.tsx に直接初期化（`ExperienceShell` 削除後） |
| `[...segments]` カスタムページ            | 管理画面で作成するページ用                                                  |
| SEO 基盤 (JSON-LD, metadata-factory)      | 流用可能                                                                    |
| アクセシビリティ基盤 (SkipLink, AriaLive) | 流用可能                                                                    |
| nuqs (ページネーション)                   | 一覧ページで継続使用                                                        |
| AnnouncementBar                           | layout.tsx で維持                                                           |
| CookieConsentBanner                       | layout.tsx で維持                                                           |
| AnalyticsProvider + WebVitalsReporter     | layout.tsx で維持                                                           |
| GraphJsonLd (構造化データ)                | layout.tsx で維持                                                           |
| preview ルート (news/posts)               | 管理画面プレビュー機能用に維持                                              |

### 7.4 デザイントークン移行マップ

| 旧トークン              | 新トークン             | 備考                                           |
| ----------------------- | ---------------------- | ---------------------------------------------- |
| `--color-primary`       | `--color-accent`       | CTA、リンク、アクティブ状態                    |
| `--color-primary-dark`  | `--color-accent`       | 統合（旧 primary-dark の用途を accent に集約） |
| `--color-brand-primary` | 削除                   | accent に統合                                  |
| `--color-accent` (旧)   | `--color-accent-light` | 旧 accent は薄い背景色用途だった               |
| `--color-background`    | `--color-background`   | 値のみ変更                                     |
| `--color-surface`       | `--color-surface`      | 値のみ変更                                     |
| `--color-foreground`    | `--color-foreground`   | 値のみ変更                                     |

**`[...segments]` カスタムページ**: 旧トークンを参照するセクションコンポーネントが残るため、`public.css` に旧トークン → 新トークンのエイリアスを `@layer compat` で一時的に定義。全カスタムページの検証完了後に削除。

### 7.5 パフォーマンスバジェット

| ページ              | First Load JS 目標 | 備考                          |
| ------------------- | ------------------ | ----------------------------- |
| トップページ        | < 120kB            | GSAP + Lenis 含む             |
| スペース一覧        | < 100kB            | nuqs + フィルタ               |
| スペース詳細        | < 110kB            | ギャラリー + 予約ウィジェット |
| ニュース/ブログ一覧 | < 90kB             | カードリスト                  |
| 記事詳細            | < 85kB             | prose のみ                    |
| お問い合わせ        | < 90kB             | フォーム                      |
| 静的ページ (FAQ等)  | < 80kB             | 最軽量                        |

Three.js / PixiJS 削除により、現在のバンドルから約 200kB 削減見込み。

### 7.6 Next.js 16 ベストプラクティス適用

| パターン                      | 適用箇所                                |
| ----------------------------- | --------------------------------------- |
| Server Components (default)   | 全ページ、レイアウト                    |
| `'use cache'`                 | コンテンツ取得クエリ (`getPageContent`) |
| `connection()`                | 動的データ取得前（PPR opt-in）          |
| `Suspense` boundaries         | ページ内の動的セクション                |
| `generateMetadata`            | 全ページの SEO                          |
| `next/image` + sizes          | 全画像                                  |
| `next/font/google`            | Noto Sans JP + Noto Serif JP            |
| PPR (`cacheComponents: true`) | 静的シェル + 動的コンテンツ             |

### 7.7 React 19 ベストプラクティス適用

| パターン         | 適用箇所                                   |
| ---------------- | ------------------------------------------ |
| React Compiler   | 全コンポーネント（手動メモ化なし）         |
| `useActionState` | お問い合わせフォーム、予約フォーム         |
| `use()`          | Client Component で Promise / Context 消費 |
| `useEffectEvent` | GSAP コールバック                          |

---

## 8. 管理画面側の変更

### 8.1 新しいコンテンツ編集UI

現在の「セクション追加・並替」UIを、ページ専用コンテンツエディタに変更。

```
管理画面 > ページ管理 > [ページ選択]
├── ヒーロー
│   ├── タイトル       [テキスト入力]
│   ├── サブタイトル   [テキスト入力]
│   ├── 背景画像       [画像アップロード]
│   └── CTA ボタン     [テキスト + URL + variant]
├── コンセプト
│   ├── ラベル         [テキスト入力]
│   ├── 見出し         [テキスト入力]
│   ├── 本文           [リッチテキストエディタ]
│   └── 画像           [画像アップロード]
├── 特徴カード群       [Collection: 追加 / 編集 / 並替 / 削除]
│   ├── アイコン       [アイコン選択]
│   ├── タイトル       [テキスト入力]
│   └── 説明文         [テキスト入力]
└── CTA セクション
    ├── 見出し         [テキスト入力]
    ├── 本文           [テキスト入力]
    └── ボタン群       [Collection]
```

### 8.2 DB マイグレーション

- 新規: `PageContent` テーブル（`pageKey` + `content` JSON）
- 既存のセクション関連テーブルは `[...segments]` カスタムページ用に維持
- データ移行: 既存セクションデータ → `PageContent` JSON に変換するマイグレーションスクリプト

---

## 9. テスト戦略

| レイヤー                 | テスト手法                                 |
| ------------------------ | ------------------------------------------ |
| Design System Primitives | bun:test + JSDOM（props → className 検証） |
| ページコンポーネント     | bun:test（Server Component rendering）     |
| コンテンツ取得           | bun:test（クエリのモック）                 |
| UX フロー                | Playwright E2E（予約導線、ナビゲーション） |
| アクセシビリティ         | axe-core + Playwright                      |
| ビジュアル               | Playwright screenshot 比較                 |

---

## 10. 実装順序（概要）

1. **Design System** — tokens.css + Primitives（Button, Card, Heading 等）
2. **共通コンポーネント** — SiteHeader, SiteFooter, PageHero, Breadcrumb
3. **コンテンツ基盤** — PageContent モデル + クエリ + 管理画面エディタ
4. **トップページ** — 最初のページ実装（デザインシステムの実証）
5. **スペース一覧・詳細** — コア体験
6. **予約ページ** — コンバージョン
7. **その他ページ** — ニュース、ブログ、お問い合わせ、FAQ、会社概要、規約類
8. **旧コード削除** — 汎用セクション、ExperienceShell 等
9. **E2E テスト** — 全導線の検証

---

## 11. リスクと対策

| リスク                 | 対策                                                       |
| ---------------------- | ---------------------------------------------------------- |
| 大規模な破壊的変更     | ブランチで作業、段階的マージ                               |
| 管理画面の再実装コスト | PageContent エディタは汎用 JSON フォームで開始、改善は後続 |
| SEO への影響           | URL 構造は維持、リダイレクト設定                           |
| 既存コンテンツの移行   | マイグレーションスクリプトで自動変換                       |
| カスタムページの互換性 | `[...segments]` はセクション方式を維持                     |
