# Table Inspector Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Lexical エディタのテーブルブロックに WordPress コア相当の Inspector サイドパネルを追加する（スタイル・カラー・Border・セル背景色など）。

**Architecture:** `@lexical/table` の `TableNode` / `TableCellNode` を継承した `CustomTableNode` / `CustomTableCellNode` を作成し、Lexical 公式の `$config` + NodeState API で状態管理する。既存の `TableNode` は完全に置換（破壊的変更）。DB 内の既存テーブル JSON は移行スクリプトで変換する。

**Tech Stack:** Lexical 0.41+（`$config`/NodeState API）、`@lexical/table`（継承元）、bun:test（型チェック代替）、Prisma（DBマイグレーション）

---

## 参照ファイル

| ファイル                                         | 用途                                   |
| ------------------------------------------------ | -------------------------------------- |
| `nodes/PricingTableNode.tsx`                     | $config + NodeState API の実装パターン |
| `inspector/panels/PricingPlanInspectorPanel.tsx` | Inspector パネル実装パターン           |
| `inspector/hooks/use-node-updater.ts`            | `useNodeUpdater` フック                |
| `inspector/components/ColorSwatchPicker.tsx`     | スウォッチ実装パターン                 |
| `inspector/InspectorSidebar.tsx`                 | switch/case でのパネル選択             |
| `inspector/hooks/inspectable-nodes.ts`           | Discriminated Union の型定義           |
| `config/inspector-registry.ts`                   | 型ガード登録                           |
| `config/nodes.ts`                                | EDITOR_NODES 配列                      |
| `plugins/TableInsertPlugin.tsx`                  | 既存テーブル挿入プラグイン             |
| `plugins/TableActionMenuPlugin.tsx`              | 既存テーブル操作プラグイン             |
| `config/type-guards.ts`                          | `parseString`, `parseBoolean` 等       |

**注意:** `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/` を
以降 `[lexical]/` と省略する。

---

## Task 1: CustomTableNode を作成する

**Files:**

- Create: `[lexical]/nodes/CustomTableNode.tsx`

### Step 1: ファイルを作成する

```typescript
// [lexical]/nodes/CustomTableNode.tsx
import {
  $create,
  $getState,
  $getStateChange,
  $setState,
  type EditorConfig,
  type LexicalNode,
  createState,
} from "lexical";
import { TableNode, type TableSelectionShape } from "@lexical/table";
import { parseBoolean, parseString } from "../config/type-guards";

// ===== State 型 =====

export type TableStyle = "default" | "stripes";

function parseTableStyle(v: unknown): TableStyle {
  return v === "stripes" ? "stripes" : "default";
}

function parseBorderWidth(v: unknown): number {
  const n =
    typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 1;
}

// ===== State 定義 =====

export const tableStyleState = createState("tableStyle", {
  parse: parseTableStyle,
});
export const tableHasHeaderState = createState("hasHeader", {
  parse: parseBoolean,
});
export const tableHasFooterState = createState("hasFooter", {
  parse: parseBoolean,
});
export const tableFixedLayoutState = createState("fixedLayout", {
  parse: parseBoolean,
});
export const tableBackgroundColorState = createState("backgroundColor", {
  parse: parseString,
});
export const tableBorderColorState = createState("borderColor", {
  parse: parseString,
});
export const tableBorderWidthState = createState("borderWidth", {
  parse: parseBorderWidth,
});
export const tableHtmlAnchorState = createState("htmlAnchor", {
  parse: parseString,
});
export const tableCssClassState = createState("cssClass", {
  parse: parseString,
});

// ===== CustomTableNode =====

export class CustomTableNode extends TableNode {
  $config() {
    return this.config("custom-table", {
      extends: TableNode,
      stateConfigs: [
        { flat: true, stateConfig: tableStyleState },
        { flat: true, stateConfig: tableHasHeaderState },
        { flat: true, stateConfig: tableHasFooterState },
        { flat: true, stateConfig: tableFixedLayoutState },
        { flat: true, stateConfig: tableBackgroundColorState },
        { flat: true, stateConfig: tableBorderColorState },
        { flat: true, stateConfig: tableBorderWidthState },
        { flat: true, stateConfig: tableHtmlAnchorState },
        { flat: true, stateConfig: tableCssClassState },
      ],
    });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    this._applyAttributes(dom);
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    if (super.updateDOM(prevNode, dom, config)) {
      return true;
    }
    this._applyAttributes(dom);
    return false;
  }

  _applyAttributes(dom: HTMLElement): void {
    const style = $getState(this, tableStyleState);
    const fixedLayout = $getState(this, tableFixedLayoutState);
    const backgroundColor = $getState(this, tableBackgroundColorState);
    const borderColor = $getState(this, tableBorderColorState);
    const borderWidth = $getState(this, tableBorderWidthState);
    const htmlAnchor = $getState(this, tableHtmlAnchorState);
    const cssClass = $getState(this, tableCssClassState);

    // スタイルプリセット
    dom.dataset["tableStyle"] = style;

    // セル幅均等
    if (fixedLayout) {
      dom.style.tableLayout = "fixed";
      dom.style.width = "100%";
    } else {
      dom.style.removeProperty("table-layout");
      dom.style.removeProperty("width");
    }

    // 背景色
    dom.style.backgroundColor = backgroundColor;

    // 枠線
    if (borderColor && borderWidth > 0) {
      dom.style.setProperty("--table-border-color", borderColor);
      dom.style.setProperty("--table-border-width", `${borderWidth}px`);
    } else {
      dom.style.removeProperty("--table-border-color");
      dom.style.removeProperty("--table-border-width");
    }

    // HTML アンカー
    if (htmlAnchor) {
      dom.id = htmlAnchor;
    } else {
      dom.removeAttribute("id");
    }

    // CSS クラス（前回値と差分で追加/削除）
    const prev = dom.dataset["cssClass"] ?? "";
    prev
      .split(" ")
      .filter(Boolean)
      .forEach((c) => dom.classList.remove(c));
    if (cssClass) {
      cssClass
        .split(" ")
        .filter(Boolean)
        .forEach((c) => dom.classList.add(c));
    }
    dom.dataset["cssClass"] = cssClass;
  }

  exportDOM(): { element: HTMLElement } {
    const result = super.exportDOM();
    const element = result.element as HTMLElement;
    this._applyAttributes(element);
    return { element };
  }

  static override importDOM() {
    return TableNode.importDOM?.() ?? null;
  }
}

// ===== ファクトリ関数 =====

export function $createCustomTableNode(): CustomTableNode {
  const node = $create(CustomTableNode);
  $setState(node, tableStyleState, "default");
  $setState(node, tableHasHeaderState, true);
  $setState(node, tableHasFooterState, false);
  $setState(node, tableFixedLayoutState, true);
  $setState(node, tableBackgroundColorState, "");
  $setState(node, tableBorderColorState, "");
  $setState(node, tableBorderWidthState, 1);
  $setState(node, tableHtmlAnchorState, "");
  $setState(node, tableCssClassState, "");
  return node;
}

export function $isCustomTableNode(
  node: LexicalNode | null | undefined,
): node is CustomTableNode {
  return node instanceof CustomTableNode;
}
```

