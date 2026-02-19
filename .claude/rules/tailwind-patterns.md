---
paths:
  - src/**
---

# Tailwind CSS パターンルール

> Tailwind CSS 4.1 / CSS-first設定 / Multiple Root Layouts対応

## CSSアーキテクチャ

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

---

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

### OKLCH 形式カラー（必須）

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

### @keyframes の埋め込み

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

---

## セマンティックカラートークン（ハードコードカラー禁止）

`gray-*` / `blue-*` / `red-*` 等のデフォルトカラークラスを使用せず、定義済みセマンティックトークンを使う。

### 管理画面（admin.css） — Swiss Industrial Admin テーマ

実際に定義されているトークン一覧:

| カテゴリ  | トークン                         | 値                                | Tailwind クラス                       |
| --------- | -------------------------------- | --------------------------------- | ------------------------------------- |
| Core      | `--color-background`             | `oklch(0.98 0.005 250)`           | `bg-background`                       |
| Core      | `--color-foreground`             | `oklch(0.20 0.02 260)`            | `text-foreground`                     |
| Card      | `--color-card`                   | `oklch(1 0 0)`                    | `bg-card`                             |
| Card      | `--color-card-foreground`        | `oklch(0.20 0.02 260)`            | `text-card-foreground`                |
| Popover   | `--color-popover`                | `oklch(1 0 0)`                    | `bg-popover`                          |
| Popover   | `--color-popover-foreground`     | `oklch(0.20 0.02 260)`            | `text-popover-foreground`             |
| Primary   | `--color-primary`                | `oklch(0.55 0.20 260)` Trust Blue | `bg-primary` / `text-primary`         |
| Primary   | `--color-primary-foreground`     | `oklch(1 0 0)`                    | `text-primary-foreground`             |
| Secondary | `--color-secondary`              | `oklch(0.95 0.01 250)`            | `bg-secondary`                        |
| Secondary | `--color-secondary-foreground`   | `oklch(0.25 0.02 260)`            | `text-secondary-foreground`           |
| Muted     | `--color-muted`                  | `oklch(0.95 0.01 250)`            | `bg-muted`                            |
| Muted     | `--color-muted-foreground`       | `oklch(0.55 0.02 250)`            | `text-muted-foreground`               |
| Accent    | `--color-accent`                 | `oklch(0.95 0.05 260)`            | `bg-accent`                           |
| Accent    | `--color-accent-foreground`      | `oklch(0.45 0.15 260)`            | `text-accent-foreground`              |
| Semantic  | `--color-destructive`            | `oklch(0.55 0.22 25)`             | `bg-destructive` / `text-destructive` |
| Semantic  | `--color-destructive-foreground` | `oklch(1 0 0)`                    | `text-destructive-foreground`         |
| Semantic  | `--color-success`                | `oklch(0.60 0.18 145)`            | `bg-success` / `text-success`         |
| Semantic  | `--color-success-foreground`     | `oklch(1 0 0)`                    | `text-success-foreground`             |
| Semantic  | `--color-warning`                | `oklch(0.75 0.18 85)`             | `bg-warning` / `text-warning`         |
| Semantic  | `--color-warning-foreground`     | `oklch(0.20 0.02 85)`             | `text-warning-foreground`             |
| Semantic  | `--color-info`                   | `oklch(0.55 0.20 260)`            | `bg-info` / `text-info`               |
| Semantic  | `--color-info-foreground`        | `oklch(1 0 0)`                    | `text-info-foreground`                |
| Sidebar   | `--color-sidebar-bg`             | `oklch(0.18 0.03 260)` ダーク     | `bg-sidebar-bg`                       |
| Sidebar   | `--color-sidebar-border`         | `oklch(0.25 0.02 260)`            | `border-sidebar-border`               |
| Sidebar   | `--color-sidebar-text`           | `oklch(0.92 0.01 260)`            | `text-sidebar-text`                   |
| Sidebar   | `--color-sidebar-text-muted`     | `oklch(0.70 0.02 260)`            | `text-sidebar-text-muted`             |
| Sidebar   | `--color-sidebar-accent`         | `oklch(0.55 0.20 260)`            | `bg-sidebar-accent`                   |
| Sidebar   | `--color-sidebar-nav-hover`      | `oklch(1 0 0 / 0.05)` ホバー背景  | `hover:bg-sidebar-nav-hover`          |
| Overlay   | `--color-overlay`                | `oklch(0 0 0 / 0.6)` モーダル背景 | `bg-overlay`                          |
| Border    | `--color-border`                 | `oklch(0.90 0.01 250)`            | `border-border`                       |
| Border    | `--color-input`                  | `oklch(0.90 0.01 250)`            | `border-input`                        |
| Border    | `--color-ring`                   | `oklch(0.55 0.20 260)`            | `ring-ring`                           |

**ハードコードカラー vs セマンティックトークン（管理画面）**:

| 禁止                | 代替                             |
| ------------------- | -------------------------------- |
| `text-gray-900`     | `text-foreground`                |
| `text-gray-600`     | `text-muted-foreground`          |
| `bg-gray-100`       | `bg-muted`                       |
| `bg-gray-50`        | `bg-muted/50`                    |
| `bg-white`          | `bg-card` または `bg-background` |
| `border-gray-200`   | `border-border`                  |
| `hover:bg-gray-100` | `hover:bg-accent`                |
| `ring-blue-500`     | `ring-ring`                      |
| `text-green-600`    | `text-success`                   |
| `bg-green-500`      | `bg-success`                     |
| `text-red-600`      | `text-destructive`               |
| `bg-red-500`        | `bg-destructive`                 |
| `text-yellow-600`   | `text-warning`                   |
| `bg-blue-600`       | `bg-primary`                     |
| `text-blue-600`     | `text-primary`                   |

### 公開ページ（public.css） — Champagne Gold + White テーマ

実際に定義されているトークン一覧:

| カテゴリ  | トークン                       | 値                                   | Tailwind クラス                           |
| --------- | ------------------------------ | ------------------------------------ | ----------------------------------------- |
| Brand     | `--color-brand-primary`        | `oklch(0.75 0.06 65)` Champagne Gold | `bg-brand-primary` / `text-brand-primary` |
| Brand     | `--color-brand-secondary`      | `oklch(0.55 0.08 65)` Darker Gold    | `text-brand-secondary`                    |
| Core      | `--color-background`           | `oklch(0.995 0.002 250)` Pure White  | `bg-background`                           |
| Core      | `--color-foreground`           | `oklch(0.15 0.01 250)`               | `text-foreground`                         |
| Card      | `--color-card`                 | `oklch(1 0 0)`                       | `bg-card`                                 |
| Card      | `--color-card-foreground`      | `oklch(0.15 0.01 250)`               | `text-card-foreground`                    |
| Surface   | `--color-surface`              | `oklch(0.97 0.003 250)`              | `bg-surface`                              |
| Primary   | `--color-primary`              | `var(--color-brand-primary)`         | `bg-primary` / `text-primary`             |
| Primary   | `--color-primary-dark`         | `oklch(0.55 0.08 65)`                | `text-primary-dark`                       |
| Primary   | `--color-primary-foreground`   | `oklch(0.15 0.01 250)`               | `text-primary-foreground`                 |
| Secondary | `--color-secondary`            | `oklch(0.96 0.005 250)`              | `bg-secondary`                            |
| Secondary | `--color-secondary-foreground` | `oklch(0.25 0.02 250)`               | `text-secondary-foreground`               |
| Muted     | `--color-muted`                | `oklch(0.96 0.005 250)`              | `bg-muted`                                |
| Muted     | `--color-muted-foreground`     | `oklch(0.45 0.01 250)`               | `text-muted-foreground`                   |
| Accent    | `--color-accent`               | `oklch(0.96 0.01 65)`                | `bg-accent`                               |
| Accent    | `--color-accent-foreground`    | `oklch(0.35 0.05 65)`                | `text-accent-foreground`                  |
| Semantic  | `--color-destructive`          | `oklch(0.55 0.22 25)`                | `bg-destructive` / `text-destructive`     |
| Semantic  | `--color-success`              | `oklch(0.60 0.18 145)`               | `bg-success` / `text-success`             |
| Semantic  | `--color-warning`              | `oklch(0.75 0.18 85)`                | `bg-warning` / `text-warning`             |
| Semantic  | `--color-info`                 | `oklch(0.55 0.18 260)`               | `bg-info` / `text-info`                   |
| Semantic  | `--color-rating`               | `oklch(0.82 0.17 90)`                | `text-rating` — 星評価用                  |
| Border    | `--color-border`               | `oklch(0.90 0.005 250)`              | `border-border`                           |
| Border    | `--color-input`                | `oklch(0.90 0.005 250)`              | `border-input`                            |
| Border    | `--color-ring`                 | `var(--color-primary-dark)`          | `ring-ring`                               |
| Font      | `--font-sans`                  | Noto Sans JP                         | `font-sans`                               |
| Font      | `--font-serif`                 | Noto Serif JP                        | `font-serif` / `font-heading`（後述）     |

**公開ページ固有のユーティリティクラス**（`@layer utilities` に定義）:

| クラス          | 用途                                             |
| --------------- | ------------------------------------------------ |
| `.font-heading` | `font-family: var(--font-serif)` — Noto Serif JP |
| `.gold-line`    | セクションラベル装飾（ゴールドライン付き）       |

---

## ユーティリティクラス

### @layer の使い方

```css
@layer base {
  /* リセット、基本スタイル、CSS 変数のランタイム設定 */
  * {
    border-color: var(--color-border);
  }
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
  }
}

