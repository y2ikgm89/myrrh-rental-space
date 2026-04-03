# Editorial Magazine 全公開ページ一貫性刷新 — Design Spec

> 2026-04-03 | デザインシステム v2 フル刷新 + 全28ルート統一

## Vision

ホームページで確立した Editorial Magazine（Kinfolk/Cereal）デザイン言語を、全公開ページに構造的に適用する。
Primitives レベルから再設計し、ページカテゴリ別テンプレートで一貫性を保証する。
破壊的変更を許容し、後方互換性ハックなしのクリーンな実装。

## 設計原則

| 原則                        | 根拠                                                          |
| --------------------------- | ------------------------------------------------------------- |
| Server Component デフォルト | React 19 / Next.js 16 推奨。state/effect のない UI は SC      |
| ref は通常 prop             | React 19 で forwardRef 廃止。`ref?: Ref<T>` で受ける          |
| CSS-first テーマ            | Tailwind CSS 4 の `@theme` + OKLCH。JS でカラー定義しない     |
| Fluid spacing               | `clamp()` で viewport responsive。固定 breakpoint 最小化      |
| Container Queries           | カードグリッド等のコンポーネント内レスポンシブは `@container` |
| `satisfies` over `as`       | TypeScript 6.0。型安全を維持しつつリテラル型を保持            |
| Anti-AI 準拠                | セリフ/サンス対比、70/20/10 色配分、非対称レイアウト          |

---

## Phase 1: CSS テーマ拡張

### public.css 追加トークン

```css
@theme {
  /* Section 背景交互パターン */
  --color-surface-alt: oklch(0.975 0.006 60);

  /* Editorial form style */
  --spacing-form-gap: 1.5rem;

  /* 追加テキストスタイル */
  --text-eyebrow: 0.6875rem;
  --text-eyebrow--line-height: 1;
  --text-eyebrow--letter-spacing: 0.18em;
  --text-eyebrow--font-weight: 500;

  --text-pullquote: clamp(1.5rem, 3vw + 0.5rem, 2.5rem);
  --text-pullquote--line-height: 1.3;
  --text-pullquote--letter-spacing: -0.01em;
  --text-pullquote--font-weight: 300;
}
```

### 追加ユーティリティ

```css
@layer utilities {
  /* Editorial 装飾ボーダー */
  .editorial-border-top {
    border-top: 1px solid var(--color-border);
  }

  .editorial-border-accent {
    border-top: 2px solid var(--color-accent);
  }
}
```

---

## Phase 2: Primitives 再設計（10既存 + 4新規）

### 2.1 Container — editorial variant 追加

```tsx
// 変更点:
// - variant に "editorial" 追加（65ch + generous padding、長文コンテンツ向け）
// - 全 variant の padding を CSS 変数化済み（変更なし）
type ContainerVariant = "default" | "narrow" | "wide" | "editorial";

const variantClasses = {
  default: "max-w-[var(--container-max)]",
  narrow: "max-w-3xl",
  wide: "max-w-screen-2xl",
  editorial: "max-w-[65ch]",
} as const satisfies Record<ContainerVariant, string>;
```

### 2.2 Heading — accent 装飾ライン

```tsx
// 変更点:
// - accent prop 追加（装飾ライン表示）
// - level 1-2 は font-heading（セリフ）、3-4 は font-sans を明示化
interface HeadingProps {
  readonly level: HeadingLevel;
  readonly children: ReactNode;
  readonly className?: string;
  readonly accent?: boolean; // 下部にアクセントライン
}

// level 1-2: font-heading font-light（セリフ・ライトウェイト）
// level 3-4: font-sans（サンス）— 既存の font-heading 一律適用を変更
const fontClasses = {
  1: "font-heading font-light",
  2: "font-heading font-light",
  3: "font-sans font-normal",
  4: "font-sans font-medium",
} as const satisfies Record<HeadingLevel, string>;
```

**破壊的変更**: H3/H4 が `font-heading`（セリフ）→ `font-sans`（サンス）に変更。Editorial Magazine の対比原則に準拠。

### 2.3 Stack — gap fluid 化

```tsx
// 変更点:
// - gap サイズを拡張。editorial に適した呼吸するスペーシング
const gapClasses = {
  none: "gap-0",
  xs: "gap-1.5", // 新規
  sm: "gap-3", // 2 → 3
  md: "gap-5", // 4 → 5
  lg: "gap-8", // 6 → 8
  xl: "gap-12", // 8 → 12
  "2xl": "gap-16", // 新規
  section: "gap-[var(--spacing-section)]",
} as const satisfies Record<StackGap, string>;
```