### Step 2: 型チェックを実行する

```bash
bun run type-check
```

期待: エラーなし（`CustomTableNode.tsx` のみ変更なので他はクリーン）。
エラーが出た場合: `$config()` の引数型や `createState` の型定義を `PricingTableNode.tsx` のパターンと照合する。

### Step 3: コミットする

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/nodes/CustomTableNode.tsx
git commit -m "feat(lexical): add CustomTableNode with NodeState API"
```

---

## Task 2: CustomTableCellNode を作成する

**Files:**

- Create: `[lexical]/nodes/CustomTableCellNode.tsx`

### Step 1: ファイルを作成する

```typescript
// [lexical]/nodes/CustomTableCellNode.tsx
import {
  $create,
  $getState,
  $getStateChange,
  $setState,
  type EditorConfig,
  type LexicalNode,
  createState,
} from "lexical";
import {
  TableCellNode,
  TableCellHeaderStates,
  type TableCellHeaderState,
} from "@lexical/table";
import { parseString } from "../config/type-guards";

// ===== State 定義 =====

export const cellBackgroundColorState = createState("cellBg", {
  parse: parseString,
});

// ===== CustomTableCellNode =====

export class CustomTableCellNode extends TableCellNode {
  $config() {
    return this.config("custom-tablecell", {
      extends: TableCellNode,
      stateConfigs: [{ flat: true, stateConfig: cellBackgroundColorState }],
    });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    const bg = $getState(this, cellBackgroundColorState);
    if (bg) {
      dom.style.backgroundColor = bg;
    }
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    if (super.updateDOM(prevNode, dom, config)) {
      return true;
    }
    const change = $getStateChange(this, prevNode, cellBackgroundColorState);
    if (change !== null) {
      dom.style.backgroundColor = change[0] ?? "";
    }
    return false;
  }

  exportDOM(): { element: HTMLElement } {
    const result = super.exportDOM();
    const element = result.element as HTMLElement;
    const bg = $getState(this, cellBackgroundColorState);
    if (bg) {
      element.style.backgroundColor = bg;
    }
    return { element };
  }

  static override importDOM() {
    return TableCellNode.importDOM?.() ?? null;
  }
}

// ===== ファクトリ関数 =====

