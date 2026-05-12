---
description: セマンティックカラートークン（admin Swiss Industrial / public Luxury Bronze）+ ハードコードカラー → トークン代替表 + ユーティリティクラス（@layer / カスタムアニメーション / Border Radius）
paths:
  - src/**/*.tsx
  - src/**/*.css
  - src/app/(admin)/_styles/admin*.css
  - src/app/(public)/_styles/public*.css
---

# セマンティックトークン + ユーティリティ

> admin / public 各テーマのカラートークン代替表 + `@layer` 使い分け + `--animate-*` カスタムアニメーション + Border Radius トークン。

## 管理画面（admin.css） — Swiss Industrial Admin テーマ

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

## 公開ページ（public.css） — Luxury White × Bronze テーマ

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

| トークン               | Tailwind クラス     | 用途                                                                                      |
| ---------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `--color-surface`      | `bg-surface`        | カードより薄い背景                                                                        |
| `--color-accent`       | `text-accent`       | ブロンズ（CTA・ラベル・価格）                                                             |
| `--color-accent-light` | `text-accent-light` | ホバー時ブロンズ                                                                          |
| `--color-divider`      | `divide-divider`    | **editorial hairline divider 専用**（構造化リストの内部区切り）。card border には使わない |

### editorial hairline divider（`--color-divider`）

`--color-border` (`oklch(0.85 0.015 60)`) は warm tone + 高 chroma で visible な card / form / input 境界用。構造化リスト（`SpaceGrid` / `news-archive-list` / `event-list-view` / `FaqListSection` 等）の内部区切りには NYTimes / Medium / Kinfolk Journal 業界標準準拠の極薄 hairline `--color-divider: oklch(0.92 0.005 60)` を使う。

| 用途                                        | 正解                      | 禁止                                                                       |
| ------------------------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| 構造化リスト内部区切り                      | `divide-y divide-divider` | `divide-y divide-border` / `divide-y border-y border-border divide-border` |
| card / form / input 境界                    | `border border-border`    | `border border-divider`                                                    |
| article footer 等の visible block separator | `border-y border-border`  | `border-y border-divider`（薄すぎて分断意図が伝わらない）                  |

editorial flow では構造化リストの外枠（`border-y`）は **不採用**。リストの境界は親 `SectionWrapper` の padding で囲む（Kinfolk Journal / NYTimes article list 公式パターン）。

**公開ページ固有のユーティリティクラス**（`@layer utilities` に定義）:

| クラス          | 用途                                                  |
| --------------- | ----------------------------------------------------- |
| `.font-heading` | `font-family: var(--font-serif)` — Cormorant Garamond |
| `.gold-line`    | セクションラベル装飾（ブロンズライン付き）            |

## @layer の使い方

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

## カスタムアニメーション

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

## Border Radius トークン

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
