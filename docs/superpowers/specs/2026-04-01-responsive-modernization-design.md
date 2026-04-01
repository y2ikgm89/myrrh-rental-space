# 公開ページ レスポンシブ近代化 設計書

> 2026-04-01 | 破壊的変更許可 | Tailwind CSS v4 公式ベストプラクティス準拠

## 背景

公開ページの Design System Primitives が全て `"use client"` で不要な JS バンドルを生成。
Tailwind v4 の `--text-*` 正式構文、Container Queries が未活用。
`project-design-config.md` と `public.css` の間にレスポンシブ方針の乖離がある。

## 変更一覧

### P0: `"use client"` 除去（6ファイル）

State/Effect/Browser API を使わない純粋レンダリングコンポーネントから `"use client"` を削除:

| ファイル          | 理由                    |
| ----------------- | ----------------------- |
| `container.tsx`   | 純 CSS レイアウト       |
| `stack.tsx`       | 純 CSS レイアウト       |
| `heading.tsx`     | 純テキストレンダリング  |
| `badge.tsx`       | 純テキストレンダリング  |
| `prose.tsx`       | 純コンテンツラッパー    |
| `image-frame.tsx` | `next/image` は SC 対応 |

**維持:** `button.tsx`（onClick）, `dialog.tsx`（Radix UI stateful）

### P1: `@theme` `--text-*` 正式化

`public.css` の `@theme` ブロックで `--text-*--line-height`, `--text-*--font-weight`, `--text-*--letter-spacing` を定義。

```css
@theme {
  --text-hero: clamp(2.5rem, 5vw + 1rem, 4.5rem);
  --text-hero--line-height: 1.3;
  --text-hero--letter-spacing: -0.02em;
  --text-hero--font-weight: 700;

  --text-h1: clamp(2rem, 3vw + 0.5rem, 3rem);
  --text-h1--line-height: 1.3;
  --text-h1--letter-spacing: -0.02em;
  --text-h1--font-weight: 700;

  --text-h2: clamp(1.5rem, 2vw + 0.5rem, 2.25rem);
  --text-h2--line-height: 1.3;
  --text-h2--letter-spacing: -0.02em;
  --text-h2--font-weight: 700;

  --text-h3: clamp(1.25rem, 1.5vw + 0.5rem, 1.5rem);
  --text-h3--line-height: 1.3;
  --text-h3--letter-spacing: -0.02em;
  --text-h3--font-weight: 600;
}
```

これにより `text-h1` クラス一つで font-size + line-height + letter-spacing + font-weight が全て適用される。

**影響:**

- `heading.tsx`: `levelClasses` の冗長なクラスを `text-h1` 等に簡素化
- `page-hero.tsx`: `text-[length:var(--text-hero)]` → `text-hero`
- 旧 `--leading-tight`, `--tracking-tight` 変数: heading 用途では不要に（他の用途で残す）

### P2: Container Queries 導入

カードグリッドコンポーネントを viewport breakpoints から container queries に移行。

**対象ファイル:**

- `spaces/_components/space-card.tsx` 周辺のグリッド
- `posts/_components/post-grid.tsx`
- `spaces/[slug]/_components/related-spaces.tsx`
- サイドバーレイアウト（`spaces/[slug]/page.tsx`, `contact/page.tsx`）のハードコード幅解消

**パターン:**

```tsx
// Before: viewport breakpoints
<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">

// After: container queries
<div className="@container">
  <div className="grid gap-6 @sm:grid-cols-2 @xl:grid-cols-3">
```

**注意:** Container size は viewport breakpoints と値が異なる:

- `@sm` = 24rem (384px), `@md` = 28rem (448px), `@lg` = 32rem (512px), `@xl` = 36rem (576px)

### P3: `className` を `cn()` に統一

テンプレートリテラル結合を `cn()` (clsx + tailwind-merge) に置換。全 Design System Primitives 対象。

### P4: ハードコード修正 + ドキュメント更新

- `public.css` の `@media (max-width: 767px)` → `@media (width < 48rem)` (Tailwind v4 の modern CSS syntax に合わせる)
- `project-design-config.md` の breakpoint ベース指定を fluid `clamp()` ベースに修正

## 非スコープ

- 管理画面のレスポンシブ対応（別タスク）
- レガシーセクションコンポーネント（`_components/` 内の PascalCase）の移行
- 新規コンポーネント追加
