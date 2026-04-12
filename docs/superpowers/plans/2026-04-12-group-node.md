# GroupNode（ボックス装飾コンテナ）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SWELL ライクな15プリセットボックス装飾コンテナ（GroupNode）を Lexical 0.43 NodeState API で実装する

**Architecture:** 単一 ElementNode（GroupNode）+ `groupStyle`（15プリセット）と `color`（AccentColor 10色）の2 state。CalloutNode と同一パターンで挿入・InspectorPanel 編集。CSS は `[data-group-style]` アトリビュートセレクタで全スタイルを実装。

**Tech Stack:** Lexical 0.43 NodeState API / React 19 / TypeScript 6 / Tailwind 4

**Spec:** `docs/superpowers/specs/2026-04-12-group-node-design.md`

---

## ファイルマップ

| 操作   | パス                                                                                                           | 責務                    |
| ------ | -------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Create | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/GroupNode.tsx`                      | ノードクラス・state・型 |
| Create | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/GroupPlugin.tsx`                  | コマンド・transform・UX |
| Create | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/GroupInspectorPanel.tsx` | スタイル/色選択パネル   |
| Modify | `src/shared/styles/lexical-content.css`                                                                        | 15プリセット CSS 追記   |
| Modify | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/nodes.ts`                          | EDITOR_NODES 登録       |
| Modify | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/index.ts`                           | barrel export           |
| Modify | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/index.ts`                         | barrel export           |
| Modify | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items.ts`                   | 挿入メニュー登録        |
| Modify | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/inspector-registry.ts`             | inspector 判定追加      |
| Modify | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/hooks/inspectable-nodes.ts`     | 型定義追加              |
| Modify | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/InspectorSidebar.tsx`           | switch case 追加        |
| Modify | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/index.ts`                | panel export            |

**Lexical ベースパス（以降 `L/` と略記）:** `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical`

---

### Task 1: GroupNode ノードクラス

**Files:**

- Create: `L/nodes/GroupNode.tsx`

- [ ] **Step 1: GroupNode.tsx を作成**

```typescript
/**
 * Group Node
 *
 * @description SWELLライクなボックス装飾コンテナ（ElementNode）
 * 15種のスタイルプリセット + AccentColor 10色
 */

"use client";

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import {
  $create,
  $getState,
  $getStateChange,
  $setState,
  createState,
  ElementNode,
  $createParagraphNode,
  $isElementNode,
} from "lexical";
import { createEnumGuard } from "../config/type-guards";
import { type AccentColor, isAccentColor } from "../config/accent-colors";

// =============================================================================
// Types
// =============================================================================

export type GroupStyle =
  | "solid-border"
  | "dashed-border"
  | "solid-accent"
  | "dashed-accent"
  | "left-border"
  | "filled"
  | "filled-light"
  | "gray-bg"
  | "stripe"
  | "grid"
  | "stitch"
  | "emboss"
  | "kakko"
  | "big-kakko"
  | "note";

export const GROUP_STYLES: readonly GroupStyle[] = [
  "solid-border",
  "dashed-border",
  "solid-accent",
  "dashed-accent",
  "left-border",
  "filled",
  "filled-light",
  "gray-bg",
  "stripe",
  "grid",
  "stitch",
  "emboss",
  "kakko",
  "big-kakko",
  "note",
] as const;

export const GROUP_STYLE_CATEGORIES = {
  border: [
    "solid-border",
    "dashed-border",
    "solid-accent",
    "dashed-accent",
    "left-border",
  ] as const,
  background: ["filled", "filled-light", "gray-bg", "stripe", "grid"] as const,
  decoration: ["stitch", "emboss", "kakko", "big-kakko", "note"] as const,
} as const;

export const GROUP_STYLE_LABELS: Record<GroupStyle, string> = {
  "solid-border": "実線",
  "dashed-border": "破線",
  "solid-accent": "実線（カラー）",
  "dashed-accent": "破線（カラー）",
  "left-border": "左線",
  filled: "塗り",
  "filled-light": "淡い塗り",
  "gray-bg": "グレー背景",
  stripe: "ストライプ",
  grid: "方眼",
  stitch: "ステッチ",
  emboss: "エンボス",
  kakko: "かっこ",
  "big-kakko": "大かっこ",
  note: "付箋",
};

