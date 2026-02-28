# Lexical エディタ最適化 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 公式 Lexical Playground 水準への整合 + レンタルスペース固有ブロック追加 + UX 改善を段階的に実装する。

**Architecture:** 既存の複合ノードパターン（ElementNode + isShadowRoot + NodeState API + AccentColor）に完全準拠。後方互換性ハックなし。各タスクで `bun run validate` を必ず実行してから commit。

**Tech Stack:** Lexical 0.40+, React 19, TypeScript 6.0-beta, `bun:test`, `@lexical/react`, `@lexical/table`, `lucide-react`, `@icons-pack/react-simple-icons`

**Design Doc:** `docs/plans/2026-02-28-lexical-optimization-design.md`

**Base path:** `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/`

---

## 実装前の確認事項

```bash
# 現状が通っていることを確認
bun run validate
bun run test
```

---

## Task 1: TableCellResizerPlugin の追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/LexicalEditor.tsx`

### Step 1: インポートと JSX を追加

`LexicalEditor.tsx` の既存インポートブロックに追加:

```typescript
import { TableCellResizerPlugin } from "@lexical/react/LexicalTableCellResizerPlugin";
```

EditorInner 内、`<TablePlugin hasCellMerge={true} hasCellBackgroundColor={true} />` の直後に追加:

```tsx
<TableCellResizerPlugin />
```

### Step 2: 検証とコミット

```bash
bun run validate
```

Expected: エラーなし

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/LexicalEditor.tsx
git commit -m "feat(lexical): add TableCellResizerPlugin for column width resizing"
```

---

## Task 2: TableActionMenuPlugin の実装

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/TableActionMenuPlugin.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/LexicalEditor.tsx`

### Step 1: TableActionMenuPlugin.tsx を作成

公式 Lexical Playground パターン準拠。`@lexical/table` のユーティリティを使用。

```typescript
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $deleteTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  $getTableCellNodeFromLexicalNode,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumn__EXPERIMENTAL,
  $insertTableRow__EXPERIMENTAL,
  $isTableCellNode,
  $isTableSelection,
  TableCellNode,
} from '@lexical/table'
import {
  $getSelection,
  $isRangeSelection,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
} from 'lexical'

type TableActionMenuProps = {
  anchorElem: HTMLElement
  tableCellNode: TableCellNode
  setIsMenuOpen: (isOpen: boolean) => void
}

function TableActionMenu({ anchorElem, tableCellNode, setIsMenuOpen }: TableActionMenuProps) {
  const [editor] = useLexicalComposerContext()
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const menu = dropdownRef.current
    if (!menu) return
    const cellDom = editor.getElementByKey(tableCellNode.getKey())
    if (!cellDom) return
    const rect = cellDom.getBoundingClientRect()
    const anchorRect = anchorElem.getBoundingClientRect()
    menu.style.top = `${rect.bottom - anchorRect.top + anchorElem.scrollTop + 4}px`
    menu.style.left = `${rect.left - anchorRect.left + anchorElem.scrollLeft}px`
  }, [editor, tableCellNode, anchorElem])

  // 外クリックで閉じる
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setIsMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [setIsMenuOpen])

  const runCommand = useCallback((fn: () => void) => {
    editor.update(fn)
    setIsMenuOpen(false)
  }, [editor, setIsMenuOpen])

  const menuItems = [
    { label: '上に行を挿入', fn: () => $insertTableRow__EXPERIMENTAL(false) },
    { label: '下に行を挿入', fn: () => $insertTableRow__EXPERIMENTAL(true) },
    { label: '左に列を挿入', fn: () => $insertTableColumn__EXPERIMENTAL(false) },
    { label: '右に列を挿入', fn: () => $insertTableColumn__EXPERIMENTAL(true) },
    { label: '行を削除', fn: () => $deleteTableRow__EXPERIMENTAL() },
    { label: '列を削除', fn: () => $deleteTableColumn__EXPERIMENTAL() },
  ] as const

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 min-w-[180px] rounded-md border border-border bg-popover py-1 shadow-md"
    >
      {menuItems.map((item) => (
        <button
          key={item.label}
          type="button"
          className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
          onClick={() => runCommand(item.fn)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function TableActionMenuPlugin({ anchorElem }: { anchorElem: HTMLElement }) {
  const [editor] = useLexicalComposerContext()
  const [activeCell, setActiveCell] = useState<TableCellNode | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection()
        if ($isRangeSelection(selection) || $isTableSelection(selection)) {
          const node = $isRangeSelection(selection)
            ? selection.anchor.getNode()
            : selection.getNodes()[0]
          const cellNode = $getTableCellNodeFromLexicalNode(node)
          if ($isTableCellNode(cellNode)) {
            setActiveCell(cellNode)
            return false
          }
        }
        setActiveCell(null)
        return false
      },
      COMMAND_PRIORITY_CRITICAL,
    )
  }, [editor])

  if (!activeCell) return null

  return createPortal(
    <>
      {/* セル右上のメニューボタン */}
      <button
        type="button"
        className="absolute z-40 rounded bg-primary px-1 text-xs text-primary-foreground"
        style={{
          top: (() => {
            const dom = editor.getElementByKey(activeCell.getKey())
            if (!dom) return 0
            const rect = dom.getBoundingClientRect()
            const aRect = anchorElem.getBoundingClientRect()
            return rect.top - aRect.top + anchorElem.scrollTop
          })(),
          left: (() => {
            const dom = editor.getElementByKey(activeCell.getKey())
            if (!dom) return 0
            const rect = dom.getBoundingClientRect()
            const aRect = anchorElem.getBoundingClientRect()
            return rect.right - aRect.left + anchorElem.scrollLeft - 24
          })(),
        }}
        onClick={() => setIsMenuOpen((v) => !v)}
        aria-label="テーブルメニューを開く"
        aria-expanded={isMenuOpen}
      >
        ▾
      </button>
      {isMenuOpen && (
        <TableActionMenu
          anchorElem={anchorElem}
          tableCellNode={activeCell}
          setIsMenuOpen={setIsMenuOpen}
        />
      )}
    </>,
    anchorElem,
  )
}
```