export function $createCustomTableCellNode(
  headerState: TableCellHeaderState = TableCellHeaderStates.NO_STATUS,
  colSpan = 1,
  width?: number,
): CustomTableCellNode {
  const node = $create(CustomTableCellNode);
  // TableCellNode の既存プロパティを設定
  // NOTE: TableCellNode は __headerState, __colSpan, __rowSpan, __width を持つが
  //       これらは TableCellNode の内部実装に依存するため、
  //       $createTableCellNode と同等の初期化が必要。
  // 実装時に @lexical/table の $createTableCellNode の引数を確認して合わせること。
  $setState(node, cellBackgroundColorState, "");
  return node;
}

export function $isCustomTableCellNode(
  node: LexicalNode | null | undefined,
): node is CustomTableCellNode {
  return node instanceof CustomTableCellNode;
}
```

**⚠️ 実装時の注意:** `$createCustomTableCellNode` は `$createTableCellNode` の引数を
`@lexical/table` のソースで確認し、同じ初期化ロジックを適用すること。
`TableCellNode` のコンストラクタが protected な場合は `$create(CustomTableCellNode)` 後に
setter メソッドで初期化する。

### Step 2: 型チェックを実行する

```bash
bun run type-check
```

### Step 3: コミットする

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/nodes/CustomTableCellNode.tsx
git commit -m "feat(lexical): add CustomTableCellNode with NodeState API"
```

---

## Task 3: ノード登録とプラグインを更新する

**Files:**

- Modify: `[lexical]/config/nodes.ts`
- Modify: `[lexical]/plugins/TableInsertPlugin.tsx`
- Modify: `[lexical]/plugins/TableActionMenuPlugin.tsx`

### Step 1: `config/nodes.ts` を更新する

```typescript
// 変更前
import { TableNode, TableRowNode, TableCellNode } from "@lexical/table";

// 変更後
import { TableRowNode } from "@lexical/table";
import { CustomTableNode } from "../nodes/CustomTableNode";
import { CustomTableCellNode } from "../nodes/CustomTableCellNode";
```

`EDITOR_NODES` 配列で `TableNode` → `CustomTableNode`、`TableCellNode` → `CustomTableCellNode` に置換する。
`TableRowNode` はそのまま（変更なし）。

### Step 2: `TableInsertPlugin.tsx` を更新する

`INSERT_TABLE_COMMAND` への依存を取り除き、カスタムノードで構築する独自ファクトリを使う。

```typescript
// [lexical]/plugins/TableInsertPlugin.tsx の挿入処理を置換

import { $createParagraphNode, $getRoot, $insertNodes } from "lexical";
import { TableRowNode, TableCellHeaderStates } from "@lexical/table";
import {
  $createCustomTableNode,
  $setState,
  tableHasHeaderState,
} from "../nodes/CustomTableNode";
import { $createCustomTableCellNode } from "../nodes/CustomTableCellNode";

function $insertCustomTable(rows: number, cols: number): void {
  const tableNode = $createCustomTableNode();

  for (let r = 0; r < rows; r++) {
    const rowNode = new TableRowNode();
    const isHeaderRow = r === 0; // hasHeader がデフォルト true

    for (let c = 0; c < cols; c++) {
      const headerState = isHeaderRow
        ? TableCellHeaderStates.ROW
        : TableCellHeaderStates.NO_STATUS;
      const cellNode = $createCustomTableCellNode(headerState);
      cellNode.append($createParagraphNode());
      rowNode.append(cellNode);
    }
    tableNode.append(rowNode);
  }

  $insertNodes([tableNode]);
}
```

ダイアログの Submit ハンドラを `editor.update(() => { $insertCustomTable(rows, cols) })` に変更する。
`INSERT_TABLE_COMMAND` の `dispatchCommand` 呼び出しを削除する。

### Step 3: `TableActionMenuPlugin.tsx` を更新する

`$isTableCellNode` → `$isCustomTableCellNode` に置換する。
型インポートと型ガードを更新する。
行・列の挿入操作は `@lexical/table` の `INSERT_TABLE_ROW_AT_SELECTION`・`INSERT_TABLE_COLUMN_AT_SELECTION` 等のコマンドが `TableRowNode` / セルの型に依存する場合は注意が必要。
実装時に `@lexical/table` の各コマンドが `CustomTableCellNode` を `TableCellNode` のサブクラスとして認識するか確認する（`instanceof` チェックは継承で通過するはず）。

### Step 4: 型チェックを実行する

```bash
bun run type-check
```

### Step 5: 開発サーバーで動作確認する

```bash
bun dev
```

エディタでテーブルを挿入できること、行・列の操作ができることを確認する。

### Step 6: コミットする

