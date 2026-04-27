---
description: Accessibility — タッチターゲット 44px / フォントサイズ最小値 / Uppercase tracking 標準値
paths:
  - "src/app/(public*)/**/*.tsx"
  - "src/app/(admin)/**/*.tsx"
---

# Accessibility — タッチターゲット / フォントサイズ / Uppercase tracking

## タッチターゲット（WCAG 2.5.5 Enhanced — AAA 準拠）

**本プロジェクトは WCAG 2.2 AA + 2.5.5 Enhanced (AAA) 採用**。全 interactive 要素は **44×44 CSS px 以上**を保証する（[WCAG 2.2 SC 2.5.5 公式](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)）。

### 要素別サイズ基準

| 要素                           | 最小サイズ                   | 実装                                                                  |
| ------------------------------ | ---------------------------- | --------------------------------------------------------------------- |
| Button（public Design System） | `min-h-11`（44px）           | `button.tsx` の sm/md/lg 全 size で `min-h-11` 以上                   |
| Button（admin shadcn）         | `h-11` (44px) / lg は `h-12` | tailwind-variants `size` の default/sm/lg/icon 全て 44px 以上         |
| checkbox / radio               | wrapper に `min-h-11`        | native 要素は 16px だが、`<label>` / wrapper で 44px ヒットエリア確保 |
| inline link(pagination 等)     | `min-block-size: 44px`       | `<a>` に `min-block-size / min-inline-size: 44px` + padding           |
| Icon-only button               | `h-11 w-11`                  | `<button aria-label="...">` にサイズ明示                              |
| Mobile nav / hamburger         | `h-11 w-11`                  | ヘッダーの menu trigger 等                                            |

### token

`@theme --touch-target-min: 2.75rem;`（public.css / admin.css 両方）— `min-h-[var(--touch-target-min)]` / `min-w-[var(--touch-target-min)]` で参照可能。

### WCAG 2.5.5 の例外条項

以下のみ 44px 未達が許容される（[公式](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced#exceptions)）:

- **Equivalent**: 同一ページに 44×44 の equivalent control がある場合
- **Inline**: テキスト段落内のインライン link（文字サイズに従う — Prose 内の `<a>` は例外）
- **User Agent Control**: ブラウザがサイズを制御する要素（native `<select>` dropdown 項目等）
- **Essential**: 情報伝達のため意図的に小さいプレゼンテーション（カラースウォッチ・タイムライン上の点等）

### 禁止パターン

```tsx
// NG: Button sm が min-h-10（40px）— WCAG 2.5.5 Enhanced 未達
const sm = "px-3 py-2 text-sm min-h-10";

// NG: icon-only button にサイズ指定なし（native button は browser default で ~24-30px）
<button aria-label="閉じる"><IconX className="h-4 w-4" /></button>

// NG: checkbox を裸配置（native 16px でヒットエリア不足）
<input type="checkbox" />テキスト
```

### OK パターン

```tsx
// OK: Button sm が min-h-11（44px）
const sm = "px-3 py-2 text-sm min-h-11";

// OK: icon-only button に h-11 w-11
<button type="button" aria-label="閉じる" className="h-11 w-11 inline-flex items-center justify-center">
  <IconX className="h-4 w-4" />
</button>

// OK: checkbox は label wrapper で 44px
<label className="flex min-h-11 items-center gap-2 cursor-pointer">
  <input type="checkbox" />
  <span>同意する</span>
</label>
```

### 管理画面 table の checkbox は CheckboxCell 必須（ADR 0022）

```tsx
// NG: 直書き(16px、WCAG 2.5.5 違反)
<input type="checkbox" checked={isSelected} onChange={handleChange} />;

// OK: CheckboxCell 経由(44px ヒットエリア確保 + aria-label 必須)
import { CheckboxCell } from "@/admin/components/table";

<CheckboxCell
  checked={isSelected}
  onChange={handleChange}
  aria-label={`${entity.name} を選択`}
/>;
```

行 checkbox の `aria-label` は **意味ある識別子**（タイトル / 日時+スペース名 等）を渡し、`id.slice(0, 8)` 等の技術的識別子は禁止（SR ユーザーが対象判別不能）。

---

## フォントサイズ最小値（WCAG a11y）

公開ページの interactive / informative テキストは **`text-xs` (12px) 以上**。

- **`text-[10px]` 禁止** — WCAG a11y 一般推奨で 12px 未満は読みにくい
- **画像 overlay の photo credit のみ `text-[0.625rem]` (10px) まで例外** — 装飾的かつ scrim + paint-order stroke 併用で可読性担保
- **画像 overlay text は 12px 以上必須**（label/caption に `text-[0.55rem]` (8.8px) 禁止、editorial でも mobile 最小 `text-[0.75rem]` (12px)）→ 上記「画像上テキストの 3 層可読性保証」と整合

```tsx
// NG: 公開ページの informative text
<span className="text-[10px] uppercase tracking-[0.18em]">Scroll</span>

// OK: text-xs (12px) 以上
<span className="text-xs uppercase tracking-[0.18em]">Scroll</span>
```

検出 grep:

```bash
grep -rnE 'text-\[10px\]' src/app/\(public\)/ --include="*.tsx"
```

---

## Uppercase ラベル tracking 標準値

公開 uppercase ラベル / nav link / button text の tracking 標準値:

| 値                  | 用途                                                                             |
| ------------------- | -------------------------------------------------------------------------------- |
| `tracking-[0.18em]` | **canonical** — 公開ページ全 uppercase ラベル / nav link / editorial button text |
| `tracking-[0.12em]` | 日本語タブ / 中サイズラベル                                                      |
| `tracking-[0.08em]` | ブランド serif italic（ロゴ / ヘッダーブランド）                                 |

**禁止** — 中間値 `[0.1em]` / `[0.14em]` / `[0.15em]` / `[0.4em]` 等。新規実装時は上記 3 値のいずれかを選ぶ。

**editorial 例外**:

- heading 微調整 `[0.01em]` / `[0.02em]` — Cormorant Garamond の serif 用
- photo credit / image overlay caption — editorial intent あれば個別判断

検出 grep:

```bash
grep -rnE 'tracking-\[0\.[0-9]+em\]' src/app/\(public\)/ --include="*.tsx" \
  | grep -vE '(0\.08em|0\.12em|0\.18em|0\.01em|0\.02em|hero-demo|spaces-design-demo)'
```
