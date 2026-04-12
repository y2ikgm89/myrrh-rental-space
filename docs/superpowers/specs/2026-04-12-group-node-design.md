# GroupNode（ボックス装飾コンテナ）設計

> SWELL ライクなスタイルプリセット付き汎用コンテナブロック

## 概要

WordPress SWELL テーマの「ボックス装飾」に相当する機能を Lexical エディタに追加する。
純粋な装飾目的のコンテナ（CalloutNode = 意味的アイコンボックスとは併存）。

## スコープ

- **追加**: GroupNode（1ノード）、GroupPlugin、GroupInspectorPanel、CSS
- **変更なし**: CalloutNode、AccentColor システム、既存ノード

## GroupStyle プリセット（15種）

### ボーダー系（5種）

| style 値        | 見た目           | CSS 概要                                    |
| --------------- | ---------------- | ------------------------------------------- |
| `solid-border`  | 実線グレー枠     | `border: 1px solid` グレー                  |
| `dashed-border` | 破線グレー枠     | `border: 1px dashed` グレー                 |
| `solid-accent`  | 実線アクセント枠 | `border: 1px solid var(--accent)`           |
| `dashed-accent` | 破線アクセント枠 | `border: 1px dashed var(--accent)`          |
| `left-border`   | 左線のみ         | `border-left: 4px solid var(--accent)` + bg |

### 背景系（5種）

| style 値       | 見た目         | CSS 概要                                                |
| -------------- | -------------- | ------------------------------------------------------- |
| `filled`       | ベタ塗り       | `background: var(--accent); color: var(--accent-fg)`    |
| `filled-light` | 淡い背景       | `background: color-mix(var(--accent) 10%, transparent)` |
| `gray-bg`      | グレー背景     | `background: oklch(0.95 0 0)`（AccentColor 不使用）     |
| `stripe`       | ストライプ背景 | `repeating-linear-gradient` 斜線パターン                |
| `grid`         | 方眼背景       | `repeating-linear-gradient` 直交パターン                |

### 装飾系（5種）

| style 値    | 見た目     | CSS 概要                                           |
| ----------- | ---------- | -------------------------------------------------- |
| `stitch`    | ステッチ風 | `border: 2px dashed` + `outline: 1px dashed` 二重  |
| `emboss`    | エンボス風 | `box-shadow` 外影 + 内影                           |
| `kakko`     | 括弧装飾   | `::before`/`::after` で四隅に L 字型装飾           |
| `big-kakko` | 大括弧装飾 | 上下に大きな括弧線（`border-top`/`border-bottom`） |
| `note`      | 付箋風     | `border-left: 4px solid` + 淡い背景 + 折り目影     |

## ノード設計

### State

```typescript
// groupStyleState — 15 プリセットの union
export const groupStyleState = createState("groupStyle", {
  parse: (v: unknown): GroupStyle =>
    typeof v === "string" && isGroupStyle(v) ? v : "solid-border",
});

// colorState — AccentColor（既存パターン再利用）
export const colorState = createState("color", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});
```

### $config

```typescript
export class GroupNode extends ElementNode {
  override $config() {
    return this.config("group", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: groupStyleState },
        { flat: true, stateConfig: colorState },
      ],
    });
  }
}
```

### DOM 出力

```html
<!-- exportDOM / createDOM -->
<div data-group="true" data-group-style="solid-border" data-color="blue">
  <p>コンテンツ</p>
</div>
```

- `data-group="true"` — GroupNode 識別用（importDOM で使用）
- `data-group-style` — スタイルプリセット
- `data-color` — AccentColor（`default` の場合は属性なし）

### ElementNode 制約

| メソッド                | 値      | 理由                   |
| ----------------------- | ------- | ---------------------- |
| `isShadowRoot()`        | `true`  | 編集境界（キャレット） |
| `canBeEmpty()`          | `false` | 空コンテナ防止         |
| `collapseAtStart()`     | 実装    | Backspace でパラグラフ |
| `canInsertTextBefore()` | `false` | テキスト漏れ防止       |
| `canInsertTextAfter()`  | `false` | テキスト漏れ防止       |

### importDOM

```typescript
static override importDOM(): DOMConversionMap | null {
  return {
    div: (element: HTMLElement) => {
      if (element.hasAttribute("data-group")) {
        return { conversion: $convertGroupElement, priority: 2 };
      }
      return null;
    },
  };
}
```

`priority: 2` — `div` タグの汎用マッチを他ノードの `div` importDOM より優先する。

### updateDOM

