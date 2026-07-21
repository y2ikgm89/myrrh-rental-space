# Space Card Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Lexical `SpaceCardNode` block that editors can insert into any article body (blog / news / event / space description), which renders on the public site as a live card (photo, name, capacity, tax-included price, "予約する" reserve button) resolved fresh from the database at request time.

**Architecture:** Mirrors the existing `InternalLinkCardNode` → `resolveInternalLinkCards` pattern: the editor only ever persists a `{spaceId, spaceName}` reference as an empty `<a data-space-card-embed>` placeholder (`spaceName` is a non-authoritative editor-preview hint, never used in public output). A new `resolveSpaceCardEmbeds(html)` function (mirroring `resolveInternalLinkCards`) runs on every public request, batch-fetches the referenced spaces via a new `resolveSpaceCardEmbedData` domain query (no `'use cache'`, freshness over cache), and replaces the placeholder with a hand-built HTML string styled via new `[data-space-card-embed-*]` selectors in `lexical-content.css`. If a space is unpublished/inactive/deleted, or the `spaces` Feature Module is off, the card silently disappears (same 404-prevention policy as `InternalLinkCardNode`).

**Tech Stack:** Lexical (`DecoratorNode` + `NodeState` via `createState`/`$getState`/`$setState`), Next.js 16 Server Components (`'use cache'` for the read-heavy list queries, no cache for the resolve-batch query), Prisma 7, bun test.

## Global Constraints

- Run all tests via `bun scripts/run-tests.ts <path>` — never bare `bun test` (process-global `mock.module()` interference + Lexical TDZ without `--conditions production`).
- Files importing `@/shared/db/prisma` must have `import "server-only"` as the first import.
- No `any`/`: any`/`<any>`/`@ts-ignore`/non-null assertion (`!`)/structural `as {` casts — grep-gate enforced at 0 occurrences.
- `'use cache'` must NOT be added to the new resolve-batch functions (`resolveSpaceCardEmbedData`, `resolveSpaceCardEmbeds`) — freshness is a hard requirement from the spec, matching the existing `resolveSpaceCards` precedent.
- Cache tag strings must never be hardcoded — this plan does not need new cache tags (the new query intentionally has no `'use cache'`), so this constraint is satisfied by omission, not by using `CACHE_TAGS`.
- `Space.capacity` and `Space.hourlyPrice` are NOT nullable in `prisma/schema.prisma` (`capacity Int`, `hourlyPrice Decimal @db.Decimal(10,2)`, lines 489/491) — do not add defensive null-handling for these two fields in the new domain type.
- `bun run validate` must pass before any commit; run the specific test file(s) touched by each task, and the full `test:unit` suite before the final commit of each Part.
- **PR split (file-count discipline):** This plan is split into **Part A** (editor authoring infrastructure, Tasks 1–6, 16 files) and **Part B** (public resolution + wiring, Tasks 7–11, 8 files). Each part must land as its own commit/PR — combining them would touch 24 files, over the 20-file soft-stop threshold in this project's autonomous-execution policy. Part A alone is safe to ship (it only affects the admin editor; nothing publishes a live card until Part B lands).

---

## File Structure

**New files:**

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/SpaceCardNode.tsx` — the `DecoratorNode`, state, editor-preview component, factory/guard.
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/SpaceCardPlugin.tsx` — insertion dialog (space search + select).
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/SpaceCardInspectorPanel.tsx` — post-insertion "change referenced space" panel.
- `src/shared/lib/lexical/resolve-space-card-embeds.ts` — public-render-time placeholder resolver (HTML string in/out).
- `__tests__/unit/components/editor/lexical/space-card-node.test.ts` — node round-trip unit test.
- `__tests__/unit/lib/lexical/resolve-space-card-embeds.test.ts` — resolver unit test (domain layer mocked).

**Modified files (Part A):** `config/nodes.ts`, `nodes/index.ts`, `inspector/hooks/inspectable-nodes.ts`, `config/inspector-registry.ts`, `inspector/panels/index.ts`, `inspector/InspectorSidebar.tsx`, `markdown-loss-detection.ts`, `plugins/index.ts`, `config/dialog-registry.ts`, `config/insert-items/embed.ts`, `__tests__/unit/components/editor/lexical/ssot-drift-gates.test.ts`, `__tests__/unit/components/editor/lexical/inspector/inspectable-nodes.test.ts`.

**Modified files (Part B):** `src/shared/domain/spaces/public-queries.ts`, `src/shared/styles/lexical-content.css`, `src/app/(public)/blog/_components/post-detail-page-content.tsx`, `src/app/(public)/news/_components/news-detail-page-content.tsx`, `src/app/(public)/events/[slug]/page.tsx`, `src/app/(public)/spaces/[slug]/_components/space-info.tsx`.

All file paths below are relative to the repo root. This plan is executed inside the isolated worktree at `.claude/worktrees/space-card-embed` — run `bun install` there first if `node_modules` is missing (worktrees don't share `node_modules`).

---

## Part A — Editor Authoring Infrastructure

### Task 1: `SpaceCardNode` — DecoratorNode + round-trip unit test

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/SpaceCardNode.tsx`
- Test: `__tests__/unit/components/editor/lexical/space-card-node.test.ts`

**Interfaces:**

- Produces: `SpaceCardNode` (class), `$createSpaceCardNode({spaceId: string, spaceName: string}): SpaceCardNode`, `$isSpaceCardNode(node): node is SpaceCardNode`, `spaceCardSpaceIdState`, `spaceCardSpaceNameState` (both `NodeState` created via `createState`). `getType()` string is `"space-card-embed"`. `exportDOM()` placeholder shape: `<a data-space-card-embed="true" data-space-id="{id}" data-space-name="{name}" href="#"></a>`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/unit/components/editor/lexical/space-card-node.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { $getState, createEditor } from "lexical";
import {
  $createSpaceCardNode,
  $isSpaceCardNode,
  SpaceCardNode,
  spaceCardSpaceIdState,
  spaceCardSpaceNameState,
} from "@/admin/components/editor/lexical/nodes/SpaceCardNode";

function withEditor(fn: () => void): void {
  const editor = createEditor({
    nodes: [SpaceCardNode],
    onError: (e) => {
      throw e;
    },
  });
  editor.update(fn, { discrete: true });
}