### Step 2: LexicalEditor.tsx に追加

```typescript
// import に追加
import { TableActionMenuPlugin } from "./plugins/TableActionMenuPlugin";
```

EditorInner 内の `<TableCellResizerPlugin />` の直後に追加:

```tsx
<TableActionMenuPlugin anchorElem={anchorElemRef.current ?? document.body} />
```

> ※ `anchorElemRef` は既存の DraggableBlockPlugin と同じ ref を再利用する。既存の `anchorElemRef` 変数が存在するか確認し、なければ `const anchorElemRef = useRef<HTMLDivElement>(document.body)` を追加する。

### Step 3: 検証とコミット

```bash
bun run validate
```

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/plugins/TableActionMenuPlugin.tsx
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/LexicalEditor.tsx
git commit -m "feat(lexical): add TableActionMenuPlugin for row/column operations"
```

---

## Task 3: InlineImageNode の実装

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/InlineImageNode.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/InlineImagePlugin.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspectors/InlineImageInspector.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/nodes.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items.ts`

### Step 1: テストを書く

`src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/__tests__/InlineImageNode.test.ts` を作成:

```typescript
import { test, expect, describe, beforeEach } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $getRoot, $createParagraphNode } from "lexical";
import {
  InlineImageNode,
  $createInlineImageNode,
  $isInlineImageNode,
} from "../nodes/InlineImageNode";

function createEditor() {
  return createHeadlessEditor({ nodes: [InlineImageNode] });
}

describe("InlineImageNode", () => {
  test("JSON round-trip preserves all states", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const node = $createInlineImageNode({
        src: "https://example.com/img.jpg",
        altText: "test",
        position: "left",
        width: 300,
      });
      $getRoot().getFirstChild()!.append(node);
    });

    const json = editor.getEditorState().toJSON();
    const nodeJson = (json.root.children[0] as any).children[0];
    expect(nodeJson.type).toBe("inline-image");
    expect(nodeJson.$.src).toBe("https://example.com/img.jpg");
    expect(nodeJson.$.position).toBe("left");
    expect(nodeJson.$.width).toBe(300);
  });

  test("$isInlineImageNode returns true for InlineImageNode", async () => {
    const editor = createEditor();
    let result = false;
    await editor.update(() => {
      const node = $createInlineImageNode({
        src: "x",
        altText: "",
        position: "full",
        width: 200,
      });
      result = $isInlineImageNode(node);
    });
    expect(result).toBe(true);
  });

  test("default position is full", async () => {
    const editor = createEditor();
    let position = "";
    await editor.update(() => {
      const node = $createInlineImageNode({ src: "x", altText: "" });
      position = node.getPosition();
    });
    expect(position).toBe("full");
  });
});
```

### Step 2: テストが失敗することを確認

```bash
bun test --filter "InlineImageNode"
```

Expected: FAIL (InlineImageNode not found)

### Step 3: InlineImageNode.tsx を実装