```typescript
override updateDOM(prevNode: this, dom: HTMLElement): boolean {
  const styleChange = $getStateChange(this, prevNode, groupStyleState);
  if (styleChange !== null) {
    dom.setAttribute("data-group-style", styleChange[0]);
  }
  const colorChange = $getStateChange(this, prevNode, colorState);
  if (colorChange !== null) {
    const [newColor] = colorChange;
    if (newColor !== "default") {
      dom.setAttribute("data-color", newColor);
    } else {
      dom.removeAttribute("data-color");
    }
  }
  return false;
}
```

### Factory

```typescript
export function $createGroupNode(
  groupStyle: GroupStyle = "solid-border",
  color: AccentColor = "default",
): GroupNode {
  const node = $create(GroupNode);
  $setState(node, groupStyleState, groupStyle);
  $setState(node, colorState, color);
  return node;
}

export function $isGroupNode(
  node: LexicalNode | null | undefined,
): node is GroupNode {
  return node instanceof GroupNode;
}
```

## プラグイン設計

### GroupPlugin

- `INSERT_GROUP_COMMAND` — `{ groupStyle: GroupStyle }` ペイロード
- コマンドハンドラ: `$createGroupNode(style)` → `$insertNodeToNearestRoot` → 内部パラグラフ `selectEnd()`
- Arrow key escape: CalloutPlugin と同一パターン（`$onEscape`）
- Node transform: 空 GroupNode にパラグラフ自動追加

### 挿入方法

`insert-items.ts` に `type: "command"`（ダイアログ不要）で登録。デフォルト `solid-border` で挿入し、スタイル変更は InspectorPanel で行う。

```typescript
{
  id: "group",
  type: "command",
  label: "グループ",
  icon: IconBoxMultiple,
  keywords: ["group", "box", "container", "border", "background",
             "guruupu", "bokkusu", "waku"],
  category: "layout",
  showInToolbar: true,
  showInPicker: true,
  command: INSERT_GROUP_COMMAND,
  payload: { groupStyle: "solid-border" },
}
```

## InspectorPanel 設計

### GroupInspectorPanel

2セクション構成:

**1. スタイル選択**（カテゴリ別グリッド）

3カテゴリ（ボーダー / 背景 / 装飾）をラベル付きグリッドで表示。
各スタイルはミニプレビュー付きボタン（`data-group-style` を CSS で直接適用）。

```tsx
<InspectorSection title="スタイル">
  <Label className="text-xs">ボーダー</Label>
  <div className="grid grid-cols-5 gap-1">
    {BORDER_STYLES.map(style => (
      <StylePreviewButton key={style} style={style} ... />
    ))}
  </div>
  <Label className="text-xs">背景</Label>
  {/* 同様 */}
  <Label className="text-xs">装飾</Label>
  {/* 同様 */}
</InspectorSection>
```

**2. カラー選択**（ColorSwatchPicker）

既存の `ColorSwatchPicker` コンポーネントをそのまま使用。AccentColor 10色。

```tsx
<InspectorSection title="カラー">
  <ColorSwatchPicker
    value={currentColor}
    onChange={(color) => updateNode((n) => $setState(n, colorState, color))}
  />
</InspectorSection>
```

## CSS 設計（lexical-content.css）

### 基本スタイル

```css
[data-group] {
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
  padding: 1.25rem;
  border-radius: 0.5rem;
}

/* 内部最終要素の余白除去 */
[data-group] > :last-child {
  margin-bottom: 0;
}
```

### ボーダー系

```css
[data-group-style="solid-border"] {
  border: 1px solid oklch(0.8 0 0);
}
[data-group-style="dashed-border"] {
  border: 1px dashed oklch(0.8 0 0);
}
[data-group-style="solid-accent"] {
  border: 1px solid var(--accent, oklch(0.8 0 0));
}
[data-group-style="dashed-accent"] {
  border: 1px dashed var(--accent, oklch(0.8 0 0));
}
[data-group-style="left-border"] {
  border-left: 4px solid var(--accent, oklch(0.6 0 0));
  background-color: color-mix(
    in oklch,
    var(--accent, oklch(0.6 0 0)) 5%,
    transparent
  );
  border-radius: 0;
}
```

### 背景系