**破壊的変更**: sm/md/lg/xl の gap 値が拡大。全使用箇所の視覚的バランスが変わる。

### 2.4 Button — editorial variant 追加

```tsx
// 変更点:
// - "editorial" variant 追加（CTA 用 border-invert ボタン）
// - primary は現行維持（bg-accent + hover:bg-accent/90）
// - rounded-full は editorial のみ、他は rounded-lg 維持
const variantClasses = {
  primary:
    "bg-accent text-white rounded-lg shadow-sm transition-colors duration-200 hover:bg-accent/90 hover:shadow-md",
  secondary: "border border-border text-foreground hover:bg-surface rounded-lg",
  ghost: "bg-transparent text-foreground hover:bg-surface rounded-lg",
  link: "text-accent hover:text-accent-light underline-offset-4 hover:underline p-0",
  editorial:
    "border border-foreground text-foreground rounded-full transition-colors duration-300 hover:bg-foreground hover:text-background",
} as const satisfies Record<ButtonVariant, string>;
```

### 2.5 ImageFrame — aspect 拡張 + hover 統一

```tsx
// 変更点:
// - aspect に "landscape" 追加
// - hover: scale-105 を group 連動で統一
// - fill prop 追加（Next.js Image fill モード）
type AspectRatio = "video" | "square" | "portrait" | "landscape" | "wide";

const aspectClasses = {
  video: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
  wide: "aspect-[2/1]",
} as const satisfies Record<AspectRatio, string>;

// hover scale は親の group クラスに連動
// <Image className="... transition-transform duration-500 group-hover:scale-105" />
```

### 2.6 Prose — blockquote セリフイタリック + drop-cap

```tsx
// 変更点:
// - blockquote にセリフイタリックスタイリング追加
// - variant prop 追加: "default" | "editorial"
// - editorial: drop-cap 適用
interface ProseProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly variant?: "default" | "editorial";
}

// editorial variant は .drop-cap クラス（public.css 定義済み）を適用
// blockquote: font-heading italic text-pullquote
```

### 2.7 Input/Select/Textarea — Editorial form style

```tsx
// 変更点（3コンポーネント共通）:
// - rounded-lg border 全周 → border-b のみ（Editorial Magazine トーン）
// - focus: ring → border-accent + subtle shadow
// - bg-background → bg-transparent（フォーム背景に溶け込む）
// - ラベル: text-sm font-medium → text-xs uppercase tracking-wide text-muted-foreground

// Input の例:
<input
  className={`w-full min-h-11 border-0 border-b bg-transparent px-0 py-3 text-foreground transition-colors
    placeholder:text-muted-foreground/60
    focus-visible:outline-none focus-visible:border-accent
    disabled:opacity-50 disabled:cursor-not-allowed
    ${error ? "border-destructive" : "border-border"}`}
/>

// Label の例:
<label className="block text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
```

**破壊的変更**: フォーム全体の外観が大幅に変わる。全フォームで統一。

### 2.8 Badge — 微調整のみ

変更なし。現行の実装は Editorial Magazine トーンに適合。

### 2.9 SectionLabel — 変更なし

現行の gold-line パターンは Editorial Magazine のトーンに適合済み。

---

### 2.10 新規: Section

```tsx
// セクション共通ラッパー。Server Component。
interface SectionProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly background?: "default" | "surface" | "surface-alt";
  readonly border?: "none" | "top" | "accent"; // 上部ボーダー
  readonly spacing?: "default" | "compact" | "none";
  readonly id?: string;
}

// background: default → bg-background, surface → bg-surface, surface-alt → bg-surface-alt
// spacing: default → py-[var(--spacing-section)], compact → py-[var(--spacing-block)]
// border: top → border-t border-border, accent → border-t-2 border-accent
```

### 2.11 新規: PageLayout

```tsx
// ページカテゴリ別テンプレート。Server Component。
type PageLayoutVariant = "content" | "form" | "dashboard";

interface PageLayoutProps {
  readonly variant: PageLayoutVariant;
  readonly children: ReactNode;
  readonly hero?: ReactNode; // content/form 用
  readonly cta?: ReactNode; // content 用
}

// content:   <hero> → <main>{children}</main> → <cta>
// form:      <hero compact> → <main className="max-w-2xl mx-auto">{children}</main>
// dashboard: <Container><main>{children}</main></Container>
```

### 2.12 新規: EditorialCard

