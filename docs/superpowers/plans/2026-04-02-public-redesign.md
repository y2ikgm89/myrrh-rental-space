# 公開ページデザイン大幅刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開ページを「Deep Neutral ライトテーマ」から「Warm Dark × Bronze ラグジュアリーテーマ」へ全面刷新する

**Architecture:** トークン・ファースト — @theme CSS変数を一括差し替えして全コンポーネントを一斉ダーク化、その後にコンポーネント個別の磨き上げ・モーション強化・ページ統合を行う。既存の SectionRenderer / SectionWrapper / Dynamic Section Architecture は維持。

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4 (CSS-first), GSAP + ScrollTrigger, Cormorant Garamond (Google Fonts), OKLCH colors

**Spec:** `docs/superpowers/specs/2026-04-02-public-redesign-design.md`

---

## Phase 1: トークン基盤（全体ダーク化）

### Task 1: @theme カラートークン差し替え

**Files:**

- Modify: `src/app/(public)/_styles/public.css:12-114` (@theme ブロック)

- [ ] **Step 1: @theme ブロックのカラートークンを差し替え**

`public.css` の `@theme` ブロック内のカラー定義を以下に置換:

```css
/* === Colors === */
--color-background: oklch(0.15 0.01 60);
--color-surface: oklch(0.2 0.015 60);
--color-surface-light: oklch(0.25 0.02 60);
--color-foreground: oklch(0.9 0.02 70);
--color-muted-foreground: oklch(0.6 0.02 60);
--color-border: oklch(0.3 0.02 60);
--color-accent: oklch(0.65 0.09 60);
--color-accent-light: oklch(0.72 0.08 60);
--color-overlay: oklch(0.08 0.01 60 / 0.7);
```

ステータスカラーをダーク背景最適化（コントラスト比 4.5:1 以上）:

```css
--color-success: oklch(0.72 0.15 145);
--color-warning: oklch(0.78 0.12 85);
--color-destructive: oklch(0.7 0.18 25);
--color-info: oklch(0.72 0.12 250);
```

シャドウを強化:

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.35);
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.4);
--shadow-card: 0 2px 8px rgba(0, 0, 0, 0.3);
```

- [ ] **Step 2: スペーシングトークン更新**

セクション間paddingを拡大（贅沢な余白）:

```css
--spacing-section: clamp(6rem, 10vw, 9rem);
```

border-radius をソフトに:

```css
--radius-lg: 1rem;
```

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS（CSS変数の値変更のみなので型エラーなし）

- [ ] **Step 4: コミット**

```bash
git add src/app/(public)/_styles/public.css
git commit -m "style: swap color tokens to Warm Dark × Bronze theme"
```

---

### Task 2: @layer compat 削除 + 旧トークン除去

**Files:**

- Modify: `src/app/(public)/_styles/public.css:202-239` (@layer compat)

- [ ] **Step 1: @layer compat ブロック全体を削除**

`public.css` から `@layer compat { ... }` ブロック（約 L202-239）を完全削除。

- [ ] **Step 2: 旧トークン参照の検索・除去**

Run: 以下のトークンがコード内で参照されていないか確認

```
--color-primary
--color-brand-primary
--color-brand-secondary
--color-brand-accent
```

Grep で検出した参照があれば、新トークン名（`--color-accent` 等）に置換。

- [ ] **Step 3: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add src/app/(public)/_styles/public.css
git commit -m "refactor: remove @layer compat and legacy token names"
```

---

### Task 3: フォント差し替え（Noto Serif JP → Cormorant Garamond）

**Files:**

- Modify: `src/app/(public)/layout.tsx:60-70` (フォント読み込み)
- Modify: `src/app/(public)/_styles/public.css` (--font-serif)

- [ ] **Step 1: layout.tsx のフォント import を変更**

```typescript
// 削除:
import { Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";
// 追加:
import { Cormorant_Garamond, Noto_Sans_JP } from "next/font/google";
```