describe("SpaceCardNode", () => {
  test("factory が state を設定する", () => {
    withEditor(() => {
      const node = $createSpaceCardNode({
        spaceId: "spc-1",
        spaceName: "テストスペース",
      });
      expect($isSpaceCardNode(node)).toBe(true);
      expect($getState(node, spaceCardSpaceIdState)).toBe("spc-1");
      expect($getState(node, spaceCardSpaceNameState)).toBe("テストスペース");
    });
  });

  test("exportDOM がプレースホルダー a[data-space-card-embed] を出力する", () => {
    withEditor(() => {
      const node = $createSpaceCardNode({
        spaceId: "spc-9",
        spaceName: "会議室A",
      });
      const { element } = node.exportDOM();
      expect(element).toBeInstanceOf(HTMLElement);
      if (!(element instanceof HTMLElement)) return;
      expect(element.getAttribute("data-space-card-embed")).toBe("true");
      expect(element.getAttribute("data-space-id")).toBe("spc-9");
      expect(element.getAttribute("data-space-name")).toBe("会議室A");
      expect(element.tagName).toBe("A");
    });
  });

  test("importDOM ↔ exportDOM が round-trip する", () => {
    withEditor(() => {
      const node = $createSpaceCardNode({
        spaceId: "spc-42",
        spaceName: "テラスルーム",
      });
      const { element } = node.exportDOM();
      if (!(element instanceof HTMLElement)) throw new Error("not element");

      const conversionMap = SpaceCardNode.importDOM();
      const matcher = conversionMap?.["a"];
      expect(matcher).toBeDefined();
      const conversion = matcher?.(element);
      expect(conversion).not.toBeNull();
      const restored = conversion?.conversion(element);
      const restoredRaw = restored?.node;
      const restoredNode = Array.isArray(restoredRaw)
        ? restoredRaw[0]
        : restoredRaw;
      expect($isSpaceCardNode(restoredNode)).toBe(true);
      if (!$isSpaceCardNode(restoredNode)) return;
      expect($getState(restoredNode, spaceCardSpaceIdState)).toBe("spc-42");
      expect($getState(restoredNode, spaceCardSpaceNameState)).toBe(
        "テラスルーム",
      );
    });
  });

  test("importDOM は data-space-name 欠落時に空文字へ fallback する", () => {
    withEditor(() => {
      const el = document.createElement("a");
      el.setAttribute("data-space-card-embed", "true");
      el.setAttribute("data-space-id", "spc-1");

      const conversionMap = SpaceCardNode.importDOM();
      const conversion = conversionMap?.["a"]?.(el)?.conversion(el);
      const node = conversion?.node;
      const single = Array.isArray(node) ? node[0] : node;
      expect($isSpaceCardNode(single)).toBe(true);
      if (!$isSpaceCardNode(single)) return;
      expect($getState(single, spaceCardSpaceNameState)).toBe("");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun scripts/run-tests.ts __tests__/unit/components/editor/lexical/space-card-node.test.ts`
Expected: FAIL — `Cannot find module '@/admin/components/editor/lexical/nodes/SpaceCardNode'` (file doesn't exist yet).

- [ ] **Step 3: Write the node implementation**

Create `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/SpaceCardNode.tsx`:

```tsx
/**
 * Space Card Node
 *
 * @description スペースの実データ（写真・料金・定員・予約ボタン）を記事本文に埋め込む
 * DecoratorNode。`exportDOM` は空のプレースホルダー `<a data-space-card-embed>` を
 * 出力し、公開描画時に `resolveSpaceCardEmbeds`（`@/shared/lib/lexical/resolve-space-card-embeds`）
 * が DB から最新のスペースデータを解決してカード本体へ差し替える。参照先が削除/非公開なら
 * 自動で非表示になる（404 カードを防ぐ、`InternalLinkCardNode` と同じ方針）。
 *
 * `spaceName` state は挿入/差し替え時に検索結果から複製されるエディタ表示ヒントに
 * すぎない（公開 HTML には一切出力しない）。参照先の名前が変わっても自動更新はされない
 * — 純粋な編集補助であり、公開側の正しさは `spaceId` の解決結果のみが担保する。
 */

import type { ReactElement } from "react";
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
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import { IconBuilding } from "@tabler/icons-react";
import { parseString } from "../config/type-guards";

// =============================================================================
// State
// =============================================================================

export const spaceCardSpaceIdState = createState("spaceId", {
  parse: parseString,
});

export const spaceCardSpaceNameState = createState("spaceName", {
  parse: parseString,
});

// =============================================================================
// Editor preview component
// =============================================================================

function SpaceCardComponent({
  spaceName,
}: {
  spaceName: string;
}): ReactElement {
  return (
    <div
      data-space-card-embed
      className="my-6 flex items-center gap-3 rounded-lg border bg-muted/40 p-4"
    >
      <IconBuilding
        className="h-5 w-5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          スペースカード（公開ページで最新情報に展開されます）
        </p>
        <p className="truncate text-sm font-medium">
          {spaceName || "（未設定）"}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertSpaceCardElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const spaceId = element.getAttribute("data-space-id") ?? "";
  const spaceName = element.getAttribute("data-space-name") ?? "";
  return { node: $createSpaceCardNode({ spaceId, spaceName }) };
}

// =============================================================================
// Node Class
// =============================================================================

export class SpaceCardNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("space-card-embed", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: spaceCardSpaceIdState },
        { flat: true, stateConfig: spaceCardSpaceNameState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      a: (element: HTMLElement) => {
        if (element.hasAttribute("data-space-card-embed")) {
          return { conversion: $convertSpaceCardElement, priority: 2 };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const spaceId = $getState(this, spaceCardSpaceIdState);
    const spaceName = $getState(this, spaceCardSpaceNameState);
    const link = document.createElement("a");
    link.setAttribute("data-space-card-embed", "true");
    link.setAttribute("data-space-id", spaceId);
    link.setAttribute("data-space-name", spaceName);
    link.setAttribute("href", "#");
    return { element: link };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-space-card-embed", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactElement {
    return (
      <SpaceCardComponent
        spaceName={$getState(this, spaceCardSpaceNameState)}
      />
    );
  }
}

// =============================================================================
// Factory / Guard
// =============================================================================

export function $createSpaceCardNode({
  spaceId,
  spaceName,
}: {
  spaceId: string;
  spaceName: string;
}): SpaceCardNode {
  const node = $create(SpaceCardNode);
  $setState(node, spaceCardSpaceIdState, spaceId);
  $setState(node, spaceCardSpaceNameState, spaceName);
  return node;
}

export function $isSpaceCardNode(
  node: LexicalNode | null | undefined,
): node is SpaceCardNode {
  return node instanceof SpaceCardNode;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun scripts/run-tests.ts __tests__/unit/components/editor/lexical/space-card-node.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/SpaceCardNode.tsx" "__tests__/unit/components/editor/lexical/space-card-node.test.ts"
git commit -m "feat(admin): add SpaceCardNode decorator node"
```

---

### Task 2: Register `SpaceCardNode` into `EDITOR_NODES` + barrel export

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/nodes.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/index.ts`

**Interfaces:**

- Consumes: `SpaceCardNode` from Task 1.
- Produces: `SpaceCardNode` importable from the `nodes` barrel; node registered so `createHeadlessEditor`/`createEditor` calls using `EDITOR_NODES` recognize it (required before Gate A of `ssot-drift-gates.test.ts` can pass).

- [ ] **Step 1: Add the node to `config/nodes.ts`**

In `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/nodes.ts`, add the import after the `InternalLinkCardNode` import (currently line 47):

```ts
import { InternalLinkCardNode } from "../nodes/InternalLinkCardNode";
import { SpaceCardNode } from "../nodes/SpaceCardNode";
```

And add `SpaceCardNode,` to the `EDITOR_NODES` array right after `InternalLinkCardNode,` (currently line 151):

```ts
  BookmarkNode,
  InternalLinkCardNode,
  SpaceCardNode,
  StepsContainerNode,
```

- [ ] **Step 2: Add the barrel export to `nodes/index.ts`**

In `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/index.ts`, add after the `InternalLinkCardNode` export block (currently lines 155–162):

```ts
// Space Card Embed
export {
  SpaceCardNode,
  $createSpaceCardNode,
  $isSpaceCardNode,
  spaceCardSpaceIdState,
  spaceCardSpaceNameState,
} from "./SpaceCardNode";
```

- [ ] **Step 3: Verify Gate A of the drift-gate suite passes**

Run: `bun scripts/run-tests.ts __tests__/unit/components/editor/lexical/ssot-drift-gates.test.ts`
Expected: Gate A test ("全 XxxNode class が EDITOR_NODES...に含まれる") passes. Gate B and Gate D will still FAIL at this point (expected — fixed in Tasks 3 and 6). Gate C will also fail until Task 5.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/nodes.ts" "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/index.ts"
git commit -m "feat(admin): register SpaceCardNode in EDITOR_NODES"
```

---

### Task 3: Inspector type union + registry (Gate B)

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/hooks/inspectable-nodes.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/inspector-registry.ts`
- Modify: `__tests__/unit/components/editor/lexical/ssot-drift-gates.test.ts`
- Modify: `__tests__/unit/components/editor/lexical/inspector/inspectable-nodes.test.ts`

**Interfaces:**

- Consumes: `SpaceCardNode`, `$isSpaceCardNode` from Task 1.
- Produces: `"spaceCard"` as a valid `InspectableNodeType`; `SelectedNodeInfo` union gains `{ nodeType: "spaceCard"; node: SpaceCardNode; nodeKey: NodeKey }`; `getInspectableInfoFromRegistry(spaceCardNode)` returns that shape.

- [ ] **Step 1: Write the failing test case**

In `__tests__/unit/components/editor/lexical/inspector/inspectable-nodes.test.ts`, add the import (after the `PricingTableNode` import block, currently lines 46–51):

```ts
import {
  SpaceCardNode,
  $createSpaceCardNode,
} from "@/admin/components/editor/lexical/nodes/SpaceCardNode";
```

Add `SpaceCardNode,` to the `nodes` array inside `createTestEditor()` (currently lines 60–69):

```ts
function createTestEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: "test",
    nodes: [
      ButtonNode,
      ImageNode,
      CalloutNode,
      BookmarkNode,
      InternalLinkCardNode,
      SpaceCardNode,
      InlineIconNode,
      PricingTableContainerNode,
      PricingPlanNode,
    ],
    onError: (error) => {
      throw error;
    },
  });
}
```

Add a new test inside the `describe("getInspectableInfo", ...)` block, after the `InternalLinkCardNode` test (currently lines 172–189):

```ts
test("SpaceCardNodeに対してspaceCard型の情報を返す", async () => {
  await editor.update(() => {
    const root = $getRoot();
    root.clear();
    const spaceCardNode = $createSpaceCardNode({
      spaceId: "spc-1",
      spaceName: "テストスペース",
    });
    root.append(spaceCardNode);

    const info = getInspectableInfo(spaceCardNode);

    expect(info).not.toBeNull();
    expect(info?.nodeType).toBe("spaceCard");
    expect(info?.node).toBe(spaceCardNode);
    expect(info?.nodeKey).toBe(spaceCardNode.getKey());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun scripts/run-tests.ts __tests__/unit/components/editor/lexical/inspector/inspectable-nodes.test.ts`
Expected: FAIL — `info?.nodeType` is `undefined`/`null` (no `spaceCard` case exists yet in the registry).

- [ ] **Step 3: Add the union member to `inspectable-nodes.ts`**

In `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/hooks/inspectable-nodes.ts`, add the type import after the `InternalLinkCardNode` import (currently line 20):

```ts
import type { InternalLinkCardNode } from "../../nodes/InternalLinkCardNode";
import type { SpaceCardNode } from "../../nodes/SpaceCardNode";
```

Add `"spaceCard"` to the `InspectableNodeType` union, right after `"internalLinkCard"` (currently lines 77–78):

```ts
  | "internalLinkCard"
  | "spaceCard"
  | "inlineIcon"
```

Add the union member to `SelectedNodeInfo`, right after the `internalLinkCard` member (currently lines 126–130):

```ts
  | {
      nodeType: "internalLinkCard";
      node: InternalLinkCardNode;
      nodeKey: NodeKey;
    }
  | { nodeType: "spaceCard"; node: SpaceCardNode; nodeKey: NodeKey }
  | { nodeType: "inlineIcon"; node: InlineIconNode; nodeKey: NodeKey }
```

- [ ] **Step 4: Add the registry entry to `inspector-registry.ts`**

In `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/inspector-registry.ts`, add the import after the `InternalLinkCardNode` import (currently line 22):

```ts
import { $isInternalLinkCardNode } from "../nodes/InternalLinkCardNode";
import { $isSpaceCardNode } from "../nodes/SpaceCardNode";
```

Add the check inside `getInspectableInfoFromRegistry`, right after the `internalLinkCard` check (currently lines 92–93):

```ts
if ($isInternalLinkCardNode(node))
  return { nodeType: "internalLinkCard", node, nodeKey };
if ($isSpaceCardNode(node)) return { nodeType: "spaceCard", node, nodeKey };
if ($isInlineIconNode(node)) return { nodeType: "inlineIcon", node, nodeKey };
```

Add `"spaceCard",` to `INSPECTABLE_NODE_TYPES_FROM_REGISTRY`, right after `"internalLinkCard"` (currently line 158):

```ts
    "internalLinkCard",
    "spaceCard",
    "inlineIcon",
```

- [ ] **Step 5: Add the drift-gate table entry**

In `__tests__/unit/components/editor/lexical/ssot-drift-gates.test.ts`, add `SpaceCardNode: "spaceCard",` to `CLASS_NAME_TO_INSPECTOR_NODE_TYPE`, right after `InternalLinkCardNode: "internalLinkCard",` (currently line 218):

```ts
  InternalLinkCardNode: "internalLinkCard",
  SpaceCardNode: "spaceCard",
  InlineIconNode: "inlineIcon",
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun scripts/run-tests.ts __tests__/unit/components/editor/lexical/inspector/inspectable-nodes.test.ts __tests__/unit/components/editor/lexical/ssot-drift-gates.test.ts`
Expected: `inspectable-nodes.test.ts` fully passes. In `ssot-drift-gates.test.ts`, Gate B now passes; Gate D still fails (fixed in Task 6); Gate C still fails (fixed in Task 5).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/hooks/inspectable-nodes.ts" "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/inspector-registry.ts" "__tests__/unit/components/editor/lexical/ssot-drift-gates.test.ts" "__tests__/unit/components/editor/lexical/inspector/inspectable-nodes.test.ts"
git commit -m "feat(admin): register SpaceCardNode as an inspectable node type"
```

---

### Task 4: `SpaceCardInspectorPanel` + sidebar wiring

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/SpaceCardInspectorPanel.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/index.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/InspectorSidebar.tsx`

**Interfaces:**

- Consumes: `SpaceCardNode`, `$isSpaceCardNode`, `spaceCardSpaceIdState`, `spaceCardSpaceNameState` from Task 1; `SelectedNodeInfo` with `nodeType: "spaceCard"` from Task 3; `useNodeUpdater(nodeKey, typeGuard)` from `../hooks/use-node-updater`; `fetchAdminJson` from `@/admin/lib/admin-api-client`; existing `/admin/api/link-cards/search?contentType=space&query=...` route (unchanged, already returns `{contentType, contentId, title, thumbnailUrl}`).
- Produces: `SpaceCardInspectorPanel` component, exported from the `panels` barrel and wired into `InspectorSidebar`'s `renderPanel` switch.

- [ ] **Step 1: Create the panel component**

Create `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/SpaceCardInspectorPanel.tsx`:

```tsx
/**
 * Space Card Inspector Panel
 *
 * @description SpaceCardNode のプロパティ編集パネル。`plugins/SpaceCardPlugin.tsx` と
 * 同じ検索 UI（既存 `/admin/api/link-cards/search?contentType=space` を再利用）で、
 * 新規挿入ではなく既存ノードの spaceId / spaceName を差し替える。
 */

"use client";

import { useState, useTransition } from "react";
import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconAlertCircle, IconLoader2, IconPhoto } from "@tabler/icons-react";
import {
  $isSpaceCardNode,
  type SpaceCardNode,
  spaceCardSpaceIdState,
  spaceCardSpaceNameState,
} from "../../nodes/SpaceCardNode";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Button, Input, Label } from "@/admin/components/ui";

// =============================================================================
// Types
// =============================================================================

type SpaceCardSearchItem = {
  contentType: "space";
  contentId: string;
  title: string;
  thumbnailUrl: string | null;
};

type SpaceCardInspectorPanelProps = {
  nodeKey: string;
  node: SpaceCardNode;
};

// =============================================================================
// Component
// =============================================================================

export function SpaceCardInspectorPanel({
  nodeKey,
  node,
}: SpaceCardInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isSpaceCardNode);

  const { spaceId, spaceName } = editor.read(() => ({
    spaceId: $getState(node, spaceCardSpaceIdState),
    spaceName: $getState(node, spaceCardSpaceNameState),
  }));

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SpaceCardSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runSearch = (nextQuery: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          contentType: "space",
          query: nextQuery.trim(),
        });
        const result = await fetchAdminJson<{ items: SpaceCardSearchItem[] }>(
          `/admin/api/link-cards/search?${params.toString()}`,
          { cache: "no-store" },
        );
        setItems(result.items);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "候補の取得に失敗しました",
        );
        setItems([]);
      }
    });
  };

  const handleSelect = (item: SpaceCardSearchItem) => {
    updateNode((n) => {
      $setState(n, spaceCardSpaceIdState, item.contentId);
      $setState(n, spaceCardSpaceNameState, item.title);
    });
    setItems([]);
    setQuery("");
  };

  return (
    <div>
      <InspectorHeader title="スペースカード" />

      <InspectorSection title="現在の参照先">
        <div className="space-y-2">
          <Label className="text-xs">スペース名</Label>
          <p className="text-sm">{spaceName || "（未設定）"}</p>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">スペース ID</Label>
          <p className="text-xs text-muted-foreground break-all">
            {spaceId || "（未設定）"}
          </p>
        </div>
      </InspectorSection>

      <InspectorSection title="参照先を変更">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch(query);
                }
              }}
              placeholder="スペース名で検索"
              aria-label="スペースをタイトルで検索"
              className="text-sm"
            />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => runSearch(query)}
            disabled={isPending}
            className="w-full"
          >
            {isPending ? (
              <IconLoader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              "検索"
            )}
          </Button>

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <IconAlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {items.length === 0 && !isPending && (
              <li className="py-4 text-center text-xs text-muted-foreground">
                「検索」で公開中のスペースを表示します
              </li>
            )}
            {items.map((item) => (
              <li key={item.contentId}>
                <button
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-md border border-transparent p-2 text-left hover:border-border hover:bg-muted/50"
                >
                  <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <IconPhoto
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.title}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </InspectorSection>
    </div>
  );
}
```

- [ ] **Step 2: Export it from the panels barrel**

In `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/index.ts`, add after the `InternalLinkCardInspectorPanel` export (currently line 10):

```ts
export { InternalLinkCardInspectorPanel } from "./InternalLinkCardInspectorPanel";
export { SpaceCardInspectorPanel } from "./SpaceCardInspectorPanel";
```

- [ ] **Step 3: Wire it into `InspectorSidebar.tsx`**

In `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/InspectorSidebar.tsx`, add to the panels import block, right after `InternalLinkCardInspectorPanel,` (currently line 21):

```ts
  InternalLinkCardInspectorPanel,
  SpaceCardInspectorPanel,
  InlineIconInspectorPanel,
```

Add the `case` inside `renderPanel`, right after the `"internalLinkCard"` case (currently lines 93–99):

```tsx
    case "internalLinkCard":
      return (
        <InternalLinkCardInspectorPanel
          nodeKey={info.nodeKey}
          node={info.node}
        />
      );
    case "spaceCard":
      return <SpaceCardInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "inlineIcon":
```

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: exit 0 (no new TS errors). This step has no dedicated automated test — the panel's manual verification happens in Task 11's browser check.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/SpaceCardInspectorPanel.tsx" "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/index.ts" "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/InspectorSidebar.tsx"
git commit -m "feat(admin): add SpaceCardInspectorPanel"
```

---

### Task 5: Markdown loss-detection registration (Gate C)

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/markdown-loss-detection.ts`

**Interfaces:**

- Consumes: `$isSpaceCardNode` from Task 1.
- Produces: `$hasUnrepresentableMarkdownContent()` returns `true` when a document contains a `SpaceCardNode` (prevents silent content loss on Markdown copy).

- [ ] **Step 1: Add the import and predicate**

In `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/markdown-loss-detection.ts`, add the import after the `InternalLinkCardNode` import (currently line 34):

```ts
import { $isInternalLinkCardNode } from "./nodes/InternalLinkCardNode";
import { $isSpaceCardNode } from "./nodes/SpaceCardNode";
```

Add `$isSpaceCardNode(node) ||` to `isUnrepresentableInMarkdown`, right after `$isInternalLinkCardNode(node) ||` (currently line 68):

```ts
    $isInternalLinkCardNode(node) ||
    $isSpaceCardNode(node) ||
    $isPageBreakNode(node) ||
```

- [ ] **Step 2: Verify Gate C passes**

Run: `bun scripts/run-tests.ts __tests__/unit/components/editor/lexical/ssot-drift-gates.test.ts`
Expected: Gate C test now passes. Gate D still fails (fixed in Task 6). Gates A/B/E pass.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/markdown-loss-detection.ts"
git commit -m "feat(admin): mark SpaceCardNode as unrepresentable in Markdown export"
```

---

### Task 6: `SpaceCardPlugin` insertion dialog + insert-item wiring (Gate D)

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/SpaceCardPlugin.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/index.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/dialog-registry.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items/embed.ts`
- Modify: `__tests__/unit/components/editor/lexical/ssot-drift-gates.test.ts`

**Interfaces:**

- Consumes: `$createSpaceCardNode` from Task 1; existing `/admin/api/link-cards/search?contentType=space&query=...` route (unchanged).
- Produces: `SpaceCardPlugin` component (props `{isOpen: boolean; onClose: () => void}`, matches `DialogPluginProps`); dialog id `"spaceCard"`; insert item id `"spaceCard"` in the "widget" category, appears in both the toolbar Insert menu and the `/` slash-command picker.

- [ ] **Step 1: Create the plugin dialog**

Create `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/SpaceCardPlugin.tsx`:

```tsx
/**
 * Space Card Plugin
 *
 * @description スペースカード挿入ダイアログ。公開済みスペースをタイトル検索して選び、
 * {@link SpaceCardNode}（参照ベース、公開描画時に写真・料金・定員・予約ボタン付きの
 * リッチカードへ解決）を挿入する。`LinkCardPlugin.tsx` の InternalTab と同じ検索 API
 * (`/admin/api/link-cards/search?contentType=space`) を再利用する。
 */

"use client";

import { useState, useTransition } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import { IconAlertCircle, IconLoader2, IconPhoto } from "@tabler/icons-react";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/admin/components/ui";
import { $createSpaceCardNode } from "../nodes/SpaceCardNode";

type SpaceCardSearchItem = {
  contentType: "space";
  contentId: string;
  title: string;
  thumbnailUrl: string | null;
};

type SpaceCardPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function SpaceCardPlugin({ isOpen, onClose }: SpaceCardPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SpaceCardSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runSearch = (nextQuery: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          contentType: "space",
          query: nextQuery.trim(),
        });
        const result = await fetchAdminJson<{ items: SpaceCardSearchItem[] }>(
          `/admin/api/link-cards/search?${params.toString()}`,
          { cache: "no-store" },
        );
        setItems(result.items);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "候補の取得に失敗しました",
        );
        setItems([]);
      }
    });
  };

  const handleSelect = (item: SpaceCardSearchItem) => {
    editor.update(() => {
      $insertNodeToNearestRoot(
        $createSpaceCardNode({
          spaceId: item.contentId,
          spaceName: item.title,
        }),
      );
    });
    setQuery("");
    setItems([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>スペースカードを挿入</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch(query);
                }
              }}
              placeholder="スペース名で検索"
              aria-label="スペースをタイトルで検索"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => runSearch(query)}
              disabled={isPending}
            >
              {isPending ? (
                <IconLoader2 className="h-4 w-4 animate-spin" />
              ) : (
                "検索"
              )}
            </Button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <IconAlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {items.length === 0 && !isPending && (
              <li className="py-6 text-center text-sm text-muted-foreground">
                「検索」で公開中のスペースを表示します
              </li>
            )}
            {items.map((item) => (
              <li key={item.contentId}>
                <button
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-md border border-transparent p-2 text-left hover:border-border hover:bg-muted/50"
                >
                  <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <IconPhoto
                        className="h-5 w-5 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.title}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Export it from the plugins barrel**

In `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/index.ts`, add after the `LinkCardPlugin` export (currently line 118):

```ts
export { LinkCardPlugin } from "./LinkCardPlugin";
export { SpaceCardPlugin } from "./SpaceCardPlugin";
```

- [ ] **Step 3: Register the dialog**

In `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/dialog-registry.ts`, add `SpaceCardPlugin,` to the import from `"../plugins"`, right after `LinkCardPlugin,` (currently line 27):

```ts
  LinkCardPlugin,
  SpaceCardPlugin,
  StepsPlugin,
```

Add `"spaceCard"` to `REGISTRY_DIALOG_IDS`, right after `"linkCard"` (currently line 72):

```ts
  "linkCard",
  "spaceCard",
  "steps",
```

Add the entry to `DIALOG_REGISTRY`, right after the `linkCard` entry (currently line 114):

```ts
  { dialogId: "linkCard", component: LinkCardPlugin },
  { dialogId: "spaceCard", component: SpaceCardPlugin },
  { dialogId: "steps", component: StepsPlugin },
```

- [ ] **Step 4: Add the insert item**

In `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items/embed.ts`, add `IconBuilding,` to the icon import, in alphabetical position right after `IconBrandYoutube,` (currently line 12):

```ts
import {
  IconBrandFigma,
  IconBrandInstagram,
  IconBrandX,
  IconBrandYoutube,
  IconBuilding,
  IconLink,
  IconMap,
  IconMusic,
  IconVideo,
} from "@tabler/icons-react";
```

Add the new item to `EMBED_INSERT_ITEMS`, right after the `linkCard` entry (currently lines 106–128):

```ts
  {
    id: "linkCard",
    type: "dialog",
    label: "リンクカード",
    icon: IconLink,
    keywords: [
      "link",
      "card",
      "bookmark",
      "リンク",
      "カード",
      "internal",
      "external",
      "ogp",
      "記事",
      "関連",
      "shiori",
    ],
    category: "widget",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "linkCard",
  },
  {
    id: "spaceCard",
    type: "dialog",
    label: "スペースカード",
    icon: IconBuilding,
    keywords: [
      "space",
      "スペース",
      "カード",
      "card",
      "予約",
      "reserve",
      "reservation",
      "room",
      "venue",
    ],
    category: "widget",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "spaceCard",
  },
];
```

- [ ] **Step 5: Add the drift-gate table entry**

In `__tests__/unit/components/editor/lexical/ssot-drift-gates.test.ts`, add `SpaceCardNode: "spaceCard",` to `CLASS_NAME_TO_INSERT_ITEM_ID`, right after `InternalLinkCardNode: "linkCard",` (currently line 444):

```ts
  InternalLinkCardNode: "linkCard",
  SpaceCardNode: "spaceCard",
  LayoutContainerNode: "layout",
```

- [ ] **Step 6: Run the full drift-gate suite — Part A should now be fully green**

Run: `bun scripts/run-tests.ts __tests__/unit/components/editor/lexical/ssot-drift-gates.test.ts`
Expected: All 5 gates (A–E) PASS.

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/SpaceCardPlugin.tsx" "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/index.ts" "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/dialog-registry.ts" "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items/embed.ts" "__tests__/unit/components/editor/lexical/ssot-drift-gates.test.ts"
git commit -m "feat(admin): add SpaceCardPlugin insertion dialog and wire insert-item"
```

**Part A checkpoint:** run `bun run validate && bun run test:unit`. Both must be green before opening the Part A PR. At this point editors can insert/search/preview/reassign space cards in the admin editor; nothing on the public site changes yet (Part B does that).

---

## Part B — Public Resolution + Wiring

### Task 7: `resolveSpaceCardEmbedData` domain query

**Files:**

- Modify: `src/shared/domain/spaces/public-queries.ts`

**Interfaces:**

- Produces: `SpaceCardEmbedData` type `{id: string, slug: string, name: string, capacity: number, hourlyPrice: number, mainImageUrl: string}`; `resolveSpaceCardEmbedData(ids: readonly string[]): Promise<Map<string, SpaceCardEmbedData>>` — no `'use cache'`, returns empty `Map` for empty input or when the `spaces` Feature Module is off, excludes unpublished/inactive spaces.

- [ ] **Step 1: Add the `isFeatureEnabled` import**

In `src/shared/domain/spaces/public-queries.ts`, add after the existing `import { parseGallery } from "@/shared/lib/validations/gallery";` (currently line 23):

```ts
import { parseGallery } from "@/shared/lib/validations/gallery";
import { isFeatureEnabled } from "@/shared/lib/features/check";
```

- [ ] **Step 2: Append the type and query function**

At the end of `src/shared/domain/spaces/public-queries.ts` (after `getActiveSpacesByLocationId`, currently ending at line 530), append:

```ts
/**
 * スペースカード埋め込みブロック（Lexical `SpaceCardNode`）の解決用データ。
 * 写真・料金・定員のみを保持する最小構成（`resolveSpaceCardEmbeds` が
 * 税込み価格ラベルの整形を担当するため、ここでは raw な number のまま返す）。
 */
export type SpaceCardEmbedData = {
  id: string;
  slug: string;
  name: string;
  capacity: number;
  hourlyPrice: number;
  mainImageUrl: string;
};

/**
 * スペースカード埋め込みブロックの id 群を公開フィルタ付きで一括解決する。
 *
 * 参照先が非公開/非アクティブなら Map に含まれない（呼び出し側でカードを描画しない
 * ＝404 防止、`resolveLinkCardsByType` と同じ方針）。spaces Feature Module が
 * OFF の場合も空 Map を返す（挿入 UI 側では防がないため、ここが最終防衛線）。
 * 常に最新データを返すため `'use cache'` は付けない（freshness 優先 + id 配列の
 * cache key 肥大回避、既存 resolveSpaceCards と同じ理由）。
 */
export async function resolveSpaceCardEmbedData(
  ids: readonly string[],
): Promise<Map<string, SpaceCardEmbedData>> {
  if (ids.length === 0) return new Map();
  if (!(await isFeatureEnabled("spaces"))) return new Map();

  const uniqueIds = Array.from(new Set(ids));
  const rows = await safeFetch({
    fetch: () =>
      prisma.space.findMany({
        where: { ...PUBLIC_WHERE, id: { in: uniqueIds } },
        select: {
          id: true,
          slug: true,
          name: true,
          capacity: true,
          hourlyPrice: true,
          mainImageUrl: true,
        },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "resolveSpaceCardEmbedData",
  });

  const map = new Map<string, SpaceCardEmbedData>();
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      slug: r.slug,
      name: r.name,
      capacity: r.capacity,
      hourlyPrice: Number(r.hourlyPrice),
      mainImageUrl: r.mainImageUrl,
    });
  }
  return map;
}
```

- [ ] **Step 3: Type-check**

Run: `bun run type-check`
Expected: exit 0. (This function has no dedicated unit test in this plan — mirroring the existing sibling `resolveSpaceCards` in `link-cards/resolve-queries.ts`, which also has no standalone test; both are exercised indirectly through the resolver test in Task 8 via a mocked module boundary, and through the manual browser check in Task 11.)

- [ ] **Step 4: Commit**

```bash
git add "src/shared/domain/spaces/public-queries.ts"
git commit -m "feat(domain): add resolveSpaceCardEmbedData batch query"
```

---

### Task 8: `resolveSpaceCardEmbeds` resolver + unit test

**Files:**

- Create: `src/shared/lib/lexical/resolve-space-card-embeds.ts`
- Test: `__tests__/unit/lib/lexical/resolve-space-card-embeds.test.ts`

**Interfaces:**

- Consumes: `resolveSpaceCardEmbedData` from Task 7 (`@/shared/domain/spaces/public-queries`), `getPublicTaxSettings` (`@/shared/domain/settings/queries/tax`), `formatUnitPriceWithTax` (`@/shared/lib/pricing/format`), `getTaxRate` (`@/shared/lib/pricing/tax`), `TaxRateType` (`@/shared/lib/validations/enums/prisma-types`).
- Produces: `resolveSpaceCardEmbeds(html: string): Promise<string>` — replaces `<a data-space-card-embed ...></a>` placeholders with a resolved `<div data-space-card-embed-resolved>` card, or removes them if unresolved/errored.

- [ ] **Step 1: Write the failing test**

Create `__tests__/unit/lib/lexical/resolve-space-card-embeds.test.ts`:

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TaxDisplayMode } from "@/shared/lib/validations/enums/prisma-types";

mock.module("server-only", () => ({}));

const mockResolveSpaceCardEmbedData = mock<
  (ids: readonly string[]) => Promise<Map<string, unknown>>
>(() => Promise.resolve(new Map()));

mock.module("@/shared/domain/spaces/public-queries", () => ({
  resolveSpaceCardEmbedData: mockResolveSpaceCardEmbedData,
}));

const mockGetPublicTaxSettings = mock(() =>
  Promise.resolve({
    standardRate: 10,
    reducedRate: 8,
    displayModePublic: TaxDisplayMode.tax_included,
  }),
);

mock.module("@/shared/domain/settings/queries/tax", () => ({
  getPublicTaxSettings: mockGetPublicTaxSettings,
}));

const { resolveSpaceCardEmbeds } =
  await import("@/shared/lib/lexical/resolve-space-card-embeds");

const PLACEHOLDER = (id: string, name = "") =>
  `<a data-space-card-embed="true" data-space-id="${id}" data-space-name="${name}" href="#"></a>`;

describe("resolveSpaceCardEmbeds", () => {
  beforeEach(() => {
    mockResolveSpaceCardEmbedData.mockReset();
    mockResolveSpaceCardEmbedData.mockResolvedValue(new Map());
    mockGetPublicTaxSettings.mockClear();
  });

  test("プレースホルダーが無い HTML はそのまま返す（DB アクセスなし）", async () => {
    const html = "<p>hello</p>";
    expect(await resolveSpaceCardEmbeds(html)).toBe(html);
    expect(mockResolveSpaceCardEmbedData).not.toHaveBeenCalled();
    expect(mockGetPublicTaxSettings).not.toHaveBeenCalled();
  });

  test("解決できないプレースホルダーは除去される", async () => {
    const html = `<p>a</p>${PLACEHOLDER("__nope__")}<p>b</p>`;
    const out = await resolveSpaceCardEmbeds(html);
    expect(out).not.toContain("data-space-card-embed");
    expect(out).toContain("<p>a</p>");
    expect(out).toContain("<p>b</p>");
  });

  test("解決できたプレースホルダーはリッチカードに差し替わる（name は HTML escape・税込み価格表示）", async () => {
    mockResolveSpaceCardEmbedData.mockResolvedValueOnce(
      new Map([
        [
          "spc-1",
          {
            id: "spc-1",
            slug: "terrace-room",
            name: "テラス <script> ルーム",
            capacity: 8,
            hourlyPrice: 3000,
            mainImageUrl: "https://x/room.jpg",
          },
        ],
      ]),
    );
    const html = `<p>x</p>${PLACEHOLDER("spc-1", "テラス")}`;
    const out = await resolveSpaceCardEmbeds(html);
    expect(out).toContain('data-space-card-embed-resolved="true"');
    expect(out).toContain('href="/spaces/terrace-room"');
    expect(out).toContain('href="/reservation?spaceId=spc-1"');
    expect(out).toContain("テラス &lt;script&gt; ルーム");
    expect(out).toContain("https://x/room.jpg");
    expect(out).toContain("8名");
    expect(out).toContain("¥3,300/h（税込）");
    expect(out).not.toContain('href="#"');
  });

  test("同一 html 内の複数プレースホルダーの id をまとめて1回で解決し、税設定取得も1回のみ", async () => {
    const html = PLACEHOLDER("spc-1") + PLACEHOLDER("spc-2");
    await resolveSpaceCardEmbeds(html);
    expect(mockResolveSpaceCardEmbedData).toHaveBeenCalledTimes(1);
    expect(mockResolveSpaceCardEmbedData).toHaveBeenCalledWith([
      "spc-1",
      "spc-2",
    ]);
    expect(mockGetPublicTaxSettings).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun scripts/run-tests.ts __tests__/unit/lib/lexical/resolve-space-card-embeds.test.ts`
Expected: FAIL — `Cannot find module '@/shared/lib/lexical/resolve-space-card-embeds'`.

- [ ] **Step 3: Write the resolver**

Create `src/shared/lib/lexical/resolve-space-card-embeds.ts`:

```ts
import "server-only";

import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  resolveSpaceCardEmbedData,
  type SpaceCardEmbedData,
} from "@/shared/domain/spaces/public-queries";
import { getPublicTaxSettings } from "@/shared/domain/settings/queries/tax";
import { formatUnitPriceWithTax } from "@/shared/lib/pricing/format";
import { getTaxRate } from "@/shared/lib/pricing/tax";
import { TaxRateType } from "@/shared/lib/validations/enums/prisma-types";

/**
 * Lexical 本文中のスペースカード埋め込みプレースホルダーを公開描画時に解決する SSoT。
 *
 * `SpaceCardNode.exportDOM()` が出力する
 * `<a data-space-card-embed data-space-id data-space-name href="#"></a>` を抽出し、
 * DB から最新の写真/料金/定員を解決してリッチカードへ差し替える。参照先が削除/非公開/
 * spaces Feature Module OFF なら placeholder ごと除去する（404 カードを防ぐ）。
 *
 * `resolveInternalLinkCards` と同じく regex ベースの純粋 HTML 後処理として実装する。
 * 税率は既存の公開 SpaceCard コンポーネント（`(public)/_components/space-list/space-card.tsx`）
 * と同じ簡略化で `TaxRateType.standard` 固定（`Space.taxRateType` による分岐はしない）。
 */

const PLACEHOLDER_RE = /<a\b[^>]*\bdata-space-card-embed\b[^>]*>\s*<\/a>/gi;

function extractAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}=["']([^"']*)["']`, "i");
  return re.exec(tag)?.[1] ?? null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSpaceCardHtml(
  card: SpaceCardEmbedData,
  priceLabel: string,
): string {
  const detailHref = escapeHtml(`/spaces/${card.slug}`);
  const reserveHref = escapeHtml(`/reservation?spaceId=${card.id}`);
  const name = escapeHtml(card.name);
  const image = escapeHtml(card.mainImageUrl);
  const meta = escapeHtml(`${card.capacity}名 ・ ${priceLabel}`);

  return (
    `<div data-space-card-embed-resolved="true">` +
    `<a data-space-card-embed-image href="${detailHref}"><img src="${image}" alt="" loading="lazy" /></a>` +
    `<div data-space-card-embed-body>` +
    `<a data-space-card-embed-title href="${detailHref}"><h4>${name}</h4></a>` +
    `<p data-space-card-embed-meta>${meta}</p>` +
    `<a data-space-card-embed-cta href="${reserveHref}">予約する</a>` +
    `</div>` +
    `</div>`
  );
}

export async function resolveSpaceCardEmbeds(html: string): Promise<string> {
  if (!html || !html.includes("data-space-card-embed")) return html;

  try {
    const ids = new Set<string>();
    for (const match of html.matchAll(PLACEHOLDER_RE)) {
      const id = extractAttr(match[0], "data-space-id");
      if (id) ids.add(id);
    }

    if (ids.size === 0) {
      return html.replace(PLACEHOLDER_RE, "");
    }

    const [resolved, tax] = await Promise.all([
      resolveSpaceCardEmbedData(Array.from(ids)),
      getPublicTaxSettings(),
    ]);
    const taxRate = getTaxRate(TaxRateType.standard, tax);

    return html.replace(PLACEHOLDER_RE, (tag) => {
      const id = extractAttr(tag, "data-space-id");
      if (!id) return "";
      const card = resolved.get(id);
      if (!card) return "";
      const priceLabel = formatUnitPriceWithTax(
        card.hourlyPrice,
        taxRate,
        tax.displayModePublic,
        "/h",
      );
      return renderSpaceCardHtml(card, priceLabel);
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "resolveSpaceCardEmbeds" },
    });
    return html.replace(PLACEHOLDER_RE, "");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun scripts/run-tests.ts __tests__/unit/lib/lexical/resolve-space-card-embeds.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/shared/lib/lexical/resolve-space-card-embeds.ts" "__tests__/unit/lib/lexical/resolve-space-card-embeds.test.ts"
git commit -m "feat(public): add resolveSpaceCardEmbeds placeholder resolver"
```

---

### Task 9: Wire `resolveSpaceCardEmbeds` into the 4 public detail pages

**Files:**

- Modify: `src/app/(public)/blog/_components/post-detail-page-content.tsx`
- Modify: `src/app/(public)/news/_components/news-detail-page-content.tsx`
- Modify: `src/app/(public)/events/[slug]/page.tsx`
- Modify: `src/app/(public)/spaces/[slug]/_components/space-info.tsx`

**Interfaces:**

- Consumes: `resolveSpaceCardEmbeds` from Task 8.
- Produces: each page's rendered HTML runs through `resolveInternalLinkCards` then `resolveSpaceCardEmbeds` before reaching `SanitizedHtml`.

- [ ] **Step 1: `post-detail-page-content.tsx`**

Add the import after the existing `resolveInternalLinkCards` import (currently line 18):

```ts
import { resolveInternalLinkCards } from "@/shared/lib/lexical/resolve-internal-link-cards";
import { resolveSpaceCardEmbeds } from "@/shared/lib/lexical/resolve-space-card-embeds";
```

Replace the single resolve line (currently line 84):

```ts
const resolvedContentHtml = await resolveInternalLinkCards(post.contentHtml);
```

with:

```ts
const linkCardsResolvedHtml = await resolveInternalLinkCards(post.contentHtml);
const resolvedContentHtml = await resolveSpaceCardEmbeds(linkCardsResolvedHtml);
```

- [ ] **Step 2: `news-detail-page-content.tsx`**

Add the import after the existing `resolveInternalLinkCards` import (currently line 14):

```ts
import { resolveInternalLinkCards } from "@/shared/lib/lexical/resolve-internal-link-cards";
import { resolveSpaceCardEmbeds } from "@/shared/lib/lexical/resolve-space-card-embeds";
```

Replace the resolve block (currently lines 82–84):

```ts
const resolvedContentHtml = await resolveInternalLinkCards(
  newsItem.contentHtml,
);
```

with:

```ts
const linkCardsResolvedHtml = await resolveInternalLinkCards(
  newsItem.contentHtml,
);
const resolvedContentHtml = await resolveSpaceCardEmbeds(linkCardsResolvedHtml);
```

- [ ] **Step 3: `events/[slug]/page.tsx`**

Add the import directly after the existing `resolveInternalLinkCards` import (currently line 13):

```ts
import { resolveInternalLinkCards } from "@/shared/lib/lexical/resolve-internal-link-cards";
import { resolveSpaceCardEmbeds } from "@/shared/lib/lexical/resolve-space-card-embeds";
```

Replace the resolve block (currently lines 176–178):

```tsx
const resolvedDescriptionHtml = await resolveInternalLinkCards(
  event.descriptionHtml,
);
```

with:

```tsx
const linkCardsResolvedDescriptionHtml = await resolveInternalLinkCards(
  event.descriptionHtml,
);
const resolvedDescriptionHtml = await resolveSpaceCardEmbeds(
  linkCardsResolvedDescriptionHtml,
);
```

- [ ] **Step 4: `space-info.tsx`**

Add the import after the existing `resolveInternalLinkCards` import (currently line 4):

```ts
import { resolveInternalLinkCards } from "@/shared/lib/lexical/resolve-internal-link-cards";
import { resolveSpaceCardEmbeds } from "@/shared/lib/lexical/resolve-space-card-embeds";
```

Replace the resolve block (currently lines 37–39):

```tsx
const resolvedDescriptionHtml = await resolveInternalLinkCards(
  space.descriptionHtml,
);
```

with:

```tsx
const linkCardsResolvedDescriptionHtml = await resolveInternalLinkCards(
  space.descriptionHtml,
);
const resolvedDescriptionHtml = await resolveSpaceCardEmbeds(
  linkCardsResolvedDescriptionHtml,
);
```

- [ ] **Step 5: Type-check**

Run: `bun run type-check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/blog/_components/post-detail-page-content.tsx" "src/app/(public)/news/_components/news-detail-page-content.tsx" "src/app/(public)/events/[slug]/page.tsx" "src/app/(public)/spaces/[slug]/_components/space-info.tsx"
git commit -m "feat(public): resolve space card embeds in article/event/space bodies"
```

---

### Task 10: CSS for the resolved card

**Files:**

- Modify: `src/shared/styles/lexical-content.css`

**Interfaces:**

- Produces: `[data-space-card-embed-resolved]`, `[data-space-card-embed-image]`, `[data-space-card-embed-body]`, `[data-space-card-embed-title]`, `[data-space-card-embed-meta]`, `[data-space-card-embed-cta]` selectors styling the HTML produced by `renderSpaceCardHtml` in Task 8.

- [ ] **Step 1: Insert the new CSS section**

In `src/shared/styles/lexical-content.css`, insert a new section immediately after the `[data-internal-link-card-excerpt]` rule and before the `/* 1h. Image */` comment block (currently between lines 1578 and 1580):

```css
[data-internal-link-card-excerpt] {
  font-size: 0.75rem;
  color: var(--color-muted-foreground);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* --------------------------------------------------------------------------
 * 1g-3. Space Card Embed (resolved)
 *
 * 公開描画時に resolveSpaceCardEmbeds が出力するリッチカード。
 * data-space-card-embed-resolved: コンテナ
 * data-space-card-embed-image: 写真リンク
 * data-space-card-embed-body: テキスト列
 * data-space-card-embed-title: タイトルリンク
 * data-space-card-embed-meta: 定員・料金
 * data-space-card-embed-cta: 予約するボタン
 * -------------------------------------------------------------------------- */

[data-space-card-embed-resolved] {
  display: flex;
  flex-direction: column;
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0;
  overflow: hidden;
}

[data-space-card-embed-image] {
  display: block;
  aspect-ratio: 16 / 9;
  background-color: var(--color-muted);
}

[data-space-card-embed-image] > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

[data-space-card-embed-body] {
  padding: 1rem 1.25rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

[data-space-card-embed-title] {
  text-decoration: none;
  color: inherit;
}

[data-space-card-embed-title] > h4 {
  font-weight: 500;
  font-size: 1rem;
  margin: 0;
}

[data-space-card-embed-meta] {
  font-size: 0.8125rem;
  color: var(--color-muted-foreground);
  margin: 0;
}

[data-space-card-embed-cta] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  margin-top: 0.25rem;
  padding: 0.5rem 1.25rem;
  min-height: var(--touch-target-min, 44px);
  border: 1px solid var(--color-foreground);
  border-radius: 0;
  font-size: 0.8125rem;
  text-decoration: none;
  color: var(--color-foreground);
  transition:
    background-color 0.15s,
    color 0.15s;
}

[data-space-card-embed-cta]:hover {
  background-color: var(--color-foreground);
  color: var(--color-background);
}
```

- [ ] **Step 2: Verify no build regression**

Run: `bun run lint-format`
Expected: exit 0 (Prettier/ESLint pass on the CSS file).

- [ ] **Step 3: Commit**

```bash
git add "src/shared/styles/lexical-content.css"
git commit -m "style(public): add space card embed CSS"
```

---

### Task 11: Full validation + manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full validation gate**

Run: `bun run validate && bun run build`
Expected: exit 0 for both.

- [ ] **Step 2: Run the full unit and integration suites**

Run: `bun run test:unit`
Expected: all pass, including `ssot-drift-gates.test.ts` (all 5 gates), `space-card-node.test.ts`, `inspector/inspectable-nodes.test.ts`, `resolve-space-card-embeds.test.ts`.

Run: `bun run test:integration`
Expected: all pass (no test in this plan touches the integration suite directly, but this confirms no regression in `architecture-boundaries.test.ts`-adjacent DB-backed suites).

- [ ] **Step 3: Manual browser verification — admin editor**

Start the dev server if not already running (`bun run dev` — per project convention, run this manually yourself, do not have an agent start/stop it). In the admin post/news editor:

1. Open the `/` slash-command menu or the toolbar Insert menu → confirm "スペースカード" appears under the widget/媒体 group.
2. Insert a space card, search for an existing published space by name, select it.
3. Confirm the editor shows a preview card with the icon + the selected space's name (not a raw UUID).
4. Select the inserted card → confirm the right-side Inspector shows "スペースカード" with "現在の参照先" populated, and that searching + selecting a different space updates the preview.
5. Save the article as a draft, reload the editor → confirm the space name hint is still shown (persisted state, not lost on reload).

- [ ] **Step 4: Manual browser verification — public page**

1. Publish (or preview) the article containing the space card.
2. On the public blog/news page, confirm the card renders: photo, name, capacity, tax-included price, and a "予約する" button.
3. Click the photo or title → confirm navigation to `/spaces/{slug}`.
4. Click "予約する" → confirm navigation to `/reservation?spaceId={id}` with the space pre-selected.
5. In the admin, unpublish the referenced space, reload the public article → confirm the card disappears entirely (no broken placeholder, no layout break).

- [ ] **Step 5: Final commit (if any fixes were needed during manual verification)**

If Steps 3–4 surfaced any fix, commit it with a `fix(...)` message referencing the specific defect found, following the same TDD loop as the task where the defect originated.