```tsx
// Magazine-style card。Server Component。@container 対応。
interface EditorialCardProps {
  readonly title: string;
  readonly description?: string;
  readonly image?: {
    readonly src: string;
    readonly alt: string;
  };
  readonly meta?: ReactNode; // 日付、カテゴリ等
  readonly href: string;
  readonly variant?: "default" | "featured"; // featured: 大きな画像 + 横並び
  readonly className?: string;
}

// default: 縦積み（image → meta → title → description）
// featured: 横並び（5:4 image left + text right）、md breakpoint で切替
// hover: group-hover:shadow-lg + image group-hover:scale-105
// image: aspect-[4/3] default, aspect-[3/4] featured
```

### 2.13 新規: Divider

```tsx
// 装飾的区切り線。Server Component。
interface DividerProps {
  readonly variant?: "subtle" | "accent" | "fade";
  readonly className?: string;
}

// subtle: border-t border-border
// accent: border-t-2 border-accent（幅 4rem、中央寄せ）
// fade: background gradient（transparent → border → transparent）
```

---

## Phase 3: 共通レイアウトパターン

### 3.1 PageHero 再設計

現行の PageHero はホームページの Editorial Hero と大きく異なる。統一する:

```tsx
// variant を再定義
type PageHeroVariant = "editorial" | "compact" | "minimal";

// editorial: 雑誌カバー風スプリット（左画像 + 右テキスト）。ホームページ Hero と同一パターン
// compact: bg-surface + breadcrumb + heading（現行 compact 改良）
// minimal: heading のみ（bg-transparent、breadcrumb なし）

// editorial variant:
// - min-h-[60vh]（ホームページは 85vh だが他ページは控えめ）
// - grid grid-cols-1 md:grid-cols-[5fr_4fr]
// - 右側: SectionLabel + Heading + description

// compact variant:
// - ScrollReveal でフェードイン
// - py-[var(--spacing-block)]

// minimal variant:
// - py-12（ダッシュボード用、最小限）
```

### 3.2 SiteCTA 共通化

ホームページの CTA セクションを共通コンポーネントとして抽出:

```tsx
// 全 content ページの末尾に配置
// bg-foreground text-background（ダークコントラスト）
// SectionLabel + Heading(serif italic) + Button(editorial)
// ScrollReveal で入場
```

### 3.3 アニメーション統一戦略

| ページカテゴリ | ScrollReveal       | SplitText         | ParallaxImage   |
| -------------- | ------------------ | ----------------- | --------------- |
| content        | セクション入場時   | Hero heading のみ | Hero image のみ |
| form           | フォームカード入場 | なし              | なし            |
| dashboard      | なし               | なし              | なし            |

- content ページ: 各セクションを `<ScrollReveal>` でラップ。stagger delay は `0.1` 刻み
- form ページ: フォーム全体を1つの `<ScrollReveal>` で。軽量に
- dashboard ページ: アニメーションなし。機能優先

---

## Phase 4: ページ別実装仕様

### 4.1 Content Pages

#### About (`/about`)

- PageLayout variant="content"
- PageHero variant="editorial" with image
- セクションベース（SectionRenderer）は維持。Section コンポーネントでラップ
- 各セクション間で background 交互パターン（default ↔ surface）

#### Spaces 一覧 (`/spaces`)

- PageLayout variant="content"
- PageHero variant="compact" with breadcrumb
- FilterBar: 現行維持（機能的）
- SpaceGrid: EditorialCard に置換。featured（最初の1件）+ default（残り）
- @container でレスポンシブ

#### Space 詳細 (`/spaces/[slug]`)

- PageLayout variant="content"
- PageHero variant="compact"
- 2カラム: main(1fr) + sidebar(380px) — 現行維持（既にアライン済み）
- サイドバー: sticky + ScrollReveal
- 画像ギャラリー: ImageFrame landscape + portrait 交互

#### Journal (`/journal`)

- PageLayout variant="content"
- PageHero variant="compact"
- タブ UI 維持
- 記事カード: EditorialCard（featured 1件 + default grid）

#### News/Post 詳細 (`/news/[slug]`, `/posts/[...segments]`)

- PageLayout variant="content"
- Container variant="editorial"（65ch）
- Prose variant="editorial"（drop-cap、セリフ blockquote）
- 関連記事: EditorialCard default × 3

#### Events 一覧 (`/events`)

- PageLayout variant="content"
- PageHero variant="compact"
- FullCalendar: Section コンポーネントでラップ。背景 surface
- 近日のイベント: EditorialCard grid

#### Event 詳細 (`/events/[slug]`)