```typescript
'use client'

import type { JSX } from 'react'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getNodeByKey,
  $getState,
  $setState,
  $getStateChange,
  $create,
  createState,
  DecoratorNode,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from 'lexical'
import { useEffect, useCallback } from 'react'
import { createEnumGuard } from '../config/type-guards'
import { parseString } from '../config/type-guards'

// --- Types ---
const INLINE_IMAGE_POSITIONS = ['left', 'right', 'full'] as const
type InlineImagePosition = (typeof INLINE_IMAGE_POSITIONS)[number]
const isInlineImagePosition = createEnumGuard<InlineImagePosition>(INLINE_IMAGE_POSITIONS)

// --- States ---
const srcState = createState('src', { parse: parseString })
const altTextState = createState('altText', { parse: parseString })
const positionState = createState('position', {
  parse: (v: unknown): InlineImagePosition =>
    typeof v === 'string' && isInlineImagePosition(v) ? v : 'full',
})
const widthState = createState('width', {
  parse: (v: unknown): number => (typeof v === 'number' && v > 0 ? v : 200),
})

// --- Component ---
function InlineImageComponent({
  src,
  altText,
  position,
  width,
  nodeKey,
}: {
  src: string
  altText: string
  position: InlineImagePosition
  width: number
  nodeKey: NodeKey
}) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)

  const onClick = useCallback(
    (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(`[data-inline-image-key="${nodeKey}"]`)) {
        clearSelection()
        setSelected(true)
        return true
      }
      return false
    },
    [nodeKey, clearSelection, setSelected],
  )

  useEffect(() => {
    return editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW)
  }, [editor, onClick])

  const floatStyle =
    position === 'left'
      ? { float: 'left' as const, marginRight: '1rem', marginBottom: '0.5rem' }
      : position === 'right'
        ? { float: 'right' as const, marginLeft: '1rem', marginBottom: '0.5rem' }
        : {}

  return (
    <span
      data-inline-image-key={nodeKey}
      data-position={position}
      style={{ display: 'inline-block', width: position !== 'full' ? width : undefined, ...floatStyle }}
      className={isSelected ? 'ring-2 ring-primary' : undefined}
    >
      <img
        src={src}
        alt={altText}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        draggable={false}
      />
    </span>
  )
}

// --- Node ---
export class InlineImageNode extends DecoratorNode<JSX.Element> {
  $config() {
    return this.config('inline-image', {
      extends: DecoratorNode,
      stateConfigs: [
        { stateConfig: srcState },
        { stateConfig: altTextState },
        { stateConfig: positionState },
        { stateConfig: widthState },
      ],
    })
  }

  static getType() {
    return 'inline-image'
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement('span')
    span.setAttribute('data-inline-image', '')
    return span
  }

  updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const posChange = $getStateChange(this, prevNode, positionState)
    if (posChange !== null) {
      dom.setAttribute('data-position', posChange[0])
    }
    return false
  }

  static importDOM() {
    return {
      span: (node: HTMLElement) => {
        if (!node.hasAttribute('data-inline-image')) return null
        return {
          conversion: (element: HTMLElement) => {
            const img = element.querySelector('img')
            const node = $create(InlineImageNode)
            $setState(node, srcState, img?.getAttribute('src') ?? '')
            $setState(node, altTextState, img?.getAttribute('alt') ?? '')
            const pos = element.getAttribute('data-position') ?? 'full'
            $setState(node, positionState, isInlineImagePosition(pos) ? pos : 'full')
            const w = parseInt(element.getAttribute('data-width') ?? '200', 10)
            $setState(node, widthState, isNaN(w) ? 200 : w)
            return { node }
          },
          priority: 2 as const,
        }
      },
    }
  }

  exportDOM(_editor: LexicalEditor): { element: HTMLElement } {
    const span = document.createElement('span')
    span.setAttribute('data-inline-image', '')
    span.setAttribute('data-position', $getState(this, positionState))
    span.setAttribute('data-width', String($getState(this, widthState)))
    const img = document.createElement('img')
    img.src = $getState(this, srcState)
    img.alt = $getState(this, altTextState)
    span.appendChild(img)
    return { element: span }
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return (
      <InlineImageComponent
        src={$getState(this, srcState)}
        altText={$getState(this, altTextState)}
        position={$getState(this, positionState)}
        width={$getState(this, widthState)}
        nodeKey={this.getKey()}
      />
    )
  }

  // 公開用メソッド（インスペクター向け）
  getPosition(): InlineImagePosition {
    return $getState(this, positionState)
  }
}

// --- Factory & Guards ---
export function $createInlineImageNode({
  src,
  altText,
  position = 'full',
  width = 200,
}: {
  src: string
  altText: string
  position?: InlineImagePosition
  width?: number
}): InlineImageNode {
  const node = $create(InlineImageNode)
  $setState(node, srcState, src)
  $setState(node, altTextState, altText)
  $setState(node, positionState, position)
  $setState(node, widthState, width)
  return node
}

export function $isInlineImageNode(node: LexicalNode | null | undefined): node is InlineImageNode {
  return node instanceof InlineImageNode
}
```

### Step 4: config/nodes.ts に登録

```typescript
// 既存インポートの末尾に追加
import { InlineImageNode } from '../nodes/InlineImageNode'

// EDITOR_NODES 配列に追加
InlineImageNode,
```

### Step 5: テストを実行

```bash
bun test --filter "InlineImageNode"
```

Expected: PASS (3 tests)

### Step 6: InlineImagePlugin.tsx を作成

既存の `ImagePlugin.tsx` を参考に、画像選択ダイアログを再利用するシンプルなプラグイン:

```typescript
"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $insertNodes,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
} from "lexical";
import { $wrapNodeInElement } from "@lexical/utils";
import { useEffect } from "react";
import { $createInlineImageNode } from "../nodes/InlineImageNode";

export type InsertInlineImagePayload = {
  src: string;
  altText: string;
  position?: "left" | "right" | "full";
  width?: number;
};

export const INSERT_INLINE_IMAGE_COMMAND: LexicalCommand<InsertInlineImagePayload> =
  createCommand("INSERT_INLINE_IMAGE_COMMAND");

export function InlineImagePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      INSERT_INLINE_IMAGE_COMMAND,
      (payload) => {
        const node = $createInlineImageNode(payload);
        $insertNodes([node]);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
```

### Step 7: insert-items.ts に追加

既存の `media` カテゴリのエントリ（Image の後）に追加:

```typescript
// import に追加（Lucide から ImageIcon を再利用 or 別アイコン）
import { ImageIcon } from 'lucide-react' // 既存インポートを確認して追加

// INSERT_ITEMS 配列の media カテゴリに追加:
{
  id: 'inline-image',
  label: 'インライン画像',
  description: 'テキストと混在する画像（左/右/全幅）',
  icon: ImageIcon,  // 既存の ImageIcon を参照
  category: 'media',
  type: 'dialog',
  dialogId: 'inline-image',
  showInToolbar: false,
  showInPicker: true,
},
```

