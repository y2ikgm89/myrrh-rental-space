---
description: Tailwind 4 CSS-first 設定（@theme + OKLCH カラー + Typography SSoT + @keyframes）+ Multiple Root Layouts による admin / public CSS 分離
paths:
  - src/**/*.css
  - src/app/(admin)/_styles/admin*.css
  - src/app/(public)/_styles/public*.css
  - src/shared/styles/**
---

# Tailwind 4 CSS-first foundations

> Multiple Root Layouts による admin.css / public.css 完全分離 + `@theme` ディレクティブ + OKLCH カラー必須 + `--text-*--*` Typography SSoT + `@keyframes` 埋め込み。

## CSS アーキテクチャ

### 公開ページ / 管理画面の完全分離

Next.js 16 Multiple Root Layouts パターンを採用。公開ページと管理画面は独立した CSS を持つ:

```
src/app/
├── (admin)/
│   ├── layout.tsx           # Admin Root Layout
│   └── _styles/admin.css    # 管理画面専用テーマ（固定）
│
└── (public)/
    ├── layout.tsx           # Public Root Layout
    └── _styles/public.css   # 公開ページテーマ（顧客ブランドに合わせてカスタマイズ）
```

**共有 CSS**:

```
src/shared/styles/
└── lexical-content.css      # Lexical エディタコンテンツスタイル（両方で使用）
```

**各 CSS の先頭**:

```css
@import "tailwindcss";
@import "../../../shared/styles/lexical-content.css";
@plugin "@tailwindcss/typography";
```

### 注意事項

- **globals.css は存在しない** — 削除済み。admin.css / public.css で完全分離
- **公開ページ ↔ 管理画面の遷移はフルページリロード** — 異なる Root Layout 間の仕様
- **共有コンポーネント（`src/shared/`）は CSS 変数に依存しない** — 両方の Root Layout で使用可能

## CSS-first 設定（@theme）

Tailwind CSS 4 は `tailwind.config.js` を使わず、CSS ファイル内の `@theme` ディレクティブで設定する:

```css
@import "tailwindcss";

@theme {
  /* カラー（OKLCH形式必須） */
  --color-primary: oklch(0.55 0.2 260);
  --color-primary-foreground: oklch(1 0 0);

  /* フォント */
  --font-sans: var(--font-noto-sans-jp), "Helvetica Neue", Arial, sans-serif;
  --font-serif: var(--font-noto-serif-jp), Georgia, "Times New Roman", serif;

  /* シャドウ */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.03);

  /* イージング */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out-expo: cubic-bezier(0.87, 0.13, 0.13, 0.87);
}
```

## OKLCH 形式カラー（必須）

**OKLCH 形式のみ使用**（Tailwind CSS 4 推奨）:

```css
/* OK: OKLCH */
--color-primary: oklch(0.55 0.2 260);
--color-background: oklch(0.995 0.002 250);

/* NG: HSL */
--color-primary: hsl(221 83% 53%);

/* NG: Hex */
--color-primary: #2563eb;
```

OKLCH の利点:

- 知覚的に均一な色空間（同じ chroma 値で明度変化が自然）
- 色相回転が数値的に予測可能
- P3 広色域対応

## @theme --text-\*--\* による Typography SSoT

`--text-h1` 等を `@theme` で定義すると、以下が同一名で自動適用される（[Tailwind 4 公式 API](https://tailwindcss.com/docs/font-size#customizing-your-theme)）:

```css
@theme {
  --text-h1: clamp(1.875rem, 1.5rem + 1.75vw, 2.5rem);
  --text-h1--line-height: 1.2;
  --text-h1--letter-spacing: -0.02em;
  --text-h1--font-weight: 300;
}
```

呼び出し側で **`font-light` / `leading-*` / `tracking-*` を重ねない**:

```tsx
// NG: @theme で既に定義済みの font-weight を重複指定
<h1 className="text-h1 font-light">

// OK: @theme の SSoT に任せる
<h1 className="text-h1">
```

**例外**: `editorial-card` の featured variant 等、意図的に標準値と異なる override は許容。コメントで理由を明記する。

## @keyframes の埋め込み

アニメーションの keyframes は `@theme` 内に定義可:

```css
@theme {
  --animate-fade-in: fade-in 0.3s ease-out;

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}
```

使用: `<div className="animate-fade-in">...</div>`