@layer components {
  /* 再利用可能なコンポーネントスタイル */
  /* 注意: Tailwind ユーティリティで表現できる場合は @apply を使わない */
}

@layer utilities {
  /* ユーティリティクラスの拡張（@theme で表現できない CSS のみ） */
  .font-heading {
    font-family: var(--font-serif);
  }
  .gold-line {
    /* ... */
  }
}
```

### カスタムアニメーション

`@theme` 内で `--animate-*` 変数と `@keyframes` をセットで定義:

```css
@theme {
  --animate-fade-in: fade-in 0.3s ease-out;
  --animate-slide-up: slide-up 0.4s var(--ease-out-expo);

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(1rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
}
```

使用: `<div className="animate-fade-in">` / `<div className="animate-slide-up">`

### Border Radius トークン

admin.css / public.css の両方で統一:

| トークン      | 値         | Tailwind クラス |
| ------------- | ---------- | --------------- |
| `--radius-sm` | `0.25rem`  | `rounded-sm`    |
| `--radius-md` | `0.375rem` | `rounded-md`    |
| `--radius-lg` | `0.5rem`   | `rounded-lg`    |
| `--radius-xl` | `0.75rem`  | `rounded-xl`    |

コンポーネント別 border-radius 方針（→ `project-design-config.md` §セクション設計）:

- コンテナ / 画像: `rounded-lg`
- CTA ボタン: `rounded-full`
- セクション境界: sharp（rounded なし）

---

## 禁止事項

1. **globals.css 作成禁止**
   - admin.css / public.css の 2 ファイルで完全分離。共有 CSS は不要
   - `src/shared/` の共有コンポーネントは CSS 変数に依存しない設計にする

2. **tailwind.config.js 禁止**
   - Tailwind CSS 4 は CSS-first 設定
   - `@theme` ディレクティブを使用

3. **ハードコードカラークラス禁止**
   - `gray-*` / `blue-*` / `red-*` / `green-*` / `yellow-*` 等のデフォルトカラー禁止
   - 上記セマンティックトークン表の代替クラスを使用

   **例外**: カラーピッカーのスウォッチプレビュー等、特定の色を表示目的で使う場合は許可

4. **`@apply` 乱用禁止**
   - インライン Tailwind ユーティリティを優先
   - `@apply` は `@layer utilities` 内のユーティリティクラス定義のみ

5. **ハードコード値禁止**
   - `text-[#ff0000]` → `@theme` にカラートークンを追加して使用
   - `p-[13px]` → spacing scale を使用（`p-3` = 12px、`p-3.5` = 14px）
   - **例外**: 意図的なピクセル精度調整（`top-[1px]` 等）は許可

6. **HSL / Hex 形式禁止**（`@theme` 内）
   - OKLCH 形式を使用

7. **`!important` 禁止**
   - Cascade Layers で優先度を管理
   - **例外**: `prefers-reduced-motion` リセット（`animation-duration: 0.01ms !important`）は許可

8. **`src/shared/` コンポーネントでの CSS 変数参照禁止**
   - `var(--color-primary)` 等を直接使わず、Tailwind クラスのみ使用
   - 両方の Root Layout で動作させるため（admin.css / public.css の変数値が異なる）

---

## ブラウザサポート

Tailwind CSS 4 の必要要件:

- Safari 16.4+
- Chrome 111+
- Firefox 128+

---

## 参考

- [Tailwind CSS v4.0 Blog](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind CSS @theme](https://tailwindcss.com/docs/theme)
- [Next.js Multiple Root Layouts](https://nextjs.org/docs/app/building-your-application/routing/route-groups#creating-multiple-root-layouts)
- `src/app/(admin)/_styles/admin.css` — 管理画面テーマ実装
- `src/app/(public)/_styles/public.css` — 公開ページテーマ実装
- `.claude/rules/project-design-config.md` — ブランド固有デザイン値