```bash
git add -p  # ノード登録・プラグイン変更を選択的にステージ
git commit -m "feat(lexical): replace TableNode with CustomTableNode in editor registration and plugins"
```

---

## Task 4: TableColorPicker コンポーネントを作成する

**Files:**

- Create: `[lexical]/inspector/components/TableColorPicker.tsx`

### Step 1: admin.css のテーマカラー変数を確認する

```bash
grep -n "^\s*--color-" src/app/\(admin\)/_styles/admin.css | head -30
```

インスペクターで使う色のリストを確認する。カラーパレットのスウォッチに使用するCSS変数名を把握する。

### Step 2: ファイルを作成する

```typescript
// [lexical]/inspector/components/TableColorPicker.tsx
'use client'

import { Label } from '@/admin/components/ui/label'
import { Input } from '@/admin/components/ui/input'
import { Button } from '@/admin/components/ui/button'
import { cn } from '@/shared/lib/utils'

// 管理画面テーマカラーのパレット定義
// admin.css の CSS 変数から引き出した色を使用
const THEME_PALETTE = [
  { label: 'なし', value: '', style: 'transparent' },
  { label: 'Gray 50', value: 'var(--color-gray-50)', style: 'var(--color-gray-50)' },
  { label: 'Gray 100', value: 'var(--color-gray-100)', style: 'var(--color-gray-100)' },
  { label: 'Gray 200', value: 'var(--color-gray-200)', style: 'var(--color-gray-200)' },
  // NOTE: 実装時に admin.css を確認して適切な色を追加すること
  // 特に bg-muted, bg-card, bg-primary 等のセマンティックカラーが有用
] as const

interface TableColorPickerProps {
  value: string
  onChange: (value: string) => void
  label?: string
}

export function TableColorPicker({
  value,
  onChange,
  label,
}: TableColorPickerProps) {
  // HEX 入力の一時値（確定前のバッファ）
  const [hexInput, setHexInput] = useState(value)

  // value が外部から変更された時に同期
  useEffect(() => {
    setHexInput(value)
  }, [value])

  const handleHexBlur = () => {
    // 空文字はそのまま（「なし」として扱う）
    if (hexInput === '') {
      onChange('')
      return
    }
    // "#" prefix を正規化
    const normalized = hexInput.startsWith('#') ? hexInput : `#${hexInput}`
    // 簡易バリデーション: 3 or 6 or 8桁 HEX
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(normalized)) {
      onChange(normalized)
      setHexInput(normalized)
    } else {
      // 不正な値はリセット
      setHexInput(value)
    }
  }

  return (
    <div className="space-y-2">
      {label && <Label className="text-xs">{label}</Label>}

      {/* テーマカラーパレット */}
      <div className="grid grid-cols-5 gap-1.5">
        {THEME_PALETTE.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            title={swatch.label}
            onClick={() => {
              onChange(swatch.value)
              setHexInput(swatch.value)
            }}
            className={cn(
              'h-6 w-full rounded border border-border transition-shadow',
              value === swatch.value && 'ring-2 ring-ring ring-offset-1',
            )}
            style={
              swatch.value === ''
                ? {
                    background:
                      'repeating-conic-gradient(var(--color-muted) 0% 25%, transparent 0% 50%) 0 / 8px 8px',
                  }
                : { backgroundColor: swatch.style }
            }
            aria-label={swatch.label}
            aria-pressed={value === swatch.value}
          />
        ))}
      </div>

      {/* カスタムカラー入力 */}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#ffffff'}
          onChange={(e) => {
            onChange(e.target.value)
            setHexInput(e.target.value)
          }}
          className="h-7 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
          title="カスタムカラーを選択"
        />
        <Input
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={handleHexBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleHexBlur()
          }}
          placeholder="#000000"
          className="h-7 font-mono text-xs"
        />
        {value && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              onChange('')
              setHexInput('')
            }}
          >
            なし
          </Button>
        )}
      </div>
    </div>
  )
}
```

**NOTE:** `useState` と `useEffect` の import を忘れずに追加すること。

### Step 3: 型チェックを実行する

```bash
bun run type-check
```

### Step 4: コミットする

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/components/TableColorPicker.tsx
git commit -m "feat(lexical): add TableColorPicker component with palette + hex input"
```

---

## Task 5: TableInspectorPanel を作成する

**Files:**

- Create: `[lexical]/inspector/panels/TableInspectorPanel.tsx`

### Step 1: ファイルを作成する