- PageLayout variant="content"
- PageHero variant="compact"
- Container variant="editorial"
- 情報カード: bg-surface rounded-lg border — Section で統一
- 登録フォーム: Editorial form style

#### FAQ (`/faq`)

- PageLayout variant="content"
- PageHero variant="compact"
- Container variant="narrow"
- アコーディオン: ScrollReveal stagger で入場
- 各 FAQ item に editorial-border-top

#### Privacy / Terms

- PageLayout variant="content"
- SectionRenderer ベース（維持）
- Section コンポーネントでラップ

### 4.2 Form Pages

#### Contact (`/contact`)

- PageLayout variant="form"
- PageHero variant="compact"
- 2カラム: form + sidebar info（現行維持、既にアライン済み）
- フォーム: Editorial form style（border-bottom inputs）
- サイドバー: ScrollReveal

#### Reservation (`/reservation`)

- PageLayout variant="form"
- PageHero variant="compact"
- 3ステップウィザード: 各ステップのフォームを Editorial form style に
- StepIndicator: 現行維持
- ステップカード: bg-surface rounded-lg に統一

#### Login (`/login`)

- PageLayout variant="form"
- PageHero variant="minimal"
- Container variant="narrow"
- Editorial form style
- ソーシャルボタン: border style（editorial variant）

#### Forgot/Reset Password

- Login と同一パターン

### 4.3 Dashboard Pages (Mypage)

#### Mypage Top (`/mypage`)

- PageLayout variant="dashboard"
- Heading level={1} + accent
- 予約リスト: EditorialCard default
- アラート: 現行維持（accent border）

#### Mypage サブページ

- PageLayout variant="dashboard" 共通
- Heading level={1}
- コンテンツ: Section + Stack で構造化
- フォーム（設定等）: Editorial form style

---

## Phase 5: Shared Layout 改修

### site-header.tsx

- 現行は Editorial Magazine アライン済み。変更なし

### site-footer.tsx

- 現行はアライン済み。変更なし

### breadcrumb.tsx

- 現行はアライン済み。テキストサイズ・スタイルを SectionLabel のトーンに合わせて微調整
- `text-xs uppercase tracking-[0.1em]`

### scroll-indicator.tsx

- 現行維持

### mobile-nav

- 現行維持

---

## Phase 6: 削除対象

| 対象                                                    | 理由                 |
| ------------------------------------------------------- | -------------------- |
| PageHero の旧 "full" variant                            | editorial に置換     |
| Input/Select/Textarea の rounded-lg border 全周スタイル | border-bottom に統一 |
| Heading の H3/H4 serif フォント                         | sans に変更          |
| Stack の旧 gap 値                                       | 拡張済みの値に統一   |
| 使われていない旧パターンの CSS                          | クリーンアップ       |

---

## 影響範囲

### 全ページに影響する変更

1. **Heading H3/H4**: serif → sans
2. **Stack gap**: 全サイズ拡大
3. **Input/Select/Textarea**: border-bottom style
4. **Section ラッパー追加**: 既存のセクションを Section でラップ

### 新規追加

1. Section, PageLayout, EditorialCard, Divider（4 Primitives）
2. Button editorial variant
3. Container editorial variant
4. Heading accent prop
5. ImageFrame landscape aspect + fill prop
6. Prose editorial variant
7. PageHero editorial/minimal variants
8. SiteCTA 共通コンポーネント

### ファイル数見積もり

- 新規: ~10 ファイル
- 改修: ~30 ファイル（Primitives 10 + ページ 20）
- 削除: ~0（破壊的変更は in-place 修正）

---

## テスト戦略

- 型チェック: `bun run type-check`（全変更後）
- リント: `bun run lint`（全変更後）
- ビルド: `bun run build`（最終検証）
- ビジュアル: Playwright MCP でスクリーンショット比較（主要ページ）
- a11y: accessibility-reviewer エージェント
- デザイン一貫性: editorial-consistency-reviewer エージェント

## 実装順序（推奨）

1. CSS テーマ拡張（public.css）
2. Primitives 新規作成（Section, PageLayout, EditorialCard, Divider）
3. Primitives 改修（Heading, Stack, Button, ImageFrame, Prose, Container）
4. Form Primitives 改修（Input, Select, Textarea）
5. PageHero 再設計 + SiteCTA 抽出
6. Content pages 適用（About → Spaces → Journal → Events → FAQ → Privacy/Terms）
7. Form pages 適用（Contact → Reservation → Login → Password系）
8. Dashboard pages 適用（Mypage 全ページ）
9. breadcrumb 微調整
10. 全体検証 + レビュー
