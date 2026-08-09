---
paths:
  - "src/app/**/*.tsx"
  - "src/app/**/*.css"
  - "src/shared/components/**"
  - "src/shared/styles/**"
---

# UI

React 19 + React Compiler + Tailwind v4（CSS-first、`tailwind.config` は無い）。
UI プリミティブは Radix UI + `tailwind-variants`。テーマは
`src/app/(public)/_styles/public.css` と `src/app/(admin)/_styles/admin.css` に
oklch のセマンティックトークンとして定義してある。

## React Compiler 前提

- `useMemo` / `useCallback` / `forwardRef` は import 自体が ESLint error。
  ref は通常の prop として渡す。
- render 中に `ref.current` を読まない（`react-hooks/refs`）。マウント時の
  スナップショットが欲しいときは `useState` の initializer を使う。
- `react-hooks/incompatible-library` / `unsupported-syntax` / `void-use-memo` は
  warn ではなく error。

## トークンを使う

- 管理画面で Tailwind のパレット直指定（`bg-gray-*` / `text-slate-*` /
  `bg-black/40` / `hover:bg-white/10` など）は禁止。セマンティックトークン
  （`bg-surface` / `text-muted-foreground` など）を使う。強制は
  `__tests__/unit/architecture/admin-design-tokens.test.ts`。
- 公開側のセクション系 surface は `px-4` / `px-6` を直書きしない。
  `Container` / `SectionWrapper` のトークン経由。
- 廃止済みトークン（`--space-*` 以前の spacing-section 変数、`--container-max`、
  `getContainerMaxCss`）を再導入しない。

## アクセシビリティ

CI に axe の a11y チェックがあり、コントラスト比は個別ゲートで固定している。

- **CSS の `opacity` でテキストを減光しない。** グループに掛けると背景まで
  畳み込まれ、AA を割る。無効状態には専用トークンを使う。
  `saturate()` は輝度を保存しないので代替にならない。
- アニメーションで文字の `opacity` を動かさない
  （`__tests__/unit/architecture/no-animated-opacity-on-text.test.ts`）。
- `<input>` / `<textarea>` に 16px 未満の font-size を単独指定しない
  （iOS で auto-zoom する）。`text-sm` 単独が該当。
- dialog にはアクセシブル名を付ける。モバイル dialog のフッターは pinned。
  フォームのエラーは `aria-invalid` / `aria-describedby` で field に紐づける
  （conform が面倒を見る）。
- 半透明の fixed レイヤーは hydration 前の DOM でコントラストが変わる。
  合成は 8bit 量子化後に評価される。

## その他

- `next/font/google` の build-time fetch に依存しない（本番 build がネットワークに
  依存する）。配信していない Web font 名をテーマから参照しない。
- 動的 URL / blob URL / 外部 URL を出す場所以外で `<img>` を使わない
  （`@next/next/no-img-element`。media / editor 配下だけ例外）。
- `console.log` は禁止（`warn` / `error` / `info` は可）。
- props 同期のために `key` を付け替えて remount しない。同じ subtree の
  dialog や `useActionState` ごと捨てるので、成功時にだけ状態が壊れる。
- 管理画面の一括操作バーは `FloatingBulkActionBar` primitive を経由する
  （`fixed bottom-6 left-1/2 -translate-x-1/2` の直書きは 0 件）。
- 完了画面の文言を毎レンダー再計算する派生値で分岐しない。自分が起こした
  revalidate で表示が化ける。