```typescript
// [lexical]/inspector/panels/TableInspectorPanel.tsx
'use client'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getState } from 'lexical'
import { Input } from '@/admin/components/ui/input'
import { Label } from '@/admin/components/ui/label'
import { Switch } from '@/admin/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui/select'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorSection } from '../InspectorSection'
import { TableColorPicker } from '../components/TableColorPicker'
import { useNodeUpdater } from '../hooks/use-node-updater'
import {
  $isCustomTableNode,
  tableStyleState,
  tableHasHeaderState,
  tableHasFooterState,
  tableFixedLayoutState,
  tableBackgroundColorState,
  tableBorderColorState,
  tableBorderWidthState,
  tableHtmlAnchorState,
  tableCssClassState,
  type TableStyle,
  type CustomTableNode,
} from '../../nodes/CustomTableNode'
import type { NodeKey } from 'lexical'

interface TableInspectorPanelProps {
  nodeKey: NodeKey
  node: CustomTableNode
}

const BORDER_WIDTH_OPTIONS = [
  { label: 'なし', value: '0' },
  { label: '1px', value: '1' },
  { label: '2px', value: '2' },
  { label: '3px', value: '3' },
]

export function TableInspectorPanel({
  nodeKey,
  node,
}: TableInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isCustomTableNode)

  const {
    tableStyle,
    hasHeader,
    hasFooter,
    fixedLayout,
    backgroundColor,
    borderColor,
    borderWidth,
    htmlAnchor,
    cssClass,
  } = editor.getEditorState().read(() => ({
    tableStyle: $getState(node, tableStyleState),
    hasHeader: $getState(node, tableHasHeaderState),
    hasFooter: $getState(node, tableHasFooterState),
    fixedLayout: $getState(node, tableFixedLayoutState),
    backgroundColor: $getState(node, tableBackgroundColorState),
    borderColor: $getState(node, tableBorderColorState),
    borderWidth: $getState(node, tableBorderWidthState),
    htmlAnchor: $getState(node, tableHtmlAnchorState),
    cssClass: $getState(node, tableCssClassState),
  }))

  return (
    <div>
      <InspectorHeader title="テーブル" />

      <InspectorSection title="スタイル">
        <div className="space-y-3">
          {/* 表示スタイル */}
          <div className="space-y-1.5">
            <Label className="text-xs">表示スタイル</Label>
            <Select
              value={tableStyle}
              onValueChange={(v) =>
                updateNode((n) => {
                  $setState(n, tableStyleState, v as TableStyle)
                })
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">デフォルト</SelectItem>
                <SelectItem value="stripes">縞模様</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ヘッダー行 */}
          <div className="flex items-center justify-between">
            <Label className="text-xs">ヘッダー行</Label>
            <Switch
              checked={hasHeader}
              onCheckedChange={(checked) =>
                updateNode((n) => {
                  $setState(n, tableHasHeaderState, checked)
                })
              }
            />
          </div>

          {/* フッター行 */}
          <div className="flex items-center justify-between">
            <Label className="text-xs">フッター行</Label>
            <Switch
              checked={hasFooter}
              onCheckedChange={(checked) =>
                updateNode((n) => {
                  $setState(n, tableHasFooterState, checked)
                })
              }
            />
          </div>

          {/* セル幅均等 */}
          <div className="flex items-center justify-between">
            <Label className="text-xs">セル幅均等</Label>
            <Switch
              checked={fixedLayout}
              onCheckedChange={(checked) =>
                updateNode((n) => {
                  $setState(n, tableFixedLayoutState, checked)
                })
              }
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="カラー">
        <div className="space-y-4">
          <TableColorPicker
            label="背景色"
            value={backgroundColor}
            onChange={(v) =>
              updateNode((n) => {
                $setState(n, tableBackgroundColorState, v)
              })
            }
          />
          <TableColorPicker
            label="枠線色"
            value={borderColor}
            onChange={(v) =>
              updateNode((n) => {
                $setState(n, tableBorderColorState, v)
              })
            }
          />

          {/* 枠線幅 */}
          <div className="space-y-1.5">
            <Label className="text-xs">枠線幅</Label>
            <Select
              value={String(borderWidth)}
              onValueChange={(v) =>
                updateNode((n) => {
                  $setState(n, tableBorderWidthState, parseInt(v, 10))
                })
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BORDER_WIDTH_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="詳細" defaultOpen={false}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">HTML アンカー</Label>
            <Input
              value={htmlAnchor}
              onChange={(e) =>
                updateNode((n) => {
                  $setState(n, tableHtmlAnchorState, e.target.value)
                })
              }
              placeholder="my-table"
              className="h-7 font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">CSS クラス</Label>
            <Input
              value={cssClass}
              onChange={(e) =>
                updateNode((n) => {
                  $setState(n, tableCssClassState, e.target.value)
                })
              }
              placeholder="custom-class"
              className="h-7 font-mono text-xs"
            />
          </div>
        </div>
      </InspectorSection>
    </div>
  )
}
```

**NOTE:** `$setState` のインポートを `lexical` から追加すること。

### Step 2: 型チェックを実行する