> ※ `dialogId: 'inline-image'` に対応するダイアログを DialogRenderer に追加する必要がある。
> 既存の `image` ダイアログを参考に `InlineImageDialog` を作成し、`INSERT_INLINE_IMAGE_COMMAND` をディスパッチする。

### Step 8: InlineImageInspector.tsx を作成

既存のインスペクターパターン（例: `ImageInspector.tsx`）を参考に、position と width の設定フォームを実装:

```typescript
// InlineImageInspector は src/altText の変更 + position(left/right/full) + width スライダーを提供
// $getState / $setState を editor.update() 内で呼び出すパターンを踏襲
```

### Step 9: 検証とコミット

```bash
bun run validate
bun test --filter "InlineImageNode"
```

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/nodes/InlineImageNode.tsx
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/plugins/InlineImagePlugin.tsx
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/inspectors/InlineImageInspector.tsx
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/config/nodes.ts
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/config/insert-items.ts
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/__tests__/InlineImageNode.test.ts
git commit -m "feat(lexical): add InlineImageNode for inline float images"
```

---

## Task 4: TestimonialNode の実装

**Files:**

- Create: `nodes/TestimonialNode.tsx`
- Create: `plugins/TestimonialPlugin.tsx`
- Create: `inspectors/TestimonialContainerInspector.tsx`
- Create: `inspectors/TestimonialItemInspector.tsx`
- Modify: `config/nodes.ts`
- Modify: `config/insert-items.ts`

**参照パターン:** `nodes/TimelineNode.tsx`（最も近い構造）

### Step 1: テストを書く

`__tests__/TestimonialNode.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $getRoot, $createParagraphNode } from "lexical";
import {
  TestimonialContainerNode,
  TestimonialItemNode,
  $createTestimonialContainerNode,
  $createTestimonialItemNode,
  $isTestimonialContainerNode,
  $isTestimonialItemNode,
} from "../nodes/TestimonialNode";

function createEditor() {
  return createHeadlessEditor({
    nodes: [TestimonialContainerNode, TestimonialItemNode],
  });
}

describe("TestimonialContainerNode", () => {
  test("JSON round-trip preserves layout, columns, accentColor", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const item = $createTestimonialItemNode({
        authorName: "田中様",
        rating: 5,
      });
      item.append($createParagraphNode());
      const container = $createTestimonialContainerNode({
        layout: "grid",
        columns: 2,
        accentColor: "blue",
      });
      container.append(item);
      $getRoot().append(container);
    });
    const json = editor.getEditorState().toJSON();
    const containerJson = json.root.children[0] as any;
    expect(containerJson.type).toBe("testimonial-container");
    expect(containerJson.$.layout).toBe("grid");
    expect(containerJson.$.columns).toBe(2);
    expect(containerJson.$.accentColor).toBe("blue");
  });

  test("TestimonialItemNode preserves rating and authorName", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const item = $createTestimonialItemNode({
        authorName: "鈴木様",
        rating: 4,
        date: "2025-12-01",
      });
      item.append($createParagraphNode());
      $getRoot().getFirstChild()!.append(item);
    });
    const json = editor.getEditorState().toJSON();
    const itemJson = (json.root.children[0] as any).children[0];
    expect(itemJson.type).toBe("testimonial-item");
    expect(itemJson.$.authorName).toBe("鈴木様");
    expect(itemJson.$.rating).toBe(4);
    expect(itemJson.$.date).toBe("2025-12-01");
  });

  test("isShadowRoot returns true for both nodes", async () => {
    const editor = createEditor();
    let results: boolean[] = [];
    await editor.update(() => {
      const container = $createTestimonialContainerNode({});
      const item = $createTestimonialItemNode({});
      results = [container.isShadowRoot(), item.isShadowRoot()];
    });
    expect(results).toEqual([true, true]);
  });
});
```

### Step 2: TestimonialNode.tsx を実装

`nodes/TestimonialNode.tsx`:

```typescript
import {
  $create,
  $getState,
  $setState,
  $getStateChange,
  createState,
  ElementNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type SerializedElementNode,
  type DOMConversionMap,
  type DOMExportOutput,
} from "lexical";
import { parseString } from "../config/type-guards";
import { createEnumGuard } from "../config/type-guards";
import {
  ACCENT_COLORS,
  type AccentColor,
  isAccentColor,
} from "../config/accent-colors";

// --- Types ---
const TESTIMONIAL_LAYOUTS = ["list", "grid"] as const;
type TestimonialLayout = (typeof TESTIMONIAL_LAYOUTS)[number];
const isTestimonialLayout =
  createEnumGuard<TestimonialLayout>(TESTIMONIAL_LAYOUTS);

const TESTIMONIAL_COLUMNS = [1, 2, 3] as const;
type TestimonialColumns = (typeof TESTIMONIAL_COLUMNS)[number];

// --- TestimonialContainerNode States ---
const layoutState = createState("layout", {
  parse: (v: unknown): TestimonialLayout =>
    typeof v === "string" && isTestimonialLayout(v) ? v : "grid",
});
const columnsState = createState("columns", {
  parse: (v: unknown): TestimonialColumns =>
    v === 1 || v === 2 || v === 3 ? v : 2,
});
const accentColorState = createState("accentColor", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

// --- TestimonialItemNode States ---
const authorNameState = createState("authorName", { parse: parseString });
const authorTitleState = createState("authorTitle", { parse: parseString });
const avatarUrlState = createState("avatarUrl", { parse: parseString });
const ratingState = createState("rating", {
  parse: (v: unknown): 1 | 2 | 3 | 4 | 5 => {
    if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5) return v;
    return 5;
  },
});
const dateState = createState("date", { parse: parseString });