フォント定義を変更:

```typescript
const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant-garamond",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});
```

Note: Noto Sans JP に weight "300" を追加（Body Light 用）。

- [ ] **Step 2: body className を更新**

layout.tsx 内の className 適用箇所を変更:

```typescript
// 旧:
className={`${notoSansJP.variable} ${notoSerifJP.variable} font-sans antialiased`}
// 新:
className={`${notoSansJP.variable} ${cormorantGaramond.variable} font-sans antialiased`}
```

`notoSerifJP` 変数への参照をすべて削除。

- [ ] **Step 3: public.css の --font-serif を更新**

```css
--font-serif: "Cormorant Garamond", "Noto Sans JP", serif;
```

`--font-serif` の fallback に `"Noto Sans JP"` を入れることで、Cormorant Garamond にない日本語グリフが Noto Sans JP にフォールバックする。

- [ ] **Step 4: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/app/(public)/layout.tsx src/app/(public)/_styles/public.css
git commit -m "style: replace Noto Serif JP with Cormorant Garamond"
```

---

### Task 4: project-design-config.md / anti-ai-design.md 更新

**Files:**

- Modify: `.claude/rules/frontend/project-design-config.md`
- Modify: `.claude/rules/frontend/anti-ai-design.md`

- [ ] **Step 1: project-design-config.md を Warm Dark × Bronze に更新**

カラーパレットセクションを以下に変更:

```markdown
### カラーパレット

OKLCH形式。Warm Dark × Bronze。

| ロール   | 配分 | 値                                  | メモ                            |
| -------- | ---- | ----------------------------------- | ------------------------------- |
| Dominant | 70 % | `oklch(0.15 0.01 60)` Dark Brown    | ページ背景                      |
| Support  | 20 % | `oklch(0.20 0.015 60)` Dark Surface | カード・セクション背景          |
| Accent   | 10 % | `oklch(0.65 0.09 60)` Bronze        | ラベル・CTA・価格のみ（≤ 15 %） |
```

タイポグラフィセクション:

```markdown
### タイポグラフィ

- Serif heading: Cormorant Garamond（欧文 Hero/H1/H2）
- Sans body: Noto Sans JP（日本語全般、H3以下、UI）
- Fallback: Cormorant Garamond → Noto Sans JP → serif（日本語グリフ自動フォールバック）
```

ブランドトーンを更新:

```markdown
### ブランド

Myrrh Rental Space — luxury-warm + premium dark

没薬（Myrrh）の温もり・希少性を体現する、ウォームダークのラグジュアリーデザイン。
```

- [ ] **Step 2: anti-ai-design.md を確認・更新**

セルフレビュー6問は既にダークテーマに適合するため、以下のみ修正:

- 「Accent 控えめ ≤ 15%」→ 維持（ブロンズも同ルール）
- 禁止パターンの「全面グラデーション」→ 「ダークグラデーションの過剰使用」に微修正

- [ ] **Step 3: コミット**

```bash
git add .claude/rules/frontend/project-design-config.md .claude/rules/frontend/anti-ai-design.md
git commit -m "docs: update design rules for Warm Dark × Bronze theme"
```

---

### Task 5: Phase 1 検証 — ビルド + 目視確認

**Files:** なし（検証のみ）

- [ ] **Step 1: validate + build**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 2: dev サーバーで目視確認**

Run: `bun dev`

確認ポイント:

- 全ページがダークブラウン背景に変わっていること
- テキストが明るい暖色で読めること
- アクセント（ブロンズ）がCTA/ラベルに適用されていること
- 見出しが Cormorant Garamond（欧文）で表示されること
- 日本語テキストが Noto Sans JP にフォールバックしていること

---

## Phase 2: Header / Footer / Primitives

### Task 6: Header ダークテーマ対応

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/site-header.tsx`

- [ ] **Step 1: ヘッダー背景スタイルを更新**

