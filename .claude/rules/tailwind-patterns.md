---
paths:
  - src/**/*.tsx
  - src/**/*.css
---

# Tailwind CSS パターンルール

> Tailwind CSS 4.2 / CSS-first設定 / Multiple Root Layouts対応

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

### @theme --text-\*--\* による Typography SSoT

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

**完全なトークン一覧**: `src/app/(admin)/_styles/admin.css` を参照。

**よく間違えるハードコードカラー → セマンティックトークン（管理画面）**:

| 禁止                       | 代替                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| `text-gray-900`            | `text-foreground`                                                       |
| `text-gray-600`            | `text-muted-foreground`                                                 |
| `bg-gray-100`              | `bg-muted`                                                              |
| `bg-gray-50`               | `bg-muted/50`                                                           |
| `bg-white`                 | `bg-card` または `bg-background`                                        |
| `border-gray-200`          | `border-border`                                                         |
| `hover:bg-gray-100`        | `hover:bg-accent`                                                       |
| `ring-blue-500`            | `ring-ring`                                                             |
| `text-green-600`           | `text-success`                                                          |
| `bg-green-500`             | `bg-success`                                                            |
| `text-red-600`             | `text-destructive`                                                      |
| `bg-red-500`               | `bg-destructive`                                                        |
| `text-yellow-600`          | `text-warning`                                                          |
| `bg-blue-600`              | `bg-primary`                                                            |
| `text-blue-600`            | `text-primary`                                                          |
| `shadow-[..rgb(0_0_0/..)]` | `shadow-xs` または `shadow-sm`                                          |
| inset shadow（くぼみ効果） | `shadow-inner`（arbitrary `shadow-[inset_...]` + hardcoded color 禁止） |

### 公開ページ（public.css） — Luxury White × Bronze テーマ

**よく間違えるハードコードカラー → セマンティックトークン（公開ページ）**:

| 禁止                | 代替                                                      |
| ------------------- | --------------------------------------------------------- |
| `bg-black/10`       | `bg-foreground/10`                                        |
| `hover:bg-black/10` | `hover:bg-foreground/10`                                  |
| `bg-white`          | `bg-background`                                           |
| `text-white`        | Hero オーバーレイ上のみ許可、それ以外は `text-background` |
| `bg-black/50`       | `bg-foreground/50`                                        |

**完全なトークン一覧**: `src/app/(public)/_styles/public.css` を参照。

**公開ページ固有トークン**（管理画面に存在しないもの）:

| トークン               | Tailwind クラス     | 用途                          |
| ---------------------- | ------------------- | ----------------------------- |
| `--color-surface`      | `bg-surface`        | カードより薄い背景            |
| `--color-accent`       | `text-accent`       | ブロンズ（CTA・ラベル・価格） |
| `--color-accent-light` | `text-accent-light` | ホバー時ブロンズ              |

**公開ページ固有のユーティリティクラス**（`@layer utilities` に定義）:

| クラス          | 用途                                                  |
| --------------- | ----------------------------------------------------- |
| `.font-heading` | `font-family: var(--font-serif)` — Cormorant Garamond |
| `.gold-line`    | セクションラベル装飾（ブロンズライン付き）            |

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

3.5. **`start-*` / `end-*` 配置ユーティリティ禁止**（v4.2 廃止予定）

- `start-4` / `end-4` 等（`inset-inline-start` / `inset-inline-end` のショートハンド）は v4.2 で deprecated
- `inset-s-4` / `inset-e-4` を使用（`justify-start` / `text-end` 等は対象外）

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