// --- TestimonialContainerNode ---
export class TestimonialContainerNode extends ElementNode {
  $config() {
    return this.config("testimonial-container", {
      extends: ElementNode,
      stateConfigs: [
        { stateConfig: layoutState },
        { stateConfig: columnsState },
        { stateConfig: accentColorState },
      ],
    });
  }

  static getType() {
    return "testimonial-container";
  }

  isShadowRoot() {
    return true;
  }
  canBeEmpty() {
    return false;
  }
  canInsertTextBefore() {
    return false;
  }
  canInsertTextAfter() {
    return false;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-testimonial", "");
    div.setAttribute("data-layout", $getState(this, layoutState));
    div.setAttribute("data-columns", String($getState(this, columnsState)));
    div.setAttribute("data-color", $getState(this, accentColorState));
    return div;
  }

  updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const layoutChange = $getStateChange(this, prevNode, layoutState);
    if (layoutChange !== null) dom.setAttribute("data-layout", layoutChange[0]);
    const columnsChange = $getStateChange(this, prevNode, columnsState);
    if (columnsChange !== null)
      dom.setAttribute("data-columns", String(columnsChange[0]));
    const colorChange = $getStateChange(this, prevNode, accentColorState);
    if (colorChange !== null) dom.setAttribute("data-color", colorChange[0]);
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (node: HTMLElement) => {
        if (!node.hasAttribute("data-testimonial")) return null;
        return {
          conversion: (element: HTMLElement) => {
            const node = $create(TestimonialContainerNode);
            const layout = element.getAttribute("data-layout") ?? "grid";
            $setState(
              node,
              layoutState,
              isTestimonialLayout(layout) ? layout : "grid",
            );
            const cols = parseInt(
              element.getAttribute("data-columns") ?? "2",
              10,
            );
            $setState(
              node,
              columnsState,
              (cols === 1 || cols === 2 || cols === 3
                ? cols
                : 2) as TestimonialColumns,
            );
            const color = element.getAttribute("data-color") ?? "default";
            $setState(
              node,
              accentColorState,
              isAccentColor(color) ? color : "default",
            );
            return { node };
          },
          priority: 2 as const,
        };
      },
    };
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    const div = document.createElement("div");
    div.setAttribute("data-testimonial", "");
    div.setAttribute("data-layout", $getState(this, layoutState));
    div.setAttribute("data-columns", String($getState(this, columnsState)));
    div.setAttribute("data-color", $getState(this, accentColorState));
    return { element: div };
  }
}

// --- TestimonialItemNode ---
export class TestimonialItemNode extends ElementNode {
  $config() {
    return this.config("testimonial-item", {
      extends: ElementNode,
      stateConfigs: [
        { stateConfig: authorNameState },
        { stateConfig: authorTitleState },
        { stateConfig: avatarUrlState },
        { stateConfig: ratingState },
        { stateConfig: dateState },
      ],
    });
  }

  static getType() {
    return "testimonial-item";
  }

  isShadowRoot() {
    return true;
  }
  canInsertTextBefore() {
    return false;
  }
  canInsertTextAfter() {
    return false;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const el = document.createElement("blockquote");
    el.setAttribute("data-testimonial-item", "");
    this._syncDomAttributes(el);
    return el;
  }

  private _syncDomAttributes(dom: HTMLElement) {
    dom.setAttribute("data-author-name", $getState(this, authorNameState));
    dom.setAttribute("data-author-title", $getState(this, authorTitleState));
    dom.setAttribute("data-avatar-url", $getState(this, avatarUrlState));
    dom.setAttribute("data-rating", String($getState(this, ratingState)));
    dom.setAttribute("data-date", $getState(this, dateState));
  }

  updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const fields = [
      authorNameState,
      authorTitleState,
      avatarUrlState,
      ratingState,
      dateState,
    ];
    let changed = false;
    for (const state of fields) {
      if ($getStateChange(this, prevNode, state) !== null) changed = true;
    }
    if (changed) this._syncDomAttributes(dom);
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      blockquote: (node: HTMLElement) => {
        if (!node.hasAttribute("data-testimonial-item")) return null;
        return {
          conversion: (element: HTMLElement) => {
            const node = $create(TestimonialItemNode);
            $setState(
              node,
              authorNameState,
              element.getAttribute("data-author-name") ?? "",
            );
            $setState(
              node,
              authorTitleState,
              element.getAttribute("data-author-title") ?? "",
            );
            $setState(
              node,
              avatarUrlState,
              element.getAttribute("data-avatar-url") ?? "",
            );
            const rating = parseInt(
              element.getAttribute("data-rating") ?? "5",
              10,
            );
            $setState(
              node,
              ratingState,
              (rating >= 1 && rating <= 5 ? rating : 5) as 1 | 2 | 3 | 4 | 5,
            );
            $setState(node, dateState, element.getAttribute("data-date") ?? "");
            return { node };
          },
          priority: 2 as const,
        };
      },
    };
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    const el = document.createElement("blockquote");
    el.setAttribute("data-testimonial-item", "");
    this._syncDomAttributes(el);
    return { element: el };
  }
}