site-header.tsx 内のスクロール時背景スタイルを変更。

透明状態（top）:

```
background: transparent → linear-gradient(180deg, oklch(0.15 0.01 60 / 0.6) 0%, transparent 100%)
```

スクロール後:

```
background: oklch(0.15 0.01 60 / 0.95)
backdrop-filter: blur(12px)
border-bottom: 1px solid oklch(0.30 0.02 60)
```

具体的には、ヘッダーの背景切り替えロジック（scroll threshold 80px 付近）で適用される className/style を上記に変更。既存の `backgroundMode` prop の `"transparent"` / `"solid"` に対応するスタイルを両方ダーク化。

- [ ] **Step 2: テキストカラーをダーク対応に**

ナビリンクのテキスト色: `text-foreground` / `text-muted-foreground` はトークン経由で自動適用されるが、ハードコードされた色があれば `text-foreground` に統一。

ロゴテキスト: Cormorant Garamond + letter-spacing: 0.12em + `text-foreground`

- [ ] **Step 3: スクロール時 CTA ボタン出現**

ヘッダー右端のナビゲーション末尾に、スクロール時のみ表示される予約CTAを追加:

```tsx
{
  isScrolled && (
    <Link
      href="/reservation"
      className="border border-accent text-accent rounded-full px-4 py-1.5 text-sm tracking-wide transition-opacity duration-300"
    >
      ご予約
    </Link>
  );
}
```

`isScrolled` は既存のスクロール検知ロジック（threshold 80px）を利用。

- [ ] **Step 4: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(public)/_shared/components/layouts/site-header.tsx'
git commit -m "style: update header to dark theme with scroll CTA"
```

---

### Task 7: Footer ダークテーマ対応

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/site-footer.tsx`

- [ ] **Step 1: フッター背景・ボーダーを更新**

フッターのルート要素のスタイル:

- 背景: `bg-surface`（ダークサーフェス、トークン経由で自動適用）
- 上部ボーダー: `border-t border-border`（トークン経由で自動適用）

ハードコードされた色がある場合はトークンクラスに置換。

- [ ] **Step 2: テキスト色のダーク対応確認**

- メインテキスト: `text-foreground`
- 補助テキスト: `text-muted-foreground`
- リンク: `text-accent hover:text-accent-light`

- [ ] **Step 3: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/_shared/components/layouts/site-footer.tsx'
git commit -m "style: update footer to dark theme"
```

---

### Task 8: Button — Bronze Shimmer エフェクト追加

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/button.tsx`
- Modify: `src/app/(public)/_styles/public.css` (keyframes追加)

- [ ] **Step 1: public.css に Bronze Shimmer keyframes を追加**

`@theme` ブロックの下の `@keyframes` セクション（または `@layer utilities`）に追加:

```css
@keyframes bronze-shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}
```

- [ ] **Step 2: Button の primary variant に shimmer を適用**

button.tsx の `variantClasses` の `primary` にホバー時のシマー効果を追加:

```typescript
const variantClasses = {
  primary: [
    "bg-accent text-background font-medium",
    "relative overflow-hidden",
    "before:absolute before:inset-0",
    "before:bg-[linear-gradient(105deg,transparent_40%,oklch(0.90_0.02_70/0.15)_50%,transparent_60%)]",
    "before:bg-[length:200%_100%]",
    "before:opacity-0 hover:before:opacity-100",
    "before:animate-[bronze-shimmer_0.6s_ease-out]",
    "before:pointer-events-none",
    "hover:bg-accent-light",
    "transition-colors duration-300",
  ].join(" "),
  secondary:
    "border border-border text-foreground hover:bg-surface-light transition-colors duration-300",
  ghost:
    "text-foreground hover:bg-surface-light transition-colors duration-300",
  link: "text-accent underline-offset-4 hover:underline hover:text-accent-light transition-colors duration-300",
} satisfies Record<Variant, string>;
```

