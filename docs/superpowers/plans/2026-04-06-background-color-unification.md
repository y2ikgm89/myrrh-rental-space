# Background Color Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開ページの背景色を Kinfolk/Cereal 準拠に統一。セクション交互配置を廃止し、全コンテンツを白背景、フッターのみ薄茶に。

**Architecture:** CSS トークン削除 → Section Primitive 簡素化 → SectionWrapper gradient 削除 → ホームページ/ページレベルの bg-surface 除去 → ドキュメント更新 → 検証

**Tech Stack:** Tailwind CSS 4 (@theme), Next.js 16, React 19

---

### Task 1: CSS トークン削除

**Files:**

- Modify: `src/app/(public)/_styles/public.css:18,29`

- [ ] **Step 1: `--color-surface-light` と `--color-surface-alt` を削除**

`public.css` の `@theme` ブロックから以下の 2 行を削除:

```css
--color-surface-light: oklch(0.97 0.008 60);
```

```css
--color-surface-alt: oklch(0.975 0.006 60);
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS（これらのトークンは CSS 変数で、TSの型には影響しない）

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/_styles/public.css
git commit -m "refactor(public): remove unused surface-light and surface-alt color tokens"
```

---

### Task 2: Section Primitive から surface-alt を削除

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/section.tsx`

- [ ] **Step 1: `surface-alt` variant を削除**

`section.tsx` を変更:

Before:

```tsx
type SectionBackground = "default" | "surface" | "surface-alt";
```

After:

```tsx
type SectionBackground = "default" | "surface";
```

Before:

```tsx
const bgClasses = {
  default: "bg-background",
  surface: "bg-surface",
  "surface-alt": "bg-surface-alt",
} as const satisfies Record<SectionBackground, string>;
```

After:

```tsx
const bgClasses = {
  default: "bg-background",
  surface: "bg-surface",
} as const satisfies Record<SectionBackground, string>;
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS（grep 確認で `surface-alt` の使用箇所は section.tsx 自体のみ）

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(public)/_shared/components/design-system/section.tsx'
git commit -m "refactor(design-system): remove surface-alt variant from Section primitive"
```

---

### Task 3: SectionWrapper から gradient variant を削除

**Files:**

- Modify: `src/app/(public)/_shared/components/sections/SectionWrapper.tsx:41`
- Modify: `src/shared/lib/validations/section-design.ts:207`

- [ ] **Step 1: SectionWrapper の backgroundMap から gradient を削除**

`SectionWrapper.tsx` を変更:

Before:

```tsx
const backgroundMap = {
  default: "",
  surface: "bg-surface",
  accent: "bg-accent/5",
  primary: "bg-accent/10",
  dark: "bg-foreground text-background",
  image: "bg-cover bg-center bg-no-repeat",
  gradient: "bg-gradient-to-b from-surface to-background",
} satisfies Record<NonNullable<SectionDesign["background"]>, string>;
```

After:

```tsx
const backgroundMap = {
  default: "",
  surface: "bg-surface",
  accent: "bg-accent/5",
  primary: "bg-accent/10",
  dark: "bg-foreground text-background",
  image: "bg-cover bg-center bg-no-repeat",
} satisfies Record<NonNullable<SectionDesign["background"]>, string>;
```

- [ ] **Step 2: section-design.ts の sectionBgValues から gradient を削除**

`src/shared/lib/validations/section-design.ts` を変更:

Before:

```typescript
const sectionBgValues = [
  "default",
  "surface",
  "accent",
  "primary",
  "dark",
  "image",
  "gradient",
] as const;
```

After:

```typescript
const sectionBgValues = [
  "default",
  "surface",
  "accent",
  "primary",
  "dark",
  "image",
] as const;
```

- [ ] **Step 3: gradient の残存参照がないことを確認**

Run: `grep -r "gradient" src/shared/lib/validations/section-design.ts src/app/(public)/_shared/components/sections/SectionWrapper.tsx`
Expected: 0 matches

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(public)/_shared/components/sections/SectionWrapper.tsx' src/shared/lib/validations/section-design.ts
git commit -m "refactor(sections): remove gradient background variant from SectionWrapper"
```

---

### Task 4: ホームページコンポーネントの bg-surface を除去

**Files:**

- Modify: `src/app/(public)/_components/homepage/how-it-works-section.tsx:69`
- Modify: `src/app/(public)/_components/homepage/features-section.tsx:49`
- Modify: `src/app/(public)/_components/homepage/hero-section.tsx:70`
- Modify: `src/app/(public)/_components/homepage/spaces-carousel.tsx:257`

- [ ] **Step 1: how-it-works-section.tsx の bg-surface を削除**

Before:

```tsx
    <section className="bg-surface px-4 py-[var(--spacing-section-compact)]">
```

After:

```tsx
    <section className="px-4 py-[var(--spacing-section-compact)]">
```

- [ ] **Step 2: features-section.tsx の bg-surface を削除**

Before:

```tsx
    <section className="bg-surface py-[var(--spacing-section-compact)]">
```

After:

```tsx
    <section className="py-[var(--spacing-section-compact)]">
```

