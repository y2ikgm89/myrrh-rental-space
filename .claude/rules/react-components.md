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

## searchParams 駆動のタブ / ビュー切替（`cacheComponents` 下）

- searchParam（例 `?tab=`）でサーバーコンテンツを切替える UI は、コンテンツを client component の `children` / props に**焼き込まない**（= Pattern C 禁止）。`cacheComponents` 下ではソフトナビ時に再ストリームされず「前のタブのまま残る」stale になる。
- **Pattern A（searchParam がサーバーフェッチを gate する）**: タブバーは nav-only の client（`useQueryState` / `useQueryStates` ＋ `shallow:false, history:"replace"`）。コンテンツ本体は **page 側の `<Suspense key={param}>` 動的ホール**で描画し、各パネルは `await connection()` の Server Component にする。canonical 実装は `admin/events/page.tsx`（同型: spaces / posts / news / reservations）。
- **Pattern B（searchParam がフェッチを gate しない＝親が 1 フェッチで全ビューを先行解決して渡す場合のみ）**: Radix `Tabs` の `forceMount` ＋ `shallow:true` の純クライアント切替で可（例: `SettingsTabs` / mypage 予約タブ / 公開 events-view-switcher）。サーバーフェッチが tab に依存するなら使わない。
- 判定基準: 「その searchParam がサーバー側の取得内容を変えるか？」→ 変える＝**Pattern A**、変えない（1 フェッチで全ビューを賄える）＝**Pattern B**。
- 背景と一次検証は `next.config.ts` の `cachedNavigations` コメント（vercel/next.js#86577 / #88535・47ng/nuqs#1273）を参照。

## スタイル / UI

- Tailwind CSS 4 ＋ `tailwind-variants`。クラス結合は `clsx` / `tailwind-merge`。プリミティブは Radix UI。
- アクセシビリティ: `img` / `next/image` に `alt`、aria 属性を適切に付ける（jsx-a11y）。

## 画像

- 原則 `next/image` を使う。動的 URL・blob・外部 URL を扱う `media` / `editor` / `media-picker` 配下のみ `<img>` を許可（eslint で限定）。
