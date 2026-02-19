# Lexical エディタ統一アクセントカラーシステム

**日付**: 2026-02-18
**種別**: 破壊的変更 / 新機能
**ステータス**: 設計承認済み

---

## 概要

Lexical エディタの Block Insert コンポーネント（Steps・PullQuote・Tabs・Collapsible）に、統一されたアクセントカラー選択機能を追加する。

- **CSS-first**: `data-color` 属性 → `--accent` / `--accent-fg` CSS 変数の継承チェーン
- **単一の型定義**: 全ブロックで共通の `AccentColor` 型・定数・型ガードを使用
- **共通 UI**: `ColorSwatchPicker` コンポーネントを全インスペクタパネルで共有
- **破壊的変更**: Collapsible の旧 3-state 色システム（`titleColorState` + `titleCustomColorState` + `titleCustomLightState`）を削除し、`collapsibleColorState` 1 つに置き換える

---

## カラーパレット（10色）

| キー | 表示名 | OKLCH値 | 前景色 |
|------|--------|---------|--------|
| `default` | デフォルト | `var(--color-primary)` | `var(--color-primary-foreground)` |
| `blue` | ブルー | `oklch(0.55 0.20 255)` | `oklch(1 0 0)` |
| `teal` | ティール | `oklch(0.60 0.15 195)` | `oklch(1 0 0)` |
| `green` | グリーン | `oklch(0.58 0.18 142)` | `oklch(1 0 0)` |
| `yellow` | イエロー | `oklch(0.82 0.17 90)` | `oklch(0.15 0 0)` |
| `orange` | オレンジ | `oklch(0.72 0.18 55)` | `oklch(1 0 0)` |
| `red` | レッド | `oklch(0.55 0.22 25)` | `oklch(1 0 0)` |
| `pink` | ピンク | `oklch(0.65 0.22 350)` | `oklch(1 0 0)` |
| `purple` | パープル | `oklch(0.55 0.20 300)` | `oklch(1 0 0)` |
| `slate` | スレート | `oklch(0.52 0.02 250)` | `oklch(1 0 0)` |

---

## CSSアーキテクチャ

### 1. 共通アクセントカラートークン（lexical-content.css に追加）

```css
/* --- Accent Color Tokens ---
 * data-color 属性を持つ任意のブロックに適用。
 * --accent / --accent-fg を子要素が継承して使用する。
 */
[data-color="default"] { --accent: var(--color-primary); --accent-fg: var(--color-primary-foreground); }
[data-color="blue"]    { --accent: oklch(0.55 0.20 255); --accent-fg: oklch(1 0 0); }
[data-color="teal"]    { --accent: oklch(0.60 0.15 195); --accent-fg: oklch(1 0 0); }
[data-color="green"]   { --accent: oklch(0.58 0.18 142); --accent-fg: oklch(1 0 0); }
[data-color="yellow"]  { --accent: oklch(0.82 0.17 90);  --accent-fg: oklch(0.15 0 0); }
[data-color="orange"]  { --accent: oklch(0.72 0.18 55);  --accent-fg: oklch(1 0 0); }
[data-color="red"]     { --accent: oklch(0.55 0.22 25);  --accent-fg: oklch(1 0 0); }
[data-color="pink"]    { --accent: oklch(0.65 0.22 350); --accent-fg: oklch(1 0 0); }
[data-color="purple"]  { --accent: oklch(0.55 0.20 300); --accent-fg: oklch(1 0 0); }
[data-color="slate"]   { --accent: oklch(0.52 0.02 250); --accent-fg: oklch(1 0 0); }
```

### 2. 各ブロックでの利用パターン

```css
/* Steps: バッジ/円の色 */
[data-steps] > [data-step]::before {
  background-color: var(--accent, var(--color-primary));
  color: var(--accent-fg, var(--color-primary-foreground));
}

/* PullQuote: アクセントボーダー/グラデーション */
[data-pull-quote] {
  border-left-color: var(--accent, var(--color-primary));
}

/* Tabs: アクティブインジケーター */
[data-tabs-active-indicator] {
  background-color: var(--accent, var(--color-primary));
}

/* Collapsible: タイトルバー（旧 --collapsible-title-bg 置き換え） */
[data-collapsible] [data-collapsible-title] {
  background-color: var(--accent, var(--color-primary));
  color: var(--accent-fg, var(--color-primary-foreground));
}
```

---

## 新規作成ファイル

### 1. `config/accent-colors.ts`

