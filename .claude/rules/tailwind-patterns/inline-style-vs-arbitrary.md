---
paths:
  - src/**/*.tsx
  - src/**/*.css
---

# インラインスタイル vs Tailwind arbitrary properties

> Tailwind CSS 4 / specificity 衝突 / responsive reset

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

---

## Tailwind v4 + Turbopack で新規 arbitrary value / responsive variant が HMR 未生成

`md:w-64` / `md:grid-cols-[220px_1fr]` / `gap-y-10` / `space-y-10` / `py-7` / `min-h-[2.6em]` / `min-h-12` 等を**新規追加**すると、computed style で `0px` 等 fallback 値が返り CSS に出力されない silent bug。既存 file で利用済みの class は OK、新規 combo class（特に `md:` variant + arbitrary value の組み合わせ）のみ scan に拾われない。**`@theme` 内の新規 CSS variable も同様に反映されない**（既存 variable は OK、新規 `--space-card-image-width` 等の追加分のみ未反映）。

### 検出

`getComputedStyle(el).XXX` で期待値が出ない、または以下の test snippet:

```javascript
const test = document.createElement("div");
test.style.position = "absolute";
test.style.visibility = "hidden";
document.body.appendChild(test);
test.className = "md:w-64"; // ← 新規 combo class
console.log(getComputedStyle(test).width); // "0px" なら未生成
```

### 回避策

| 優先度       | 方法                                    | 適用条件                                        |
| ------------ | --------------------------------------- | ----------------------------------------------- |
| **第一推奨** | `@layer utilities` 内の custom utility  | 複雑な responsive 値 / 1 component 専用の固有値 |
| **第二推奨** | dev server 再起動（`Ctrl+C → bun dev`） | 標準 Tailwind utility に戻す場合の最終手段      |
| **避ける**   | inline `style={{}}` で responsive 表現  | media query 困難、SSR mismatch リスク           |

**`@layer utilities` 内 custom utility 例**（SpaceCard 4:3 grid の参照実装）:

```css
@layer utilities {
  .space-card-grid {
    grid-template-columns: 7.5rem 1fr;
  }
  @media (min-width: 48rem) {
    .space-card-grid {
      grid-template-columns: 16rem 1fr;
    }
  }
}
```

```tsx
<Link className="space-card-grid grid items-start gap-4 ...">
```

この pattern は CSS の通常 HMR で確実に走り、`@theme` の token rebuild に依存しない。Smashing Magazine / Tailwind Plus 公式の `@layer utilities` 追加 method と整合。実例: 2026-05-12 セッションで `md:grid-cols-[220px_1fr]` / `md:w-64` / `gap-y-10` / `--space-card-image-width` 等が連続 HMR 未反映で `.space-card-grid` custom utility に移行