- [ ] **Step 3: hero-section.tsx の bg-surface を bg-card に変更**

これは画像ロード前のプレースホルダ背景なので `bg-card` に変更（白だと画像境界が見えない）:

Before:

```tsx
      <div className="relative min-h-[50svh] overflow-hidden bg-surface md:min-h-0">
```

After:

```tsx
      <div className="relative min-h-[50svh] overflow-hidden bg-card md:min-h-0">
```

- [ ] **Step 4: spaces-carousel.tsx のプレースホルダ bg-surface を bg-card に変更**

Before:

```tsx
<div className="h-full w-full bg-surface" />
```

After:

```tsx
<div className="h-full w-full bg-card" />
```

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(public)/_components/homepage/how-it-works-section.tsx' 'src/app/(public)/_components/homepage/features-section.tsx' 'src/app/(public)/_components/homepage/hero-section.tsx' 'src/app/(public)/_components/homepage/spaces-carousel.tsx'
git commit -m "refactor(homepage): remove alternating bg-surface, use uniform white background"
```

---

### Task 5: ページレベルの bg-surface を除去

**Files:**

- Modify: `src/app/(public)/events/page.tsx:32`
- Modify: `src/app/(public)/_components/ConceptSection.tsx:130`

- [ ] **Step 1: events/page.tsx の Section background を default に変更**

Before:

```tsx
      <Section background="surface">
```

After:

```tsx
      <Section>
```

(`background` のデフォルトは `"default"` なので prop 自体を省略)

- [ ] **Step 2: ConceptSection.tsx のプレースホルダ bg-surface を bg-card に変更**

Before:

```tsx
<div className="h-full bg-surface" />
```

After:

```tsx
<div className="h-full bg-card" />
```

- [ ] **Step 3: 公開ページで bg-surface が残っている箇所を確認**

Run: `grep -rn "bg-surface" src/app/(public)/ --include="*.tsx" | grep -v "node_modules" | grep -v "_styles/" | grep -v "site-footer"`
Expected: フッター以外でセクション背景として使われている箇所がないこと。残るのは以下のような UI コントロール用途のみ:

- `image-carousel.tsx` — バッジオーバーレイ（`bg-surface/80`）
- `GallerySection.tsx` — ボタンオーバーレイ（`bg-surface/80`）
- `mypage/` — フォーム枠・空状態表示
- `events/[slug]/` — 情報カード枠（`bg-surface`, `bg-surface/50`）

これらは UI コントロールのためセクション背景とは別問題。変更不要。

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(public)/events/page.tsx' 'src/app/(public)/_components/ConceptSection.tsx'
git commit -m "refactor(public): remove bg-surface from events page and ConceptSection placeholder"
```

---

### Task 6: ドキュメント更新

**Files:**

- Modify: `.claude/rules/frontend/project-design-config.md:40`
- Modify: `.claude/rules/gotchas.md:115`

- [ ] **Step 1: project-design-config.md のホームページ背景と セクション分離の記述を更新**

`project-design-config.md` のセクション設計テーブル内、`Homepage 背景` 行を変更:

Before:

```
| Homepage 背景     | `bg-surface`（薄茶）と白を交互配置。surface → 白 → surface → 白                                   |
```

After:

```
| Homepage 背景     | 全セクション `bg-background`（白）統一。視覚変化は余白・タイポグラフィ・画像で確保                 |
```

同ファイルのセクション分離行を変更:

Before:

```
| セクション分離    | 薄いボーダー + 背景色切替（background ↔ surface）                                                 |
```

After:

```
| セクション分離    | 余白 `--spacing-section` + 必要時 `border-t border-border`。背景色切替は使わない                   |
```

- [ ] **Step 2: gotchas.md の交互配置エントリを削除**

gotchas.md から以下の行を削除:

```
- **ホームページセクションは背景色を交互配置** — `bg-surface`（薄茶）と白を交互に。HowItWorks=surface → Spaces=白 → Features=surface → CTA=白。新セクション追加時も交互パターンを維持する
```

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/frontend/project-design-config.md .claude/rules/gotchas.md
git commit -m "docs: update design config and gotchas for unified white background"
```

---

### Task 7: 検証

**Files:** None (verification only)

- [ ] **Step 1: validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 2: build**

Run: `bun run build`
Expected: PASS（未使用の CSS 変数削除によるビルドエラーがないことを確認）

- [ ] **Step 3: 残存チェック — surface-alt / surface-light の参照ゼロ確認**

Run: `grep -rn "surface-alt\|surface-light" src/ --include="*.tsx" --include="*.ts" --include="*.css"`
Expected: 0 matches

- [ ] **Step 4: bg-surface のセクション背景利用がフッターのみであることを確認**

Run: `grep -rn "bg-surface" src/app/(public)/ --include="*.tsx" | grep -v "site-footer" | grep -v "/80\|/50"` (UI overlay を除外)
Expected: `events/[slug]/page.tsx` のカード枠と `mypage/` のフォーム枠のみ（セクション全幅背景としての使用はゼロ）