// =============================================================================
// Type Guards
// =============================================================================

export const isGroupStyle = createEnumGuard<GroupStyle>(GROUP_STYLES);

// =============================================================================
// State
// =============================================================================

export const groupStyleState = createState("groupStyle", {
  parse: (v: unknown): GroupStyle =>
    typeof v === "string" && isGroupStyle(v) ? v : "solid-border",
});

export const groupColorState = createState("color", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertGroupElement(
  element: HTMLElement,
): DOMConversionOutput | null {
  const styleAttr = element.getAttribute("data-group-style");
  const colorAttr = element.getAttribute("data-color");
  const groupStyle =
    typeof styleAttr === "string" && isGroupStyle(styleAttr)
      ? styleAttr
      : "solid-border";
  const color =
    typeof colorAttr === "string" && isAccentColor(colorAttr)
      ? colorAttr
      : "default";
  const node = $createGroupNode(groupStyle, color);
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class GroupNode extends ElementNode {
  override $config() {
    return this.config("group", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: groupStyleState },
        { flat: true, stateConfig: groupColorState },
      ],
    });
  }

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

  override exportDOM(): DOMExportOutput {
    const style = $getState(this, groupStyleState);
    const color = $getState(this, groupColorState);
    const element = document.createElement("div");
    element.setAttribute("data-group", "true");
    element.setAttribute("data-group-style", style);
    if (color !== "default") {
      element.setAttribute("data-color", color);
    }
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const style = $getState(this, groupStyleState);
    const color = $getState(this, groupColorState);
    const element = document.createElement("div");
    element.setAttribute("data-group", "true");
    element.setAttribute("data-group-style", style);
    if (color !== "default") {
      element.setAttribute("data-color", color);
    }
    return element;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const styleChange = $getStateChange(this, prevNode, groupStyleState);
    if (styleChange !== null) {
      dom.setAttribute("data-group-style", styleChange[0]);
    }
    const colorChange = $getStateChange(this, prevNode, groupColorState);
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

  override isShadowRoot(): boolean {
    return true;
  }

  override canBeEmpty(): false {
    return false;
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }

  override collapseAtStart(): boolean {
    const children = this.getChildren();
    const paragraph = $createParagraphNode();

    if (children.length > 0) {
      const firstChild = children[0];
      if ($isElementNode(firstChild)) {
        const firstChildChildren = firstChild.getChildren();
        for (const child of firstChildChildren) {
          paragraph.append(child);
        }
      }
    }

    this.replace(paragraph);
    return true;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createGroupNode(
  groupStyle: GroupStyle = "solid-border",
  color: AccentColor = "default",
): GroupNode {
  const node = $create(GroupNode);
  $setState(node, groupStyleState, groupStyle);
  $setState(node, groupColorState, color);
  return node;
}

export function $isGroupNode(
  node: LexicalNode | null | undefined,
): node is GroupNode {
  return node instanceof GroupNode;
}
```

- [ ] **Step 2: type-check で構文確認**

Run: `bun run type-check`
Expected: GroupNode.tsx に型エラーなし（未登録のため import エラーは後続タスクで解消）

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/GroupNode.tsx'
git commit -m "feat(lexical): add GroupNode with 15 style presets + AccentColor"
```

---

### Task 2: GroupPlugin

**Files:**

- Create: `L/plugins/GroupPlugin.tsx`

- [ ] **Step 1: GroupPlugin.tsx を作成**

```typescript
/**
 * Group Plugin
 *
 * @description グループ（ボックス装飾コンテナ）の挿入と構造管理
 */

"use client";

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  createCommand,
  mergeRegister,
  type LexicalCommand,
  type LexicalEditor,
} from "lexical";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createGroupNode,
  $isGroupNode,
  GroupNode,
  type GroupStyle,
} from "../nodes/GroupNode";

// =============================================================================
// Commands
// =============================================================================

export type InsertGroupPayload = {
  groupStyle: GroupStyle;
};

export const INSERT_GROUP_COMMAND: LexicalCommand<InsertGroupPayload> =
  createCommand("INSERT_GROUP_COMMAND");

// =============================================================================
// Utilities
// =============================================================================

function $onEscape(editor: LexicalEditor, direction: "up" | "down"): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const node = selection.anchor.getNode();
  let groupNode: GroupNode | null = null;
  let current = node.getParent();

  while (current) {
    if ($isGroupNode(current)) {
      groupNode = current;
      break;
    }
    current = current.getParent();
  }

  if (!groupNode) return false;

  const isAtStart = selection.anchor.offset === 0;
  const isAtEnd =
    selection.anchor.offset === selection.anchor.getNode().getTextContentSize();

  if ((direction === "up" && isAtStart) || (direction === "down" && isAtEnd)) {
    const paragraph = $createParagraphNode();
    if (direction === "up") {
      groupNode.insertBefore(paragraph);
    } else {
      groupNode.insertAfter(paragraph);
    }
    paragraph.select();
    return true;
  }

  return false;
}

// =============================================================================
// Component
// =============================================================================

export function GroupPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        INSERT_GROUP_COMMAND,
        (payload) => {
          editor.update(() => {
            const group = $createGroupNode(payload.groupStyle);
            const paragraph = $createParagraphNode();
            group.append(paragraph);
            $insertNodeToNearestRoot(group);
            paragraph.selectEnd();
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => $onEscape(editor, "up"),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => $onEscape(editor, "down"),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerNodeTransform(GroupNode, (node) => {
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode();
          node.append(paragraph);
        }
      }),
    );
  }, [editor]);

  return null;
}
```

- [ ] **Step 2: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/GroupPlugin.tsx'
git commit -m "feat(lexical): add GroupPlugin with insert command and arrow key escape"
```

---

### Task 3: GroupInspectorPanel

**Files:**

- Create: `L/inspector/panels/GroupInspectorPanel.tsx`

- [ ] **Step 1: GroupInspectorPanel.tsx を作成**

```typescript
/**
 * Group Inspector Panel
 *
 * @description GroupNodeのスタイル・カラー編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isGroupNode,
  type GroupNode,
  type GroupStyle,
  GROUP_STYLE_CATEGORIES,
  GROUP_STYLE_LABELS,
  groupStyleState,
  groupColorState,
  isGroupStyle,
} from "../../nodes/GroupNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { ColorSwatchPicker } from "../ColorSwatchPicker";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Label } from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";

// =============================================================================
// Constants
// =============================================================================

const CATEGORY_LABELS = {
  border: "ボーダー",
  background: "背景",
  decoration: "装飾",
} as const;

// =============================================================================
// Types
// =============================================================================

type GroupInspectorPanelProps = {
  nodeKey: string;
  node: GroupNode;
};

// =============================================================================
// Component
// =============================================================================

export function GroupInspectorPanel({
  nodeKey,
  node,
}: GroupInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isGroupNode);

  const { currentStyle, currentColor } = editor.getEditorState().read(() => ({
    currentStyle: $getState(node, groupStyleState),
    currentColor: $getState(node, groupColorState),
  }));

  const handleStyleChange = (value: string) => {
    if (isGroupStyle(value)) {
      updateNode((n) => {
        $setState(n, groupStyleState, value);
      });
    }
  };

  return (
    <div>
      <InspectorHeader title="グループ" />

      <InspectorSection title="スタイル">
        {(Object.entries(GROUP_STYLE_CATEGORIES) as [keyof typeof GROUP_STYLE_CATEGORIES, readonly GroupStyle[]][]).map(
          ([category, styles]) => (
            <div key={category} className="space-y-1.5">
              <Label className="text-xs">{CATEGORY_LABELS[category]}</Label>
              <div className="grid grid-cols-5 gap-1">
                {styles.map((style) => (
                  <button
                    key={style}
                    type="button"
                    title={GROUP_STYLE_LABELS[style]}
                    onClick={() => handleStyleChange(style)}
                    className={cn(
                      "h-8 rounded border text-[10px] leading-tight transition-shadow",
                      currentStyle === style
                        ? "ring-2 ring-ring ring-offset-1"
                        : "hover:ring-1 hover:ring-border",
                    )}
                    aria-label={GROUP_STYLE_LABELS[style]}
                    aria-pressed={currentStyle === style}
                  >
                    <span
                      className="flex h-full w-full items-center justify-center rounded-sm"
                      data-group-style={style}
                    />
                  </button>
                ))}
              </div>
            </div>
          ),
        )}
      </InspectorSection>

      <InspectorSection title="カラー">
        <ColorSwatchPicker
          value={currentColor}
          onChange={(color) =>
            updateNode((n) => {
              $setState(n, groupColorState, color);
            })
          }
        />
      </InspectorSection>
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/GroupInspectorPanel.tsx'
git commit -m "feat(lexical): add GroupInspectorPanel with style grid and color picker"
```

---

### Task 4: CSS スタイル（lexical-content.css）

**Files:**

- Modify: `src/shared/styles/lexical-content.css`

- [ ] **Step 1: lexical-content.css の末尾付近（`[data-callout-type]` セクションの前あたり）に以下を追記**

追記位置は `[data-callout-type]` セクション（line 718 付近）の直前。

```css
/* --------------------------------------------------------------------------
 * Group Node — ボックス装飾コンテナ（15 プリセット）
 * data-group: ノード識別
 * data-group-style: スタイルプリセット
 * data-color: AccentColor（既存 [data-color] CSS 変数と連携）
 * -------------------------------------------------------------------------- */

[data-group] {
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
  padding: 1.25rem;
  border-radius: 0.5rem;
}

[data-group] > :last-child {
  margin-bottom: 0;
}

/* ---- Border ---- */

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

/* ---- Background ---- */

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

/* ---- Decoration ---- */

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

- [ ] **Step 2: コミット**

```bash
git add src/shared/styles/lexical-content.css
git commit -m "feat(lexical): add CSS for 15 GroupNode style presets"
```

---

### Task 5: 9箇所チェックリスト登録

**Files:**

- Modify: `L/config/nodes.ts`
- Modify: `L/nodes/index.ts`
- Modify: `L/plugins/index.ts`
- Modify: `L/config/insert-items.ts`
- Modify: `L/config/inspector-registry.ts`
- Modify: `L/inspector/hooks/inspectable-nodes.ts`
- Modify: `L/inspector/InspectorSidebar.tsx`
- Modify: `L/inspector/panels/index.ts`

- [ ] **Step 1: config/nodes.ts — import 追加 + EDITOR_NODES 登録**

import を追加（CaptionBoxContentNode の import の後に）:

```typescript
import { GroupNode } from "../nodes/GroupNode";
```

`EDITOR_NODES` 配列の末尾（`CaptionBoxContentNode,` の次の行）に追加:

```typescript
  GroupNode,
```

- [ ] **Step 2: nodes/index.ts — barrel export 追加**

ファイル末尾に追加:

```typescript
export {
  GroupNode,
  $createGroupNode,
  $isGroupNode,
  groupStyleState,
  groupColorState,
  GROUP_STYLES,
  GROUP_STYLE_CATEGORIES,
  GROUP_STYLE_LABELS,
  isGroupStyle,
} from "./GroupNode";
export type { GroupStyle } from "./GroupNode";
```

- [ ] **Step 3: plugins/index.ts — barrel export 追加**

`CalloutPlugin` の export 行（`export { CalloutPlugin, INSERT_CALLOUT_COMMAND } from "./CalloutPlugin";`）の後に追加:

```typescript
export { GroupPlugin, INSERT_GROUP_COMMAND } from "./GroupPlugin";
```

- [ ] **Step 4: config/insert-items.ts — 挿入メニュー登録**

import セクションで `INSERT_GROUP_COMMAND` を追加:

```typescript
import { INSERT_GROUP_COMMAND } from "../plugins/GroupPlugin";
```

`IconBoxMultiple` は既に import 済み（line 57）。

callout エントリ（`id: "callout"` — line 557 付近）の直前に追加:

```typescript
  {
    id: "group",
    type: "command",
    label: "グループ",
    icon: IconBoxMultiple,
    keywords: [
      "group",
      "box",
      "container",
      "border",
      "background",
      "guruupu",
      "bokkusu",
      "waku",
    ],
    category: "layout",
    showInToolbar: true,
    showInPicker: true,
    dispatch: (editor) =>
      editor.dispatchCommand(INSERT_GROUP_COMMAND, {
        groupStyle: "solid-border",
      }),
  },
```

**注意:** `IconBoxMultiple` は既に別エントリ（`id: "blockTemplate"` line 759）で使われている。アイコンの重複を避けるため `IconBox` に変更する。import セクションに `IconBox` がなければ追加する。

- [ ] **Step 5: config/inspector-registry.ts — 判定追加**

import セクションに追加:

```typescript
import { $isGroupNode } from "../nodes/GroupNode";
```

`getInspectableInfoFromRegistry` 関数内、`$isCalloutNode` 判定の直前に追加:

```typescript
if ($isGroupNode(node)) return { nodeType: "group", node, nodeKey };
```

`INSPECTABLE_NODE_TYPES_FROM_REGISTRY` 配列に `"group"` を追加（`"callout"` の前）:

```typescript
    "group",
```

- [ ] **Step 6: inspector/hooks/inspectable-nodes.ts — 型定義追加**

import セクションに追加:

```typescript
import type { GroupNode } from "../../nodes/GroupNode";
```

`InspectableNodeType` union に `"group"` を追加（`"callout"` の前）:

```typescript
  | "group"
```

`SelectedNodeInfo` union に追加（`callout` の行の前）:

```typescript
  | { nodeType: "group"; node: GroupNode; nodeKey: NodeKey }
```

- [ ] **Step 7: inspector/InspectorSidebar.tsx — パネルルーティング追加**

import セクションの `CalloutInspectorPanel` の行の後に追加:

```typescript
  GroupInspectorPanel,
```

`renderPanel` 関数内の `case "callout":` の直前に追加:

```typescript
    case "group":
      return <GroupInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
```

- [ ] **Step 8: inspector/panels/index.ts — panel export 追加**

`CalloutInspectorPanel` の export 行の後に追加:

```typescript
export { GroupInspectorPanel } from "./GroupInspectorPanel";
```

- [ ] **Step 9: type-check 実行**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 10: コミット**

```bash
git add -A
git commit -m "feat(lexical): register GroupNode in all 9 checklist locations"
```

---

### Task 6: LexicalEditor.tsx にプラグイン追加

**Files:**

- Modify: `L/LexicalEditor.tsx`

- [ ] **Step 1: LexicalEditor.tsx 内で GroupPlugin を追加**

`<CalloutPlugin>` の近くに `<GroupPlugin />` を追加する。GroupPlugin は props なし（ダイアログなし）なのでシンプルに配置:

```typescript
<GroupPlugin />
```

import は `plugins/index.ts` barrel 経由。既に他のプラグインが barrel から import されている場合はそこに追加:

```typescript
import { GroupPlugin } from "./plugins/GroupPlugin";
```

- [ ] **Step 2: type-check + validate 実行**

Run: `bun run validate`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/LexicalEditor.tsx'
git commit -m "feat(lexical): mount GroupPlugin in LexicalEditor"
```

---

### Task 7: 動作確認 + validate + build

- [ ] **Step 1: validate 実行**

Run: `bun run validate`
Expected: type-check + lint ともにエラーなし

- [ ] **Step 2: build 実行**

Run: `bun run build:skip-env`
Expected: ビルド成功

- [ ] **Step 3: 最終コミット（必要な場合のみ）**

validate/build で自動修正が入った場合のみコミット:

```bash
git add -A
git commit -m "fix(lexical): address lint/format issues from GroupNode integration"
```