- [ ] **Step 3: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/_shared/components/design-system/button.tsx' src/app/(public)/_styles/public.css
git commit -m "style: add Bronze Shimmer effect to primary Button"
```

---

### Task 9: Input / Select / Prose ダーク対応

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/input.tsx`
- Modify: `src/app/(public)/_shared/components/design-system/select.tsx`
- Modify: `src/app/(public)/_shared/components/design-system/prose.tsx`

- [ ] **Step 1: Input のダーク背景対応**

input.tsx のインプット要素のクラスを更新:

```typescript
const inputClasses = cn(
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground",
  "placeholder:text-muted-foreground",
  "min-h-11",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent",
  error && "border-destructive",
  className,
);
```

変更点: `bg-background` → `bg-surface`（フォーム入力はサーフェスカラーで背景から浮かせる）。

- [ ] **Step 2: Select のダーク背景対応**

select.tsx も同様に `bg-surface` を適用。

- [ ] **Step 3: Prose のダーク対応**

prose.tsx のクラスを更新:

```typescript
className={cn(
  "prose prose-invert max-w-[65ch]",
  "prose-a:text-accent prose-a:no-underline hover:prose-a:text-accent-light",
  "prose-code:bg-surface prose-code:text-foreground",
  "prose-blockquote:border-accent",
  "leading-[var(--leading-normal)]",
  className,
)}
```

変更点: `prose-neutral` → `prose-invert`（ダークテーマ用）。リンク色をブロンズに。

- [ ] **Step 4: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(public)/_shared/components/design-system/input.tsx' 'src/app/(public)/_shared/components/design-system/select.tsx' 'src/app/(public)/_shared/components/design-system/prose.tsx'
git commit -m "style: adapt Input, Select, Prose for dark theme"
```

---

### Task 10: SectionWrapper ダーク背景マップ更新

**Files:**

- Modify: `src/app/(public)/_shared/components/sections/SectionWrapper.tsx`

- [ ] **Step 1: backgroundMap を更新**

SectionWrapper.tsx の `backgroundMap` をダークテーマに最適化:

```typescript
const backgroundMap = {
  default: "",
  surface: "bg-surface",
  accent: "bg-accent/10",
  primary: "bg-accent/5",
  dark: "bg-[oklch(0.10_0.01_60)]",
  image: "bg-cover bg-center bg-no-repeat",
  gradient: "bg-gradient-to-b from-surface to-background",
} satisfies Record<string, string>;
```

変更点: `dark` variant を超ダーク（background よりさらに暗い）に。`accent`/`primary` を微量の暖色オーバーレイに。

- [ ] **Step 2: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_shared/components/sections/SectionWrapper.tsx'
git commit -m "style: update SectionWrapper background map for dark theme"
```

---

### Task 11: Phase 2 検証 — ビルド + 目視確認

**Files:** なし

- [ ] **Step 1: validate + build**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 2: dev サーバーで目視確認**

確認ポイント:

- Header: 透明→ダーク遷移、スクロール時CTA出現
- Footer: ダークサーフェス背景
- Button primary: ホバー時 Bronze Shimmer
- Input/Select: ダーク背景のフォーム
- セクション背景の交互切替

---

## Phase 3: コアセクション刷新

### Task 12: Hero セクション — フルスクリーン + Image Reveal

**Files:**

- Modify: `src/app/(public)/_shared/components/sections/standard/hero/HeroSection.tsx`（または該当ファイル）

- [ ] **Step 1: Hero セクションのファイル特定と読み込み**

```bash
find src/app/(public)/_shared/components/sections -name "*ero*" -o -name "*hero*" | head -20
```

ファイルを読み、現在の実装を確認。

- [ ] **Step 2: Hero レイアウトをフルスクリーンダークに変更**

Hero セクションの主要な変更:

- 高さ: `min-h-screen`（フルスクリーン）
- 背景画像: オーバーレイを `oklch(0.08 0.01 60 / 0.6)` に変更（ウォームダークオーバーレイ）
- テキスト配置: 中央配置、`text-foreground`
- セクションラベル: ブロンズライン + 大文字レタースペーシング

- [ ] **Step 3: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/_shared/components/sections/'
git commit -m "style: redesign Hero section for dark luxury theme"
```

---

### Task 13: スペースカード / リストセクション刷新

**Files:**

- Modify: スペース一覧/スペースショーケース関連のセクションコンポーネント

- [ ] **Step 1: スペースカードのダーク化**

スペースカードの変更:

- カード背景: `bg-surface` + `border border-border`
- 画像: `rounded-xl overflow-hidden`
- ホバー: `hover:border-accent/30 hover:shadow-lg transition-all duration-300`
- 画像ホバー: `group-hover:scale-105 transition-transform duration-500`
- テキスト: `text-foreground` / `text-muted-foreground`
- 価格: `text-accent font-medium`

- [ ] **Step 2: validate + コミット**

Run: `bun run validate`

```bash
git add 'src/app/(public)/_shared/components/sections/'
git commit -m "style: redesign space cards for dark theme"
```

---

### Task 14: CTA / Concept / Features セクション刷新

**Files:**

- Modify: CTA / Concept / Features 関連セクションコンポーネント

- [ ] **Step 1: CTA セクション**

- 背景: `bg-gradient-to-br from-surface to-background`
- テキスト: `text-foreground` + セリフ見出し
- ボタン: primary variant（Bronze Shimmer 自動適用）

- [ ] **Step 2: Concept セクション**

- 2カラム: テキスト + 画像（非対称配置維持）
- 画像: `rounded-xl` + subtle shadow
- テキスト: 見出しセリフ + 本文サンセリフ

- [ ] **Step 3: Features セクション**

- アイコン/特徴カード: `bg-surface border border-border rounded-xl`
- アイコン色: `text-accent`
- ホバー: `hover:border-accent/30`

- [ ] **Step 4: validate + コミット**

Run: `bun run validate`

```bash
git add 'src/app/(public)/_shared/components/sections/'
git commit -m "style: redesign CTA, Concept, Features sections for dark theme"
```

---

### Task 15: 残りセクション一括ダーク対応

**Files:**

- Modify: 残りの全セクションコンポーネント

- [ ] **Step 1: 対象セクション確認**

残りのセクション:

- `gallery` — 画像グリッド
- `news-list` — ニュース一覧
- `post-list` — 記事一覧
- `faq-list` — FAQ アコーディオン
- `testimonial` — お客様の声
- `contact-form` — お問い合わせフォーム
- `map` — Google Map
- `event-calendar` — イベントカレンダー
- `embed` — カスタムHTML
- `custom` — Lexical コンテンツ
- `instagram` — Instagram フィード

- [ ] **Step 2: 共通パターン適用**

全セクションに以下の共通ダーク化パターンを適用:

- ハードコードされた `bg-white` → `bg-background`
- ハードコードされた `text-gray-*` → `text-foreground` / `text-muted-foreground`
- カード要素: `bg-surface border border-border rounded-xl`
- リンク色: `text-accent hover:text-accent-light`
- 区切り線: `border-border`

- [ ] **Step 3: FAQ アコーディオンのダーク対応**

アコーディオンのボーダー・背景・展開アイコン色をトークンに統一。

- [ ] **Step 4: react-day-picker（カレンダー）のダーク対応**

`public.css` の react-day-picker スタイル（L334-537）のカラーをトークン変数に差し替え。

- [ ] **Step 5: validate + コミット**

Run: `bun run validate`

```bash
git add 'src/app/(public)/' src/app/(public)/_styles/public.css
git commit -m "style: dark theme adaptation for all remaining sections"
```

---

### Task 16: 個別ページのダーク対応（スペース詳細・予約・認証・法的）

**Files:**

- Modify: スペース詳細ページコンポーネント
- Modify: 予約ページコンポーネント
- Modify: ログイン/認証ページ
- Modify: 利用規約/プライバシーページ

- [ ] **Step 1: スペース詳細ページ**

- フルブリード画像ヘッダー: ウォームダークオーバーレイ
- 詳細情報: `bg-surface` カード
- 料金表: `text-accent` 強調
- レビューセクション: ダークカード

- [ ] **Step 2: 予約ページ**

- ステッパーUI: `border-accent` アクティブステップ
- フォーム: `bg-surface` 入力フィールド（Task 9 の Input 適用）
- 確認画面: ダークカードレイアウト

- [ ] **Step 3: 認証・法的ページ**

- ログイン: ダーク背景 + ソーシャルボタン
- 規約/プライバシー: Prose (prose-invert) 適用

- [ ] **Step 4: validate + build**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(public)/'
git commit -m "style: dark theme for detail, reservation, auth, and legal pages"
```