// --- Factories & Guards ---
export function $createTestimonialContainerNode({
  layout = "grid",
  columns = 2,
  accentColor = "default",
}: {
  layout?: TestimonialLayout;
  columns?: TestimonialColumns;
  accentColor?: AccentColor;
} = {}): TestimonialContainerNode {
  const node = $create(TestimonialContainerNode);
  $setState(node, layoutState, layout);
  $setState(node, columnsState, columns);
  $setState(node, accentColorState, accentColor);
  return node;
}

export function $createTestimonialItemNode({
  authorName = "",
  authorTitle = "",
  avatarUrl = "",
  rating = 5,
  date = "",
}: {
  authorName?: string;
  authorTitle?: string;
  avatarUrl?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  date?: string;
} = {}): TestimonialItemNode {
  const node = $create(TestimonialItemNode);
  $setState(node, authorNameState, authorName);
  $setState(node, authorTitleState, authorTitle);
  $setState(node, avatarUrlState, avatarUrl);
  $setState(node, ratingState, rating);
  $setState(node, dateState, date);
  return node;
}

export function $isTestimonialContainerNode(
  node: LexicalNode | null | undefined,
): node is TestimonialContainerNode {
  return node instanceof TestimonialContainerNode;
}

export function $isTestimonialItemNode(
  node: LexicalNode | null | undefined,
): node is TestimonialItemNode {
  return node instanceof TestimonialItemNode;
}
```

### Step 3: テスト実行

```bash
bun test --filter "TestimonialNode"
```

Expected: PASS (3 tests)

### Step 4: TestimonialPlugin.tsx を作成

既存の `StepsPlugin.tsx` または `TimelinePlugin.tsx` を参照してスキャフォールド:

- `INSERT_TESTIMONIAL_COMMAND` を定義し `createCommand` で生成
- 初期コンテンツ: TestimonialContainerNode + 2個の TestimonialItemNode
- 各 TestimonialItemNode の初期子要素: `$createParagraphNode()` (引用テキスト用)

### Step 5: インスペクターを作成

`inspectors/TestimonialContainerInspector.tsx`:

- Layout 選択 (list/grid)
- Columns 選択 (1/2/3)
- AccentColor ピッカー（既存の AccentColorPicker コンポーネントを再利用）

`inspectors/TestimonialItemInspector.tsx`:

- authorName 入力フィールド
- authorTitle 入力フィールド
- avatarUrl 入力フィールド（または画像アップロード）
- rating 選択 (★1-★5)
- date 入力フィールド

### Step 6: config/nodes.ts と insert-items.ts に登録

nodes.ts:

```typescript
import { TestimonialContainerNode, TestimonialItemNode } from '../nodes/TestimonialNode'
// EDITOR_NODES に追加
TestimonialContainerNode, TestimonialItemNode,
```

insert-items.ts の `layout` カテゴリに追加:

```typescript
{
  id: 'testimonial',
  label: '口コミ・テスティモニアル',
  description: '顧客の口コミをカード形式で表示',
  icon: MessageSquareQuote,  // lucide-react から追加
  category: 'layout',
  type: 'command',
  command: INSERT_TESTIMONIAL_COMMAND,
  showInToolbar: true,
  showInPicker: true,
},
```

### Step 7: 検証とコミット

```bash
bun run validate
bun test --filter "TestimonialNode"
```

```bash
git add ...  # 関連ファイル全て
git commit -m "feat(lexical): add TestimonialNode for customer review blocks"
```

---

## Task 5: FeatureIconListNode の実装

**Files:**

- Create: `nodes/FeatureIconListNode.tsx`
- Create: `plugins/FeatureIconListPlugin.tsx`
- Create: `inspectors/FeatureIconListContainerInspector.tsx`
- Create: `inspectors/FeatureIconListItemInspector.tsx`
- Modify: `config/nodes.ts`, `config/insert-items.ts`

**参照パターン:** TestimonialNode と同一構造。

### Step 1: テストを書く

`__tests__/FeatureIconListNode.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $getRoot, $createParagraphNode } from "lexical";
import {
  FeatureIconListContainerNode,
  FeatureIconItemNode,
  $createFeatureIconListContainerNode,
  $createFeatureIconItemNode,
} from "../nodes/FeatureIconListNode";

function createEditor() {
  return createHeadlessEditor({
    nodes: [FeatureIconListContainerNode, FeatureIconItemNode],
  });
}