```bash
bun run type-check
```

### Step 3: コミットする

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/panels/TableInspectorPanel.tsx
git commit -m "feat(lexical): add TableInspectorPanel"
```

---

## Task 6: TableCellInspectorPanel を作成する

**Files:**

- Create: `[lexical]/inspector/panels/TableCellInspectorPanel.tsx`

### Step 1: ファイルを作成する

```typescript
// [lexical]/inspector/panels/TableCellInspectorPanel.tsx
'use client'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getState, $setState } from 'lexical'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorSection } from '../InspectorSection'
import { TableColorPicker } from '../components/TableColorPicker'
import { useNodeUpdater } from '../hooks/use-node-updater'
import {
  $isCustomTableCellNode,
  cellBackgroundColorState,
  type CustomTableCellNode,
} from '../../nodes/CustomTableCellNode'
import type { NodeKey } from 'lexical'

interface TableCellInspectorPanelProps {
  nodeKey: NodeKey
  node: CustomTableCellNode
}

export function TableCellInspectorPanel({
  nodeKey,
  node,
}: TableCellInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isCustomTableCellNode)

  const backgroundColor = editor.getEditorState().read(() =>
    $getState(node, cellBackgroundColorState),
  )

  return (
    <div>
      <InspectorHeader title="テーブルセル" />

      <InspectorSection title="カラー">
        <TableColorPicker
          label="セル背景色"
          value={backgroundColor}
          onChange={(v) =>
            updateNode((n) => {
              $setState(n, cellBackgroundColorState, v)
            })
          }
        />
      </InspectorSection>
    </div>
  )
}
```

### Step 2: 型チェックを実行する

```bash
bun run type-check
```

### Step 3: コミットする

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/panels/TableCellInspectorPanel.tsx
git commit -m "feat(lexical): add TableCellInspectorPanel"
```

---

## Task 7: Inspector 配線をする（5ファイル変更）

**Files:**

- Modify: `[lexical]/inspector/hooks/inspectable-nodes.ts`
- Modify: `[lexical]/config/inspector-registry.ts`
- Modify: `[lexical]/inspector/InspectorSidebar.tsx`
- Modify: `[lexical]/inspector/hooks/use-selected-node.ts`

### Step 1: `inspectable-nodes.ts` に型を追加する

`InspectableNodeType` ユニオンに `'table' | 'tableCell'` を追加する。

```typescript
// 追加する union メンバー（既存の列挙の末尾に追加）
| 'table'
| 'tableCell'
```

`SelectedNodeInfo` Discriminated Union に対応するメンバーを追加する:

```typescript
| { nodeType: 'table'; node: CustomTableNode; nodeKey: NodeKey }
| { nodeType: 'tableCell'; node: CustomTableCellNode; nodeKey: NodeKey }
```

インポートを追加する:

```typescript
import type { CustomTableNode } from "../../nodes/CustomTableNode";
import type { CustomTableCellNode } from "../../nodes/CustomTableCellNode";
```

### Step 2: `inspector-registry.ts` に型ガードを追加する

`getInspectableInfoFromRegistry` の関数本体に追加する（先頭近くに追加して優先度を上げる）:

```typescript
// TableCellNode を先に判定（TableNode の子なので先にマッチさせる）
if ($isCustomTableCellNode(node)) {
  return { nodeType: "tableCell", node, nodeKey };
}
if ($isCustomTableNode(node)) {
  return { nodeType: "table", node, nodeKey };
}
```

`INSPECTABLE_NODE_TYPES_FROM_REGISTRY` 配列に `'table'` と `'tableCell'` を追加する。

インポートを追加する:

```typescript
import { $isCustomTableNode } from "../nodes/CustomTableNode";
import { $isCustomTableCellNode } from "../nodes/CustomTableCellNode";
```

### Step 3: `InspectorSidebar.tsx` に case を追加する

`renderPanel` 関数の switch 文に追加する:

```typescript
case 'table':
  return (
    <TableInspectorPanel nodeKey={info.nodeKey} node={info.node} />
  )
case 'tableCell':
  return (
    <TableCellInspectorPanel nodeKey={info.nodeKey} node={info.node} />
  )
```

インポートを追加する:

```typescript
import { TableInspectorPanel } from "./panels/TableInspectorPanel";
import { TableCellInspectorPanel } from "./panels/TableCellInspectorPanel";
```

### Step 4: `use-selected-node.ts` に TableSelection 対応を追加する

`@lexical/table` には `TableSelection` という専用の選択状態がある。テーブル全体が選択された場合に `CustomTableNode` の Inspector を表示するために対応が必要。