```typescript
// 共有型・定数・型ガード・スウォッチ値
export type AccentColor =
  | 'default' | 'blue' | 'teal' | 'green' | 'yellow'
  | 'orange' | 'red' | 'pink' | 'purple' | 'slate'

export const ACCENT_COLORS: readonly AccentColor[] = [
  'default', 'blue', 'teal', 'green', 'yellow',
  'orange', 'red', 'pink', 'purple', 'slate',
] as const

export const isAccentColor = createEnumGuard<AccentColor>(ACCENT_COLORS)

// スウォッチUIで使う実際のCSS色値
export const ACCENT_COLOR_SWATCHES: Record<AccentColor, string> = {
  default:  'var(--color-primary)',
  blue:     'oklch(0.55 0.20 255)',
  teal:     'oklch(0.60 0.15 195)',
  green:    'oklch(0.58 0.18 142)',
  yellow:   'oklch(0.82 0.17 90)',
  orange:   'oklch(0.72 0.18 55)',
  red:      'oklch(0.55 0.22 25)',
  pink:     'oklch(0.65 0.22 350)',
  purple:   'oklch(0.55 0.20 300)',
  slate:    'oklch(0.52 0.02 250)',
}
```

### 2. `inspector/ColorSwatchPicker.tsx`

- 10色のスウォッチグリッド（2行 × 5列）
- 選択中の色にリング表示（`ring-2 ring-offset-1`）
- `default` はテーマカラー（`var(--color-primary)`）を表示
- ラベルは `tooltip` で表示（`title` 属性）
- Props: `{ value: AccentColor; onChange: (color: AccentColor) => void; label?: string }`

---

## 変更ファイル一覧

### Nodes（4ファイル）

| ファイル | 追加 | 削除 |
|---------|------|------|
| `nodes/StepsContainerNode.tsx` | `stepsColorState: AccentColor` / `data-color` 属性 | なし |
| `nodes/PullQuoteNode.tsx` | `pullQuoteColorState: AccentColor` / `data-color` 属性 | なし |
| `nodes/TabsContainerNode.tsx` | `tabsColorState: AccentColor` / `data-color` 属性 | なし |
| `nodes/CollapsibleContainerNode.tsx` | `collapsibleColorState: AccentColor` / `data-color` 属性 | `titleColorState`, `titleCustomColorState`, `titleCustomLightState`, `applyTitleColorToDOM()`, 関連 CSS 変数注入 |

### Inspector Panels（4ファイル）

| ファイル | 変更内容 |
|---------|---------|
| `inspector/panels/StepsInspectorPanel.tsx` | `ColorSwatchPicker` を「スタイル」セクションに追加 |
| `inspector/panels/PullQuoteInspectorPanel.tsx` | `ColorSwatchPicker` を追加 |
| `inspector/panels/TabsInspectorPanel.tsx` | `ColorSwatchPicker` を追加 |
| `inspector/panels/CollapsibleInspectorPanel.tsx` | 旧 `<Select>` + `<input type="color">` + `<Switch>` を `ColorSwatchPicker` 1つに置き換え |

### Config（2ファイル）

| ファイル | 変更内容 |
|---------|---------|
| `config/node-labels.ts` | `ACCENT_COLOR_LABELS: Record<AccentColor, string>` 追加 |
| `shared/styles/lexical-content.css` | `[data-color]` トークン定義追加、各ブロックの `var(--color-primary)` を `var(--accent, var(--color-primary))` に更新 |

---

## 破壊的変更の詳細

### CollapsibleContainerNode

**削除する State:**
- `titleColorState` (`CollapsibleTitleColor` = semantic色 7種類)
- `titleCustomColorState` (hex文字列)
- `titleCustomLightState` (boolean)

**削除する関数:**
- `applyTitleColorToDOM()` (インラインスタイル注入ヘルパー)

**削除する型:**
- `CollapsibleTitleColor`
- `COLLAPSIBLE_TITLE_COLORS`
- `COLLAPSIBLE_TITLE_COLOR_LABELS`（node-labels.ts から）

**影響**: 既存の Collapsible ブロックで titleColor を設定していたものは `default`（テーマプライマリ）にリセットされる。

---

## スキップするブロック（理由）

| ブロック | 理由 |
|---------|------|
| **Callout** | `type`（info/warning/success/error）が意味論的な色と 1:1 対応。別軸の色追加は UX 上混乱を招く |
| **Button** | `variant`（primary/secondary/outline）が色制御済み |
| **Layout** | 中立コンテナ。色の概念が意味をなさない |
| **Image / YouTube / Bookmark 等** | メディア系。アクセントカラーの適用場所がない |

---

## 実装順序

1. `config/accent-colors.ts` 作成
2. `inspector/ColorSwatchPicker.tsx` 作成
3. `config/node-labels.ts` 更新
4. Node ファイル 4つ更新（Steps → PullQuote → Tabs → Collapsible）
5. Inspector Panel 4つ更新（同順）
6. `lexical-content.css` 更新（`[data-color]` トークン + 各ブロック `var(--accent)` 化）
7. `bun run validate` で型・lint 検証
