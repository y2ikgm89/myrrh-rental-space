# Tailwind CSS パターンルール

> Tailwind CSS 4.x / CSS-first設定対応

## CSS-first設定

### @theme ディレクティブ

Tailwind CSS 4はCSSファイル内で直接テーマをカスタマイズ:

```css
@import "tailwindcss";

@theme {
  /* カラー */
  --color-primary-100: oklch(0.99 0 0);
  --color-primary-500: oklch(0.84 0.18 117.33);
  --color-primary-600: oklch(0.53 0.12 118.34);

  /* フォント */
  --font-display: "Satoshi", "sans-serif";
  --font-body: "Inter", sans-serif;

  /* ブレークポイント */
  --breakpoint-3xl: 120rem;

  /* アニメーション */
  --animate-fade-in: fade-in 0.3s ease-out;
  @keyframes fade-in {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }

  /* イージング */
  --ease-fluid: cubic-bezier(0.3, 0, 0, 1);
  --ease-snappy: cubic-bezier(0.2, 0, 0, 1);
}
```

### デフォルトテーマのリセット

カスタムテーマのみ使用する場合:

```css
@import "tailwindcss";

@theme {
  --*: initial;  /* デフォルトテーマを無効化 */
  --spacing: 4px;
  --font-body: Inter, sans-serif;
  --color-primary: oklch(0.72 0.11 221.19);
}
```

### プレフィックス使用

```css
@import "tailwindcss" prefix(tw);

@theme {
  --font-display: "Satoshi", sans-serif;
  /* 変数はプレフィックスなしで定義 */
  /* 生成されるCSSは自動的にプレフィックス付き */
}
```

## ユーティリティクラス

### レイヤー

```css
@layer base {
  /* リセット、基本スタイル */
  h1 { @apply text-2xl font-bold; }
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
  --animate-wiggle: wiggle 1s ease-in-out infinite;
  @keyframes wiggle {
    0%, 100% { transform: rotate(-3deg); }
    50% { transform: rotate(3deg); }
  }
}
```

使用: `<div className="animate-wiggle">...</div>`

## 禁止事項

1. **tailwind.config.js禁止**
   - Tailwind CSS 4はCSS-first設定
   - `@theme` ディレクティブを使用

2. **@apply乱用禁止**
   - インラインユーティリティを優先
   - `@apply`はコンポーネント抽象化のみ

3. **ハードコードされた値禁止**
   - `text-[#ff0000]` → テーマ変数を使用
   - `p-[13px]` → spacing scaleを使用

4. **!important禁止**
   - Cascade Layersで優先度を管理

## ブラウザサポート

Tailwind CSS 4の必要要件:
- Safari 16.4+
- Chrome 111+
- Firefox 128+

古いブラウザサポートが必要な場合はv3.4を使用。

## 参考

- [Tailwind CSS v4.0 Blog](https://tailwindcss.com/blog/tailwindcss-v4)
- [Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
