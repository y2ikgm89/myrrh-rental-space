---
paths:
  - src/**/*.tsx
  - src/**/*.ts
  - src/**/*.css
---

# インラインスタイル vs Tailwind arbitrary properties

> Tailwind CSS 4.2 / specificity 衝突 / responsive reset

## specificity 問題

`style={{}}` の specificity `(1,0,0,0)` は class utility `(0,0,1,0)` を常に上回る。
responsive reset（`md:[...:0]` 等）したい値は **inline style ではなく arbitrary class** で書く:

```tsx
// NG: inline style は md: で上書き不可（desktop で stroke/shadow が残る silent bug）
<h1
  style={{ WebkitTextStroke: "0.5px rgba(0,0,0,0.45)" }}
  className="md:[-webkit-text-stroke:0px]"
>

// OK: arbitrary class で統一（rgb() CSS Color 4 + underscore で値区切り）
<h1
  className={cn(
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.5px_rgb(0_0_0/0.45)]",
    "[text-shadow:0_1px_2px_rgb(0_0_0/0.6),0_2px_12px_rgb(0_0_0/0.5)]",
    // Desktop reset（responsive utility で clean override）
    "md:[paint-order:normal]",
    "md:[-webkit-text-stroke:0px_transparent]",
    "md:[text-shadow:none]",
  )}
>
```

**記法ルール**:

- 値の空白は `_` で区切る（例: `stroke fill` → `stroke_fill`）
- 色は `rgb(R_G_B/A)` 形式（CSS Color 4、カンマ不可）
- reset は `:none` / `:0px_transparent` / `:normal` で明示
- 常時固定の値（breakpoint 切替不要）は inline style も許容（例: hero の photo credit）

参照実装: `_shared/components/page-hero/EditorialSplitHero.tsx` の label / h1（mobile overlay stroke → desktop reset）

---

## `className` 文字列内の改行禁止

`className="fixed ...\n  md:hidden"` は SSR が生文字列（改行+インデント込み）を出力するのに対し、React は CSR で空白正規化した文字列を比較するため hydration mismatch になる。single-line に統一するか、長い場合は `cn("fixed ...", "md:hidden")` で配列分割する。

```tsx
// NG: 改行含む className
<div className="fixed bottom-16
        md:hidden">

// OK: cn() で配列分割
<div className={cn("fixed bottom-16", "md:hidden")}>
```

---

## Tailwind arbitrary value に JS 変数埋め込み禁止

``className={`z-[${Z_INDEX.x}]`}`` / ``className={`text-[${theme.color}]`}`` / `tailwind-variants` slot 内の同パターンは Tailwind JIT が静的スキャンのため CSS 未生成で silent fail（z-index / color が無効になる）。

対処:

- 数値（z-index 等）は `style={{ zIndex: Z_INDEX.x }}` で inline style
- 色・spacing 等は `@theme` にトークン定義して静的クラス使用

検出 grep: ``grep -rnE 'className=\{[^}]*`[^`]*\[\$\{' src/``