```typescript
import { $isTableSelection } from "@lexical/table";
import { $isCustomTableNode } from "../../nodes/CustomTableNode";

// updateSelectedNode 内で既存の判定の前に追加:
if ($isTableSelection(selection)) {
  // TableSelection は tableKey でテーブルノードを参照する
  const tableNode = $getNodeByKey(selection.tableKey);
  if ($isCustomTableNode(tableNode)) {
    setSelectedNode({
      nodeType: "table",
      node: tableNode,
      nodeKey: tableNode.getKey(),
    });
    return;
  }
}
```

**NOTE:** `$isTableSelection` の引数型は `BaseSelection | null` を受け付けるか確認すること。
型エラーが出る場合は `selection !== null && $isTableSelection(selection)` に変更する。

### Step 5: 型チェックを実行する

```bash
bun run type-check
```

エラーが出た場合: Discriminated Union の漏れ（switch の exhaustiveness）を確認する。
`InspectorSidebar.tsx` の switch に `never` チェックがある場合は全ケースを追加する。

### Step 6: 開発サーバーで動作確認する

```bash
bun dev
```

確認事項:

- テーブルをクリックすると右サイドパネルに「テーブル」パネルが表示される
- テーブルのセルにカーソルを置くと「テーブルセル」パネルが表示される
- 「表示スタイル」を「縞模様」に変更するとテーブルが変化する
- 「背景色」を選択するとテーブルの背景色が変わる
- セル背景色を変更すると該当セルの背景色が変わる

### Step 7: コミットする

```bash
git add -p  # 4つのファイルをステージ
git commit -m "feat(lexical): wire TableInspectorPanel and TableCellInspectorPanel to Inspector"
```

---

## Task 8: テーブルの CSS スタイルを追加する

**Files:**

- Modify: `src/app/(admin)/_styles/lexical-content.css`（またはテーブルスタイルが定義されているCSS）

### Step 1: テーブル CSS ファイルを確認する

```bash
grep -rn "table\|tablecell\|tablerow" src/app/\(admin\)/_styles/ --include="*.css" | head -20
```

既存のテーブルスタイルがどのファイルに定義されているかを確認する。

### Step 2: カスタムテーブルのスタイルを追加する

縞模様（stripes）スタイルと枠線 CSS 変数のスタイルを追加する:

```css
/* CustomTableNode スタイル */
[data-table-style="stripes"] tbody tr:nth-child(even) td {
  background-color: var(--color-muted);
}

/* 枠線 CSS 変数対応 */
table[style*="--table-border-color"] td,
table[style*="--table-border-color"] th {
  border-color: var(--table-border-color);
  border-width: var(--table-border-width, 1px);
  border-style: solid;
}
```

### Step 3: 型チェックを実行する

```bash
bun run type-check
```

### Step 4: コミットする

```bash
git add src/app/\(admin\)/_styles/
git commit -m "feat(lexical): add CSS styles for CustomTableNode stripes and border variables"
```

---

## Task 9: DB マイグレーションスクリプトを作成・実行する

**Files:**

- Create: `scripts/migrate-table-nodes.ts`

### Step 1: Prisma スキーマで content カラムを確認する

```bash
grep -n "content\|Json" prisma/schema.prisma | head -30
```

`content` JSON カラムを持つモデル（例: `Block`, `Page`, `Space` など）を確認する。

### Step 2: スクリプトを作成する

```typescript
// scripts/migrate-table-nodes.ts
import { PrismaClient } from "../src/shared/generated/prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

// JSON 内を再帰的に変換する関数
function transformNode(node: Record<string, unknown>): Record<string, unknown> {
  const transformed = { ...node };

  if (transformed["type"] === "table") {
    transformed["type"] = "custom-table";
  } else if (transformed["type"] === "tablecell") {
    transformed["type"] = "custom-tablecell";
  }

  // 子ノードを再帰的に変換
  if (Array.isArray(transformed["children"])) {
    transformed["children"] = (
      transformed["children"] as Record<string, unknown>[]
    ).map(transformNode);
  }

  return transformed;
}

function transformContent(content: unknown): {
  changed: boolean;
  result: unknown;
} {
  if (!content || typeof content !== "object") {
    return { changed: false, result: content };
  }

  const original = JSON.stringify(content);
  const transformed = transformNode(content as Record<string, unknown>);
  const result = JSON.stringify(transformed);

  return {
    changed: original !== result,
    result: transformed,
  };
}

async function main() {
  console.log(`実行モード: ${DRY_RUN ? "DRY RUN（変更なし）" : "本番実行"}`);

  let totalChanged = 0;
  let totalFailed = 0;

  // NOTE: 実装時に schema.prisma を確認して対象テーブルを追加すること
  // 以下は例。content カラムを持つ全モデルを対象にする。

  // === Block モデルの例 ===
  // const blocks = await prisma.block.findMany({ select: { id: true, content: true } })
  // for (const block of blocks) {
  //   const { changed, result } = transformContent(block.content)
  //   if (changed) {
  //     console.log(`Block ${block.id}: 変換あり`)
  //     totalChanged++
  //     if (!DRY_RUN) {
  //       await prisma.block.update({
  //         where: { id: block.id },
  //         data: { content: result as Prisma.JsonValue },
  //       })
  //     }
  //   }
  // }

  console.log(`完了: ${totalChanged} 件変換、${totalFailed} 件失敗`);

  if (DRY_RUN) {
    console.log(
      "DRY RUN: DB は変更されていません。--dry-run を外して再実行してください。",
    );
  }
}

main()
  .catch((e) => {
    console.error("スクリプトエラー:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

**⚠️ 重要:** `// NOTE:` の部分を実際のスキーマに合わせて埋めること。
`bun run db:studio` でどのテーブルに `content` JSON があるか確認してから実装する。