---

## Phase 4: モーション強化

### Task 17: animations.ts 定数追加

**Files:**

- Modify: `src/app/(public)/_shared/lib/animations.ts`

- [ ] **Step 1: 新規アニメーション定数を追加**

```typescript
export const REVEAL = {
  /** Image clip-path reveal */
  clipPath: {
    from: "inset(0 100% 0 0)",
    to: "inset(0 0% 0 0)",
  },
  /** Scroll-triggered fade up */
  fadeUp: {
    y: 40,
    opacity: 0,
  },
} as const;

export const MAGNETIC = {
  strength: 0.3,
  ease: "elastic.out(1, 0.3)",
} as const;
```

- [ ] **Step 2: validate + コミット**

Run: `bun run validate`

```bash
git add 'src/app/(public)/_shared/lib/animations.ts'
git commit -m "feat: add REVEAL and MAGNETIC animation constants"
```

---

### Task 18: Image Reveal コンポーネント実装

**Files:**

- Create: `src/app/(public)/_shared/components/animations/ImageReveal.tsx`

- [ ] **Step 1: ImageReveal コンポーネント作成**

```tsx
"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DURATION, EASE, REVEAL, SCROLL_TRIGGER } from "../lib/animations";

gsap.registerPlugin(ScrollTrigger);

interface ImageRevealProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly direction?: "left" | "right" | "top" | "bottom";
}

export function ImageReveal({
  children,
  className,
  direction = "left",
}: ImageRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const clipPaths = {
    left: { from: "inset(0 100% 0 0)", to: "inset(0 0% 0 0)" },
    right: { from: "inset(0 0 0 100%)", to: "inset(0 0 0 0%)" },
    top: { from: "inset(100% 0 0 0)", to: "inset(0% 0 0 0)" },
    bottom: { from: "inset(0 0 100% 0)", to: "inset(0 0 0% 0)" },
  } as const;

  useGSAP(
    () => {
      const el = containerRef.current;
      if (!el) return;

      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          el,
          { clipPath: clipPaths[direction].from },
          {
            clipPath: clipPaths[direction].to,
            duration: DURATION.hero,
            ease: EASE.outCubic,
            scrollTrigger: {
              trigger: el,
              ...SCROLL_TRIGGER.reveal,
            },
          },
        );
      });
    },
    { scope: containerRef },
  );

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: validate + コミット**

Run: `bun run validate`

```bash
git add 'src/app/(public)/_shared/components/animations/ImageReveal.tsx'
git commit -m "feat: add ImageReveal scroll animation component"
```

---

### Task 19: Hero セクションにモーション統合

**Files:**

- Modify: Hero セクションコンポーネント

- [ ] **Step 1: Hero に SplitText + ImageReveal を統合**

Hero セクションに以下のモーション要素を追加:

- 見出し: SplitText（既存のものがあれば活用、なければ GSAP SplitText で文字分割 stagger）
- 背景画像: ParallaxImage（既存パターン活用、speed: 0.3）
- サブテキスト: ScrollReveal（y:40 + opacity）

実装は既存の GSAP パターン（useGSAP + gsap.matchMedia + prefers-reduced-motion ガード）を踏襲。

- [ ] **Step 2: validate + コミット**

Run: `bun run validate`

```bash
git add 'src/app/(public)/_shared/components/sections/'
git commit -m "feat: integrate SplitText and ImageReveal into Hero section"
```

---

### Task 20: カードセクションにモーション追加

**Files:**

- Modify: スペースカード / ニュースカード等のリスト系セクション

- [ ] **Step 1: Card Stagger 演出を追加**

リスト系セクション（space-list, news-list, post-list 等）のカード群に stagger 入場を追加:

```typescript
useGSAP(
  () => {
    gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
      const cards = containerRef.current?.querySelectorAll("[data-card]");
      if (!cards?.length) return;

      gsap.from(cards, {
        y: REVEAL.fadeUp.y,
        opacity: REVEAL.fadeUp.opacity,
        duration: DURATION.slow,
        stagger: STAGGER.card,
        ease: EASE.outQuad,
        scrollTrigger: {
          trigger: containerRef.current,
          ...SCROLL_TRIGGER.reveal,
        },
      });
    });
  },
  { scope: containerRef },
);
```

各カード要素に `data-card` 属性を追加。

- [ ] **Step 2: validate + コミット**

Run: `bun run validate`

```bash
git add 'src/app/(public)/_shared/components/sections/'
git commit -m "feat: add card stagger animation to list sections"
```

---

### Task 21: Phase 4 検証

**Files:** なし

- [ ] **Step 1: validate + build**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 2: dev サーバーで目視確認**

確認ポイント:

- Hero: SplitText 文字入場 + 背景パララックス
- 画像: ImageReveal clip-path 展開
- カード: stagger 入場
- Button: Bronze Shimmer ホバー
- prefers-reduced-motion: reduce でアニメーション無効化

---

## Phase 5: ページ統合（news+posts → journal）

### Task 22: Journal ページ新設

**Files:**

- Create: `src/app/(public)/journal/page.tsx`

- [ ] **Step 1: journal ページを作成**

news/page.tsx と posts/page.tsx を参考に、統合フィードページを作成:

```tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import { generatePageMetadata } from "@/shared/domain/pages/public-queries";
import { getPageSectionsWithFallback } from "@/shared/domain/pages/public-queries";
import { getPublishedNewsList } from "@/shared/domain/news/queries";
import { getPublishedPostsList } from "@/shared/domain/posts/queries";
import { SectionRenderer } from "../_shared/components/sections/SectionRenderer";
import { JournalContent } from "./_components/JournalContent";

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata("journal");
}

