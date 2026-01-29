# Tailwind CSS パターンルール

> Tailwind CSS 4.x / CSS-first設定 / Multiple Root Layouts対応

## CSSアーキテクチャ

### 公開ページ / 管理画面の完全分離

Next.js 16 Multiple Root Layoutsパターンを採用。公開ページと管理画面は独立したCSSを持つ:

```
src/app/
├── (admin)/
│   ├── layout.tsx           # Admin Root Layout
│   └── _styles/admin.css    # 管理画面専用テーマ（固定）
│
└── (public)/
    ├── layout.tsx           # Public Root Layout
    └── _styles/public.css   # 公開ページテーマ（AI生成対象）
```

### admin.css（管理画面専用）

Swiss Industrial Adminテーマ。全顧客共通で固定:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@theme {
  /* Trust Blue パレット */
  --color-primary: oklch(0.55 0.20 260);
  --color-background: oklch(0.98 0.005 250);

  /* サイドバー専用 */
  --color-sidebar-bg: oklch(0.18 0.03 260);
  --color-sidebar-accent: oklch(0.55 0.20 260);
}
```

### public.css（公開ページ専用）

顧客ブランドに合わせてAI生成でカスタマイズ:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@theme {
  /* 顧客ブランドカラー（AI生成で変更） */
  --color-brand-primary: oklch(0.65 0.15 145);
  --color-primary: var(--color-brand-primary);
}
```

### 注意事項

- **globals.css は存在しない** - 削除済み
- **公開ページ ↔ 管理画面の遷移はフルページリロード** - 異なるRoot Layout間の仕様
- **共有コンポーネント（`src/shared/`）はCSS変数に依存しない**

## CSS-first設定

### @theme ディレクティブ

Tailwind CSS 4はCSSファイル内で直接テーマをカスタマイズ:

```css
@import "tailwindcss";

@theme {
  /* カラー（OKLCH形式推奨） */
  --color-primary: oklch(0.55 0.20 260);
  --color-secondary: oklch(0.65 0.15 260);

  /* フォント */
  --font-sans: var(--font-noto-sans-jp), "Helvetica Neue", sans-serif;

  /* シャドウ */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.03);

  /* イージング */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### カラー形式

**OKLCH形式を使用**（Tailwind CSS 4推奨）:

```css
/* OK: OKLCH */
--color-primary: oklch(0.55 0.20 260);

/* 非推奨: HSL */
--color-primary: hsl(221 83% 53%);

/* 非推奨: Hex */
--color-primary: #2563eb;
```

OKLCH利点:
- 知覚的に均一な色空間
- 色相回転が自然
- P3広色域対応

## ユーティリティクラス

### レイヤー

```css
@layer base {
  /* リセット、基本スタイル */
  body { background-color: var(--color-background); }
}

@layer components {
  /* 再利用可能なコンポーネント */
  .btn { @apply px-4 py-2 rounded-md; }
}

@layer utilities {
  /* ユーティリティ拡張 */
  .text-balance { text-wrap: balance; }
}
```

### カスタムアニメーション

```css
@theme {
  --animate-fade-in: fade-in 0.3s ease-out;
  @keyframes fade-in {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
}
```

使用: `<div className="animate-fade-in">...</div>`

## 禁止事項

1. **globals.css作成禁止**
   - admin.css / public.css で完全分離
   - 共有CSSは不要

2. **tailwind.config.js禁止**
   - Tailwind CSS 4はCSS-first設定
   - `@theme` ディレクティブを使用

3. **ハードコードされたカラークラス禁止**
   - `gray-*`, `blue-*`, `red-*` 等のデフォルトカラー使用禁止
   - 代わりにセマンティックカラー変数を使用

   | 禁止 | 代替 |
   |------|------|
   | `text-gray-900` | `text-foreground` |
   | `text-gray-600` | `text-muted-foreground` |
   | `bg-gray-100` | `bg-muted` |
   | `bg-gray-50` | `bg-muted/50` |
   | `border-gray-200` | `border-border` |
   | `hover:bg-gray-100` | `hover:bg-accent` |
   | `ring-gray-500` | `ring-ring` |

   **例外**: カラーピッカーのスウォッチプレビュー等、特定の色を表示する目的の場合は許可

4. **@apply乱用禁止**
   - インラインユーティリティを優先
   - `@apply`はコンポーネント抽象化のみ

5. **ハードコードされた値禁止**
   - `text-[#ff0000]` → テーマ変数を使用
   - `p-[13px]` → spacing scaleを使用

6. **HSL/Hex形式禁止**
   - OKLCH形式を使用

7. **!important禁止**
   - Cascade Layersで優先度を管理

## ブラウザサポート

Tailwind CSS 4の必要要件:
- Safari 16.4+
- Chrome 111+
- Firefox 128+

## 参考

- [Tailwind CSS v4.0 Blog](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind CSS Theme](https://tailwindcss.com/docs/theme)
- [Next.js Multiple Root Layouts](https://nextjs.org/docs/app/building-your-application/routing/route-groups#creating-multiple-root-layouts)