### Step 3: DRY RUN で変換対象を確認する

```bash
bunx tsx scripts/migrate-table-nodes.ts --dry-run
```

### Step 4: 本番実行する

```bash
bunx tsx scripts/migrate-table-nodes.ts
```

### Step 5: コミットする

```bash
git add scripts/migrate-table-nodes.ts
git commit -m "chore: add table node migration script for custom-table type conversion"
```

---

## Task 10: 最終検証する

### Step 1: 型チェックを実行する

```bash
bun run type-check
```

エラーなしであること。

### Step 2: lint を実行する

```bash
bun run lint
```

エラーなしであること。

### Step 3: ビルドを実行する

```bash
bun run build
```

ビルドエラーなしであること。

### Step 4: 動作確認チェックリスト

開発サーバー (`bun dev`) で以下を確認:

**挿入:**

- [ ] テーブルを新規挿入できる
- [ ] 挿入後に右サイドパネルに「テーブル」パネルが表示される

**テーブルパネル（スタイル）:**

- [ ] 「表示スタイル: 縞模様」に変更するとテーブルの奇数行に背景色がつく
- [ ] 「ヘッダー行」トグルが機能する
- [ ] 「フッター行」トグルが機能する
- [ ] 「セル幅均等」トグルが機能する

**テーブルパネル（カラー）:**

- [ ] 「背景色」パレットでテーブル全体の背景色が変わる
- [ ] 「背景色」HEX 入力でカスタムカラーが適用される
- [ ] 「枠線色」と「枠線幅」でテーブルの枠線が変わる

**テーブルパネル（詳細）:**

- [ ] HTML アンカーを入力するとテーブルに `id` 属性が付く
- [ ] CSS クラスを入力するとテーブルにクラスが付く

**テーブルセルパネル:**

- [ ] セルにカーソルを置くと「テーブルセル」パネルが表示される
- [ ] セル背景色を変更すると該当セルのみ背景色が変わる

**行・列操作（TableActionMenuPlugin）:**

- [ ] セル右クリックメニューで行・列の挿入・削除ができる

**永続化:**

- [ ] テーブルを保存して再読み込みするとスタイルが保持されている

### Step 5: 最終コミットをする

```bash
git add -p
git commit -m "feat(lexical): complete Table Inspector Panel with full style editing"
```

---

## トラブルシューティング

### `$config()` の型エラー

`this.config(...)` の戻り値型が合わない場合、Lexical のバージョンを確認する:

```bash
cat package.json | grep lexical
```

`PricingTableNode.tsx` の `$config()` 実装と全く同じパターンで書いているか照合する。

### `TableCellNode` のコンストラクタ制約

`$createCustomTableCellNode` が型エラーになる場合、`@lexical/table` の型定義を確認する:

```bash
cat node_modules/@lexical/table/flow/LexicalTableCellNode.js.flow | head -50
```

`TableCellNode` のコンストラクタが `headerState` を必須引数として持つ場合、`$create(CustomTableCellNode)` 後に `setHeaderStyles()` 等で初期化する。

### `$isTableSelection` の型エラー

`@lexical/table` のバージョンにより `TableSelection` の export 方法が異なる場合がある:

```bash
grep -n "TableSelection\|isTableSelection" node_modules/@lexical/table/src/index.ts 2>/dev/null | head -10
```

### 既存テーブルが表示されない

DB マイグレーション後も既存データが表示されない場合、ブラウザのローカルストレージをクリアしてから再確認する（エディタが localStorage に状態をキャッシュしている可能性）。

---

## 関連ファイル

- 設計ドキュメント: `docs/plans/2026-03-01-table-inspector-design.md`
- 参考: `[lexical]/nodes/PricingTableNode.tsx`
- 参考: `[lexical]/inspector/panels/PricingPlanInspectorPanel.tsx`