interface JournalPageProps {
  readonly searchParams: Promise<{
    page?: string;
    q?: string;
    tab?: string;
  }>;
}

export default async function JournalPage({ searchParams }: JournalPageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const search = params.q ?? "";
  const tab = params.tab ?? "all";

  const [sections, newsList, postsList] = await Promise.all([
    getPageSectionsWithFallback("journal"),
    getPublishedNewsList(page, 10, search),
    getPublishedPostsList(page, 10, search),
  ]);

  const heroSections = sections.filter(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) => s.type !== "hero" && s.type !== "hero-parallax",
  );

  return (
    <>
      {heroSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
      <Suspense>
        <JournalContent
          news={newsList}
          posts={postsList}
          currentTab={tab}
          currentPage={page}
          searchQuery={search}
        />
      </Suspense>
      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
```

- [ ] **Step 2: JournalContent コンポーネント作成**

Create: `src/app/(public)/journal/_components/JournalContent.tsx`

タブ切替（すべて / ニュース / コラム）で news + posts を日付順に混合表示するクライアントコンポーネント。nuqs でタブ状態を URL に反映。

既存の news/posts ページの SearchBar + リストコンポーネントのパターンを踏襲。

- [ ] **Step 3: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/journal/'
git commit -m "feat: add Journal page consolidating news and posts"
```

---

### Task 23: リダイレクト設定

**Files:**

- Modify: `next.config.ts`

- [ ] **Step 1: redirects 関数を追加**

next.config.ts に `redirects` を追加:

```typescript
async redirects() {
  return [
    {
      source: "/news",
      destination: "/journal?tab=news",
      permanent: true,
    },
    {
      source: "/posts",
      destination: "/journal?tab=posts",
      permanent: true,
    },
  ];
},
```

Note: `/news/[slug]` と `/posts/[...segments]` の詳細ページは維持（リダイレクトしない）。SEO 既存URL保全。

- [ ] **Step 2: validate + コミット**

Run: `bun run validate`

```bash
git add next.config.ts
git commit -m "feat: add 301 redirects from /news, /posts to /journal"
```

---

### Task 24: 旧ページ削除 + ナビゲーション更新

**Files:**

- Delete: `src/app/(public)/news/page.tsx`
- Delete: `src/app/(public)/posts/page.tsx`
- Note: 詳細ページ（`/news/[slug]`, `/posts/[...segments]`）は維持

- [ ] **Step 1: 旧一覧ページを削除**

news/page.tsx と posts/page.tsx を削除。詳細ページ（[slug], [...segments]）は残す。

- [ ] **Step 2: ナビゲーション更新**

DB の NavigationItem を管理画面から更新する必要がある旨を確認。フォールバックナビ（site-header.tsx の `FALLBACK_NAV`）に journal リンクがあることを確認、なければ追加。

- [ ] **Step 3: DEFAULT_PAGE_SECTIONS に journal エントリ追加**

`src/shared/lib/constants/default-page-sections.ts` に journal のデフォルトセクションを追加:

```typescript
journal: [
  {
    type: "hero",
    title: null,
    config: {},
    content: null,
    order: 0,
    isActive: true,
  },
],
```

- [ ] **Step 4: validate + build**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(public)/news/page.tsx' 'src/app/(public)/posts/page.tsx' 'src/app/(public)/journal/' 'src/app/(public)/_shared/components/layouts/site-header.tsx' src/shared/lib/constants/default-page-sections.ts
git commit -m "feat: complete journal consolidation, remove old news/posts list pages"
```

---

## Phase 6: 最終検証

### Task 25: 全体検証 + テスト

**Files:** なし

- [ ] **Step 1: validate + build**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 2: テスト実行**

Run: `bun run test`
Expected: 全テスト PASS（CSS変更でテストが壊れている場合は修正）

- [ ] **Step 3: anti-ai-design セルフレビュー**

6問チェック（3問以上 yes 必須）:

1. Serif/Sans 対比あるか? → Cormorant Garamond vs Noto Sans JP ✓
2. Accent ≤ 15%? → ブロンズはラベル・CTA・価格のみ ✓
3. セクション間でpadding変化あるか? → Hero vs 通常、背景交互切替 ✓
4. アニメーション主役/脇役差あるか? → SplitText/ScrollReveal/静止 ✓
5. カードhoverインタラクションあるか? → scale + shadow + border遷移 ✓
6. セクションラベル統一装飾あるか? → ブロンズライン + 大文字レタースペーシング ✓

- [ ] **Step 4: dev サーバーで全ページ目視確認**

全ページを巡回:

- `/` — ホーム
- `/spaces` — スペース一覧
- `/spaces/[slug]` — スペース詳細
- `/reservation` — 予約
- `/about` — 会社概要
- `/contact` — お問い合わせ
- `/events` — イベント
- `/journal` — ジャーナル（統合フィード）
- `/faq` — FAQ
- `/mypage` — マイページ
- `/login` — ログイン
- `/terms` — 利用規約

確認: ダークテーマ統一、ブロンズアクセント、Cormorant Garamond 見出し、モーション動作、レスポンシブ