describe("FeatureIconListNode", () => {
  test("JSON round-trip preserves columns and iconSize", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const item = $createFeatureIconItemNode({
        iconName: "Wifi",
        iconLibrary: "lucide",
      });
      item.append($createParagraphNode());
      const container = $createFeatureIconListContainerNode({
        columns: 3,
        accentColor: "teal",
        iconSize: "lg",
      });
      container.append(item);
      $getRoot().append(container);
    });
    const json = editor.getEditorState().toJSON();
    const containerJson = json.root.children[0] as any;
    expect(containerJson.type).toBe("feature-icon-list-container");
    expect(containerJson.$.columns).toBe(3);
    expect(containerJson.$.accentColor).toBe("teal");
    expect(containerJson.$.iconSize).toBe("lg");
  });

  test("FeatureIconItemNode preserves iconName and iconLibrary", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const item = $createFeatureIconItemNode({
        iconName: "Coffee",
        iconLibrary: "lucide",
      });
      item.append($createParagraphNode());
      $getRoot().getFirstChild()!.append(item);
    });
    const json = editor.getEditorState().toJSON();
    const itemJson = (json.root.children[0] as any).children[0];
    expect(itemJson.$.iconName).toBe("Coffee");
    expect(itemJson.$.iconLibrary).toBe("lucide");
  });
});
```

### Step 2: FeatureIconListNode.tsx を実装

TestimonialNode.tsx と同じ構造で実装:

**FeatureIconListContainerNode States:**

- `columns`: 1|2|3 (default: 2)
- `accentColor`: AccentColor (default: 'default')
- `iconSize`: 'sm'|'md'|'lg' (default: 'md')

**FeatureIconItemNode States:**

- `iconName`: string (Lucide/SimpleIcons のアイコン名, default: '')
- `iconLibrary`: 'lucide'|'simple-icons' (default: 'lucide')

**DOM:**

```html
<ul
  data-feature-icon-list
  data-columns="2"
  data-color="default"
  data-icon-size="md"
>
  <li data-feature-icon-item data-icon-name="Wifi" data-icon-library="lucide">
    <p>タイトル</p>
    <p>説明文</p>
  </li>
</ul>
```

### Step 3: テスト実行

```bash
bun test --filter "FeatureIconListNode"
```

Expected: PASS

### Step 4: アイコンピッカーの実装（インスペクター内）

`inspectors/FeatureIconListItemInspector.tsx`:

- iconLibrary 切り替え (lucide / simple-icons)
- iconName 検索フィールド（Lucide: `lucide-react` の全エクスポートをインデックス化）
- プレビュー表示
- AccentColorPicker は FeatureIconListContainerInspector で提供

**アイコン検索の実装方針:**

- Lucide: `import * as LucideIcons from 'lucide-react'` → `Object.keys(LucideIcons)` で全名取得 → 検索フィルタ
- Simple Icons: `import * as SimpleIcons from '@icons-pack/react-simple-icons'` → 同様

### Step 5: 検証とコミット

```bash
bun run validate
bun test --filter "FeatureIconListNode"
git commit -m "feat(lexical): add FeatureIconListNode for amenity/feature icon lists"
```

---

## Task 6: CoverNode の実装

**Files:**

- Create: `nodes/CoverNode.tsx`
- Create: `plugins/CoverPlugin.tsx`
- Create: `inspectors/CoverInspector.tsx`
- Modify: `config/nodes.ts`, `config/insert-items.ts`

### Step 1: テストを書く

`__tests__/CoverNode.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $getRoot, $createParagraphNode } from "lexical";
import { HeadingNode } from "@lexical/rich-text";
import { CoverNode, $createCoverNode, $isCoverNode } from "../nodes/CoverNode";

function createEditor() {
  return createHeadlessEditor({ nodes: [CoverNode, HeadingNode] });
}

describe("CoverNode", () => {
  test("JSON round-trip preserves backgroundImageUrl and overlayOpacity", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const cover = $createCoverNode({
        backgroundImageUrl: "https://example.com/bg.jpg",
        overlayOpacity: 40,
        minHeight: "lg",
        contentAlign: "center",
        contentPosition: "center",
      });
      cover.append($createParagraphNode());
      $getRoot().append(cover);
    });
    const json = editor.getEditorState().toJSON();
    const coverJson = json.root.children[0] as any;
    expect(coverJson.type).toBe("cover");
    expect(coverJson.$.backgroundImageUrl).toBe("https://example.com/bg.jpg");
    expect(coverJson.$.overlayOpacity).toBe(40);
    expect(coverJson.$.minHeight).toBe("lg");
  });

  test("isShadowRoot returns true", async () => {
    const editor = createEditor();
    let result = false;
    await editor.update(() => {
      const cover = $createCoverNode({});
      result = cover.isShadowRoot();
    });
    expect(result).toBe(true);
  });
});
```

### Step 2: CoverNode.tsx を実装

```typescript
// CoverNode は単一の ElementNode（isShadowRoot: true）
// States: backgroundImageUrl, overlayOpacity, minHeight, contentAlign, contentPosition
// 子ノード: HeadingNode + ParagraphNode（エディタ内で直接編集可能）
```

**States:**

| State                | 型                                  | デフォルト |
| -------------------- | ----------------------------------- | ---------- |
| `backgroundImageUrl` | `string`                            | `''`       |
| `overlayOpacity`     | `0\|10\|20\|30\|40\|50\|60\|70\|80` | `40`       |
| `minHeight`          | `'sm'\|'md'\|'lg'\|'xl'\|'full'`    | `'md'`     |
| `contentAlign`       | `'left'\|'center'\|'right'`         | `'center'` |
| `contentPosition`    | `'top'\|'center'\|'bottom'`         | `'center'` |

**DOM:**

```html
<div
  data-cover
  data-overlay-opacity="40"
  data-min-height="md"
  data-content-align="center"
  data-content-position="center"
  style="background-image: url(...)"
>
  <!-- HeadingNode + ParagraphNode -->