```css
[data-group-style="filled"] {
  background-color: var(--accent, oklch(0.5 0 0));
  color: var(--accent-fg, oklch(1 0 0));
}
[data-group-style="filled-light"] {
  background-color: color-mix(
    in oklch,
    var(--accent, oklch(0.5 0 0)) 10%,
    transparent
  );
}
[data-group-style="gray-bg"] {
  background-color: oklch(0.95 0 0);
}
[data-group-style="stripe"] {
  background-image: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 6px,
    color-mix(in oklch, var(--accent, oklch(0.7 0 0)) 8%, transparent) 6px,
    color-mix(in oklch, var(--accent, oklch(0.7 0 0)) 8%, transparent) 12px
  );
}
[data-group-style="grid"] {
  background-image:
    linear-gradient(oklch(0.9 0 0) 1px, transparent 1px),
    linear-gradient(90deg, oklch(0.9 0 0) 1px, transparent 1px);
  background-size: 20px 20px;
}
```

### 装飾系

```css
[data-group-style="stitch"] {
  border: 2px dashed var(--accent, oklch(0.7 0 0));
  outline: 1px solid var(--accent, oklch(0.7 0 0));
  outline-offset: -6px;
  padding: 1.5rem;
}
[data-group-style="emboss"] {
  box-shadow:
    0 2px 8px oklch(0 0 0 / 0.08),
    inset 0 1px 0 oklch(1 0 0 / 0.5);
  border: 1px solid oklch(0.88 0 0);
}
[data-group-style="kakko"] {
  position: relative;
  border: none;
  padding: 1.5rem 2rem;
}
[data-group-style="kakko"]::before,
[data-group-style="kakko"]::after {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  border-color: var(--accent, oklch(0.6 0 0));
  border-style: solid;
}
[data-group-style="kakko"]::before {
  top: 0;
  left: 0;
  border-width: 2px 0 0 2px;
}
[data-group-style="kakko"]::after {
  bottom: 0;
  right: 0;
  border-width: 0 2px 2px 0;
}
[data-group-style="big-kakko"] {
  border: none;
  border-top: 2px solid var(--accent, oklch(0.7 0 0));
  border-bottom: 2px solid var(--accent, oklch(0.7 0 0));
  border-radius: 0;
  padding: 1.25rem 0.5rem;
}
[data-group-style="note"] {
  border-left: 4px solid var(--accent, oklch(0.6 0 0));
  background-color: color-mix(
    in oklch,
    var(--accent, oklch(0.6 0 0)) 5%,
    transparent
  );
  border-radius: 0;
  box-shadow: 2px 2px 4px oklch(0 0 0 / 0.05);
}
```

## 登録箇所（9箇所チェックリスト）

| #   | ファイル                                  | 変更内容                                      |
| --- | ----------------------------------------- | --------------------------------------------- |
| 1   | `config/nodes.ts`                         | `GroupNode` を `EDITOR_NODES` に追加          |
| 2   | `nodes/index.ts`                          | barrel export                                 |
| 3   | `config/insert-items.ts`                  | `id: "group"` エントリ（category `"layout"`） |
| 4   | `plugins/index.ts`                        | `GroupPlugin` export                          |
| 5   | `config/inspector-registry.ts`            | `$isGroupNode` → `nodeType: "group"` 追加     |
| 6   | `inspector/hooks/inspectable-nodes.ts`    | `"group"` を `InspectableNodeType` に追加     |
| 7   | `inspector/InspectorSidebar.tsx`          | `case "group":` → `GroupInspectorPanel`       |
| 8   | `inspector/panels/index.ts`               | panel export                                  |
| 9   | `__tests__/.../inspectable-nodes.test.ts` | カウント +1、`expectedTypes` に `"group"`     |

## ファイル一覧（新規作成）

| ファイル                                   | 行数目安 |
| ------------------------------------------ | -------- |
| `nodes/GroupNode.tsx`                      | ~120     |
| `plugins/GroupPlugin.tsx`                  | ~100     |
| `inspector/panels/GroupInspectorPanel.tsx` | ~100     |
| `lexical-content.css`（追記）              | ~120     |

## CalloutNode との棲み分け

| 観点     | CalloutNode            | GroupNode              |
| -------- | ---------------------- | ---------------------- |
| 目的     | 意味的（警告・情報等） | 装飾的（見た目のみ）   |
| アイコン | あり（CSS ::before）   | なし                   |
| スタイル | 4タイプ固定            | 15プリセット切替可能   |
| カラー   | タイプ別固定色         | AccentColor 10色自由   |
| 用途     | 注意書き・アラート     | 見出し装飾・強調・区分 |

## テスト

- `inspectable-nodes.test.ts` のカウント更新
- 既存テストへの影響なし（新規ノード追加のみ）
