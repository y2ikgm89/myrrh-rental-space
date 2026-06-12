---
paths:
  - "src/**/*.tsx"
---

# React / コンポーネントの規約

## React 19 + React Compiler

- `useMemo` / `useCallback` を使わない（React Compiler が自動メモ化する）。ESLint error。
- `forwardRef` を使わない。React 19 では `ref` を通常の prop として受け取る。ESLint error。
- 例外は Lexical フォーク `_shared/components/editor/lexical/plugins/lexical-draggable-block-plugin.ts` のみ（eslint で緩和済み）。

## Server / Client コンポーネント

- 既定は Server Component。状態・イベントハンドラ・ブラウザ API が要るときだけファイル先頭に `'use client';`。
- Client から DB や秘密情報に触れない。データ変更は Server Action 経由。

## スタイル / UI

- Tailwind CSS 4 ＋ `tailwind-variants`。クラス結合は `clsx` / `tailwind-merge`。プリミティブは Radix UI。
- アクセシビリティ: `img` / `next/image` に `alt`、aria 属性を適切に付ける（jsx-a11y）。

## 画像

- 原則 `next/image` を使う。動的 URL・blob・外部 URL を扱う `media` / `editor` / `media-picker` 配下のみ `<img>` を許可（eslint で限定）。