</div>
```

`createDOM` で `style.backgroundImage` を設定。
`updateDOM` で `$getStateChange(this, prevNode, backgroundImageUrlState)` を確認し、変更時に `dom.style.backgroundImage` を更新。

### Step 3: テスト実行

```bash
bun test --filter "CoverNode"
```

Expected: PASS

### Step 4: CoverPlugin.tsx を作成

- `INSERT_COVER_COMMAND` を定義
- 初期コンテンツ: CoverNode + HeadingNode + ParagraphNode

### Step 5: CoverInspector.tsx を作成

- backgroundImageUrl: 画像アップロードまたは URL 入力（既存の画像ピッカーを再利用）
- overlayOpacity: スライダー (0-80、ステップ 10)
- minHeight: select (sm/md/lg/xl/full)
- contentAlign: ラジオグループ (left/center/right)
- contentPosition: ラジオグループ (top/center/bottom)

### Step 6: 検証とコミット

```bash
bun run validate
bun test --filter "CoverNode"
git commit -m "feat(lexical): add CoverNode for background image with text overlay"
```

---

## Task 7: PasteUrlPlugin の実装

**Files:**

- Create: `plugins/PasteUrlPlugin.tsx`
- Modify: `LexicalEditor.tsx`

### Step 1: PasteUrlPlugin.tsx を作成

```typescript
"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
} from "lexical";
import { $isRootOrShadowRoot } from "@lexical/utils";
import { useEffect } from "react";
import { INSERT_BOOKMARK_COMMAND } from "./BookmarkPlugin"; // 既存コマンドを参照

const URL_PATTERN = /^https?:\/\/[^\s]+$/;

export function PasteUrlPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const clipboardData =
          event instanceof ClipboardEvent ? event.clipboardData : null;
        const text = clipboardData?.getData("text/plain")?.trim();

        if (!text || !URL_PATTERN.test(text)) return false;

        let isEmptyParagraph = false;
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
          const node = selection.anchor.getNode();
          const parent = node.getParent();
          if (parent && $isRootOrShadowRoot(parent.getParent())) {
            isEmptyParagraph = node.getTextContent() === "";
          }
        });

        if (!isEmptyParagraph) return false;

        // BookmarkPlugin のコマンドを発行（OGP フェッチ含む）
        editor.dispatchCommand(INSERT_BOOKMARK_COMMAND, { url: text });
        event.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}
```

> **注意:** `INSERT_BOOKMARK_COMMAND` が既存の `BookmarkPlugin.tsx` で `export` されているか確認する。
> されていない場合はエクスポートを追加する。

### Step 2: LexicalEditor.tsx に追加

```typescript
import { PasteUrlPlugin } from './plugins/PasteUrlPlugin'
// EditorInner 内に追加
<PasteUrlPlugin />
```

### Step 3: 検証とコミット

```bash
bun run validate
git commit -m "feat(lexical): add PasteUrlPlugin for auto-bookmark on URL paste"
```

---

## Task 8: CharacterLimitPlugin の追加

**Files:**

- Modify: `LexicalEditor.tsx`（またはエディタの型定義ファイル `types.ts`）

### Step 1: CharacterLimitPlugin の型を確認

```bash
# @lexical/react に CharacterLimitPlugin が存在するか確認
grep -r "CharacterLimitPlugin" node_modules/@lexical/react/
```

> 存在しない場合は `@lexical/react/LexicalCharacterLimitPlugin` のパスを確認する。

### Step 2: LexicalEditor.tsx の props に追加

EditorInner の props に `characterLimit?: number` を追加:

```typescript
function EditorInner({
  contentJson,
  contentHtml,
  onChange,
  disabled = false,
  className,
  showToolbar = true,
  showInspector = true,
  height = '300px',
  placeholder = 'ここに内容を入力...',
  onMarkClick,
  characterLimit,  // 追加
  // ... 既存の props
}: EditorInnerProps) {
```

型定義にも追加（`types.ts` または インラインの `EditorInnerProps`）:

```typescript
characterLimit?: number
```

プラグインリストに条件付きで追加:

```typescript
import { CharacterLimitPlugin } from '@lexical/react/LexicalCharacterLimitPlugin'

// EditorInner の return 内:
{characterLimit !== undefined && (
  <CharacterLimitPlugin charset="UTF-16" maxLength={characterLimit} />
)}
```

### Step 3: 検証とコミット

```bash
bun run validate
git commit -m "feat(lexical): add optional CharacterLimitPlugin per editor instance"
```

---

## 全体の最終検証

```bash
bun run validate && bun run build
bun run test:all
```

### lexical-reviewer エージェントを実行

変更したノードファイルを全て対象に lexical-reviewer エージェントで確認:

- NodeState パターン準拠
- importDOM/exportDOM ペア
- theme.ts デッドエントリなし

### Playwright でビジュアル確認

```bash
bun run e2e
# または playwright で手動確認:
# - TableActionMenu: テーブル内でセル選択 → メニューボタン確認
# - TableCellResizer: テーブル列境界をドラッグ
# - InlineImageNode: / コマンドでインライン画像を挿入
# - TestimonialNode: / コマンドで口コミブロックを挿入
# - FeatureIconListNode: / コマンドで特徴リストを挿入
# - CoverNode: / コマンドでカバーブロックを挿入
# - PasteUrlPlugin: 空行にURLを貼り付けてBookmarkに変換されることを確認
```

### 最終コミット

```bash
git commit -m "feat(lexical): complete Phase 1-3 optimization (official plugins + rental space blocks + UX)"
```
