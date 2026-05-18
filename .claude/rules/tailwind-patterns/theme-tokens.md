---
paths:
  - src/**/*.tsx
  - src/**/*.css
---

# Tailwind テーマトークン・セマンティックカラー

> Tailwind CSS 4.2 / CSS-first 設定 / Multiple Root Layouts 対応

## 禁止事項（テーマ・カラー系）

1. **globals.css 作成禁止**
   - admin.css / public.css の 2 ファイルで完全分離。共有 CSS は不要
   - `src/shared/` の共有コンポーネントは CSS 変数に依存しない設計にする

2. **tailwind.config.js 禁止**
   - Tailwind CSS 4 は CSS-first 設定
   - `@theme` ディレクティブを使用（→ `tailwind-patterns/theme-tokens/foundations.md`）

3. **ハードコードカラークラス禁止**
   - `gray-*` / `blue-*` / `red-*` / `green-*` / `yellow-*` 等のデフォルトカラー禁止
   - セマンティックトークン代替表（→ `tailwind-patterns/theme-tokens/semantic-tokens.md`）の代替クラスを使用

   **例外**: カラーピッカーのスウォッチプレビュー等、特定の色を表示目的で使う場合は許可

4. **HSL / Hex 形式禁止**（`@theme` 内）
   - OKLCH 形式を使用

5. **`!important` 禁止**
   - Cascade Layers で優先度を管理
   - **例外**: `prefers-reduced-motion` リセット（`animation-duration: 0.01ms !important`）は許可

6. **`src/shared/` コンポーネントでの CSS 変数参照禁止**
   - `var(--color-primary)` 等を直接使わず、Tailwind クラスのみ使用
   - 両方の Root Layout で動作させるため（admin.css / public.css の変数値が異なる）

## ブラウザサポート

Tailwind CSS 4 の必要要件:

- Safari 16.4+
- Chrome 111+
- Firefox 128+

## 参考

- [Tailwind CSS v4.0 Blog](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind CSS @theme](https://tailwindcss.com/docs/theme)
- [Next.js Multiple Root Layouts](https://nextjs.org/docs/app/building-your-application/routing/route-groups#creating-multiple-root-layouts)
- `src/app/(admin)/_styles/admin.css` — 管理画面テーマ実装
- `src/app/(public)/_styles/public.css` — 公開ページテーマ実装
- `.claude/rules/frontend/project-design-config.md` — ブランド固有デザイン値
