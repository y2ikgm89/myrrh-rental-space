# Lexical エディタ改善 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Lexical 0.40.0 NodeState API・React 19 + React Compiler 1.0・CSS-first data-attribute パターンに完全準拠した上で、VimeoNode・MapEmbedNode・RubyNode・TooltipNode・全画面モード・ブロック複製・テーブル強化を追加する。

**Architecture:** 既存コードのBP違反（createDOMのtheme参照）をクリーンアップしてから新機能を追加する。新ノードはすべて NodeState API を使用し、`createDOM`/`exportDOM` は `data-*` 属性のみ出力。インラインノード（Ruby/Tooltip）は `$insertNodes` でインライン挿入、ブロックノード（Vimeo/MapEmbed）は `$insertNodeToNearestRoot` で挿入。Markdown エクスポート・読了時間はすでに実装済みのため作業不要。

**Tech Stack:** Lexical 0.40.0 (NodeState API: `createState`, `$getState`, `$setState`), React 19 (Compiler 1.0, `useEffectEvent`), Next.js 16 (`'use cache'`), TypeScript 6.0-beta (`erasableSyntaxOnly`, `verbatimModuleSyntax`)

---

## ベースパス

```
src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/
```

以下すべてのパスはこのベースパスからの相対パス。

---

## Task 1: YouTubeNode・ImageNode の createDOM BP 違反修正

**Files:**

- Modify: `nodes/YouTubeNode.tsx`
- Modify: `nodes/ImageNode.tsx`

**Step 1: YouTubeNode.tsx を読む**

ファイルを Read ツールで開き、`createDOM` の現在の実装を確認する。

**Step 2: YouTubeNode.createDOM を修正**

`config.theme['youtube']` 参照を削除し、data-attribute のみに変更:

```typescript
// Before
createDOM(config: EditorConfig) {
  const div = document.createElement('div')
  const className = config.theme['youtube']
  if (className) div.className = className
  return div
}

// After
createDOM(): HTMLElement {
  const div = document.createElement('div')
  div.setAttribute('data-youtube', 'true')
  return div
}
```

**Step 3: ImageNode.tsx を読む**

ファイルを Read ツールで開き、`createDOM` の現在の実装を確認する。

**Step 4: ImageNode.createDOM を修正**

`config.theme.image` 参照を削除し、data-attribute のみに変更:

```typescript
// Before
createDOM(config: EditorConfig) {
  const div = document.createElement('div')
  const className = config.theme.image
  if (className) div.className = className
  return div
}

// After
createDOM(): HTMLElement {
  const div = document.createElement('div')
  div.setAttribute('data-image', 'true')
  return div
}
```

**Step 5: 型チェック**

```bash
bun run type-check
```

期待: エラーなし（EditorConfig インポートが不要になった場合は削除する）

**Step 6: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/nodes/YouTubeNode.tsx src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/nodes/ImageNode.tsx
git commit -m "fix(lexical): createDOM から config.theme 参照を除去し data-attribute に統一"
```

---

## Task 2: ToolbarPlugin に Sub/Sup ボタンを追加

**Files:**

- Modify: `plugins/ToolbarPlugin.tsx`

**Step 1: ToolbarPlugin.tsx を読む**

ファイルを Read ツールで開き、フォーマットボタン群（Strikethrough まで）の実装を確認する。

**Step 2: isSubscript・isSuperscript state を追加**

`activeEditor` を使った `registerUpdateListener` コールバック内で、既存の `isStrikethrough` の後に追加:

```typescript
const isSubscript = $hasFormat("subscript");
const isSuperscript = $hasFormat("superscript");
```

対応する `useState` も追加:

```typescript
const [isSubscript, setIsSubscript] = useState(false);
const [isSuperscript, setIsSuperscript] = useState(false);
```

setIsSubscript/setIsSuperscript を `registerUpdateListener` 内でセット。

**Step 3: Strikethrough ボタンの後に Sub/Sup ボタンを追加**

Strikethrough の `</Button>` 直後（HighlightPlugin の前）に挿入:

```tsx
<Button
  size="sm"
  variant={isSubscript ? 'default' : 'ghost'}
  onClick={() => {
    activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript')
  }}
  title="下付き文字"
  aria-label="下付き文字"
>
  <SubscriptIcon className="h-4 w-4" />
</Button>
<Button
  size="sm"
  variant={isSuperscript ? 'default' : 'ghost'}
  onClick={() => {
    activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript')
  }}
  title="上付き文字"
  aria-label="上付き文字"
>
  <SuperscriptIcon className="h-4 w-4" />
</Button>
```

**Step 4: アイコンをインポート**

```typescript
import { SubscriptIcon, SuperscriptIcon } from "lucide-react";
```

**Step 5: 型チェック**

```bash
bun run type-check
```

**Step 6: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx
git commit -m "feat(lexical): ToolbarPlugin に Sub/Sup ボタンを追加"
```

---

## Task 3: docs/plans/README.md の AccentColor 計画を完了マーク

**Files:**

- Modify: `docs/plans/README.md`

**Step 1: README.md の AccentColor エントリを確認**

ファイルを Read ツールで開き、`2026-02-18-lexical-accent-color-system.md` エントリを探す。

**Step 2: ステータスを ✅ 完了 に更新**

該当エントリに `✅` を追加。

**Step 3: Commit**

```bash
git add docs/plans/README.md
git commit -m "docs(plans): AccentColor 計画を完了マーク"
```

---

## Task 4: ImageNode にキャプション機能を追加

**Files:**

- Modify: `nodes/ImageNode.tsx`
- Modify: `inspector/panels/ImageInspectorPanel.tsx`

**Step 1: ImageNode.tsx を読む（最新状態）**

Task 1 で修正済みのため、再 Read する。

**Step 2: captionState を追加**

`alignmentState` の後に追加:

```typescript
export const captionState = createState("caption", {
  parse: (v: unknown): string => (typeof v === "string" ? v : ""),
});
```

**Step 3: exportDOM を figure 要素に変更**

現在の `<div data-image>` を `<figure>` に変更し、figcaption を追加:

```typescript
exportDOM(): DOMExportOutput {
  const figure = document.createElement('figure')
  figure.setAttribute('data-image', 'true')
  figure.setAttribute('data-image-alignment', $getState(this, alignmentState))

  const img = document.createElement('img')
  img.setAttribute('src', $getState(this, srcState))
  img.setAttribute('alt', $getState(this, altState))
  const width = $getState(this, widthState)
  const height = $getState(this, heightState)
  if (width) img.setAttribute('width', String(width))
  if (height) img.setAttribute('height', String(height))
  figure.appendChild(img)

  const caption = $getState(this, captionState)
  if (caption) {
    const figcaption = document.createElement('figcaption')
    figcaption.setAttribute('data-image-caption', 'true')
    figcaption.textContent = caption
    figure.appendChild(figcaption)
  }

  return { element: figure }
}
```

**Step 4: $createImageNode を更新**

`captionState` のデフォルト値を含めた形に更新:

```typescript
export function $createImageNode({
  src,
  alt = "",
  width,
  height,
  alignment = "none",
  caption = "",
}: {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  alignment?: string;
  caption?: string;
}): ImageNode {
  const node = new ImageNode();
  $setState(node, srcState, src);
  $setState(node, altState, alt);
  if (width !== undefined) $setState(node, widthState, width);
  if (height !== undefined) $setState(node, heightState, height);
  $setState(node, alignmentState, alignment);
  $setState(node, captionState, caption);
  return node;
}
```

**Step 5: ImageInspectorPanel.tsx を読む**

ファイルを Read ツールで開き、現在の実装（src/alt/alignment/width/height）を確認する。

**Step 6: キャプションフィールドを追加**

`captionState` を import し、Alt テキストフィールドの後にキャプション Textarea を追加:

```tsx
import { captionState } from '../nodes/ImageNode'

// ...（コンポーネント内）
const caption = $getState(node, captionState)

// UI（Alt の後）
<div className="flex flex-col gap-1">
  <label className="text-xs font-medium text-muted-foreground">キャプション</label>
  <Textarea
    value={caption}
    onChange={(e) => {
      editor.update(() => {
        $setState(node, captionState, e.target.value)
      })
    }}
    placeholder="画像の説明（任意）"
    rows={2}
    className="text-sm resize-none"
  />
</div>
```

**Step 7: 型チェック**

```bash
bun run type-check
```

**Step 8: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/nodes/ImageNode.tsx src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/inspector/panels/ImageInspectorPanel.tsx
git commit -m "feat(lexical): ImageNode にキャプション機能を追加（captionState + figure/figcaption）"
```

---

## Task 5: VimeoNode を作成

**Files:**

- Create: `nodes/VimeoNode.tsx`

**Step 1: YouTubeNode.tsx を参照する**

YouTubeNode.tsx の完全な実装を Read して、VimeoNode のベースとして使う。

**Step 2: VimeoNode.tsx を作成**

YouTubeNode をベースに Vimeo 向けに調整:

```typescript
import type { EditorConfig, LexicalEditor, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import { DecoratorNode, type DOMConversionMap, type DOMExportOutput } from 'lexical'
import { createState, $getState, $setState } from '@lexical/state'

export const videoIdState = createState('videoId', {
  parse: (v: unknown): string => typeof v === 'string' ? v : '',
})

export type SerializedVimeoNode = Spread<
  { videoId: string; type: 'vimeo'; version: 1 },
  SerializedLexicalNode
>

export function extractVimeoId(url: string): string | null {
  const match = url.match(
    /vimeo\.com(?:\/(?:channels\/\w+|groups\/[^/]+\/videos|video))?\/(\d+)/,
  )
  return match?.[1] ?? null
}

export class VimeoNode extends DecoratorNode<JSX.Element> {
  static getType(): string { return 'vimeo' }

  static clone(node: VimeoNode): VimeoNode {
    return new VimeoNode(node.__key)
  }

  static importJSON(data: SerializedVimeoNode): VimeoNode {
    const node = new VimeoNode()
    $setState(node, videoIdState, data.videoId)
    return node
  }

  exportJSON(): SerializedVimeoNode {
    return {
      ...super.exportJSON(),
      type: 'vimeo',
      version: 1,
      videoId: $getState(this, videoIdState),
    }
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.setAttribute('data-vimeo', 'true')
    return div
  }

  updateDOM(): false { return false }

  exportDOM(): DOMExportOutput {
    const div = document.createElement('div')
    div.setAttribute('data-vimeo', 'true')
    const iframe = document.createElement('iframe')
    const videoId = $getState(this, videoIdState)
    iframe.setAttribute('src', `https://player.vimeo.com/video/${videoId}`)
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture')
    iframe.setAttribute('allowfullscreen', '')
    div.appendChild(iframe)
    return { element: div }
  }

  static importDOM(): DOMConversionMap {
    return {
      div: (node: HTMLElement) => {
        if (!node.hasAttribute('data-vimeo')) return null
        return {
          conversion: (element: HTMLElement) => {
            const iframe = element.querySelector('iframe')
            const node = new VimeoNode()
            if (iframe) {
              const src = iframe.getAttribute('src') ?? ''
              const match = src.match(/\/video\/(\d+)/)
              if (match?.[1]) $setState(node, videoIdState, match[1])
            }
            return { node }
          },
          priority: 1,
        }
      },
    }
  }

  decorate(editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const videoId = $getState(this, videoIdState)
    return (
      <div data-vimeo="true" className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <iframe
          src={`https://player.vimeo.com/video/${videoId}`}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  isInline(): false { return false }
  isShadowRoot(): false { return false }
}

export function $createVimeoNode(videoId: string): VimeoNode {
  const node = new VimeoNode()
  $setState(node, videoIdState, videoId)
  return node
}

export function $isVimeoNode(node: unknown): node is VimeoNode {
  return node instanceof VimeoNode
}
```

**Step 3: 型チェック**

```bash
bun run type-check
```

**Step 4: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/nodes/VimeoNode.tsx
git commit -m "feat(lexical): VimeoNode を追加（NodeState API）"
```

---

## Task 6: VimeoPlugin・VimeoInspectorPanel を作成し登録する

**Files:**

- Create: `dialogs/VimeoDialog.tsx`
- Create: `inspector/panels/VimeoInspectorPanel.tsx`
- Modify: `config/nodes.ts`
- Modify: `config/dialog-registry.ts`
- Modify: `config/insert-items.ts`
- Modify: `config/inspector-registry.ts`
- Modify: `inspector/hooks/inspectable-nodes.ts`
- Modify: `inspector/InspectorSidebar.tsx`

**Step 1: 既存の YouTubeDialog.tsx を参照する**

Read ツールで YouTubeDialog.tsx を開き、ダイアログの実装パターンを確認する。

**Step 2: VimeoDialog.tsx を作成**

YouTubeDialog をベースに、extractVimeoId を使うよう変更:

```tsx
"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useState } from "react";
import { $createVimeoNode, extractVimeoId } from "../nodes/VimeoNode";

interface VimeoDialogProps {
  onClose: () => void;
}

export function VimeoDialog({ onClose }: VimeoDialogProps) {
  const [editor] = useLexicalComposerContext();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleInsert = () => {
    const videoId = extractVimeoId(url);
    if (!videoId) {
      setError("有効な Vimeo URL を入力してください");
      return;
    }
    editor.update(() => {
      const node = $createVimeoNode(videoId);
      $insertNodeToNearestRoot(node);
    });
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="vimeo-url">Vimeo URL</Label>
        <Input
          id="vimeo-url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          placeholder="https://vimeo.com/123456789"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          キャンセル
        </Button>
        <Button onClick={handleInsert}>挿入</Button>
      </div>
    </div>
  );
}
```

**Step 3: VimeoInspectorPanel.tsx を作成**

YouTubeInspectorPanel.tsx を参照し、VimeoNode 向けに変更:

```tsx
"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getState } from "@lexical/state";
import { EmbedInspectorPanel } from "./EmbedInspectorPanel";
import type { VimeoNode } from "../../nodes/VimeoNode";
import { videoIdState } from "../../nodes/VimeoNode";

interface VimeoInspectorPanelProps {
  node: VimeoNode;
  nodeKey: string;
}

export function VimeoInspectorPanel({
  node,
  nodeKey,
}: VimeoInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const videoId = $getState(node, videoIdState);

  return (
    <EmbedInspectorPanel
      editor={editor}
      nodeKey={nodeKey}
      label="Vimeo 動画"
      idLabel="Video ID"
      id={videoId}
      url={`https://player.vimeo.com/video/${videoId}`}
    />
  );
}
```

**Step 4: config/nodes.ts に VimeoNode を追加**

Read して確認後、`EDITOR_NODES` 配列に `VimeoNode` を追加。

**Step 5: config/dialog-registry.ts に VimeoDialog を追加**

`REGISTRY_DIALOG_IDS` に `'vimeo'` を追加し、`DIALOG_REGISTRY` に `{ dialogId: 'vimeo', component: VimeoDialog }` を追加。

**Step 6: config/insert-items.ts に Vimeo エントリを追加**

`INSERT_ITEMS` の `media` カテゴリに追加:

```typescript
{
  id: 'vimeo',
  label: 'Vimeo',
  icon: 'Play',
  category: 'media',
  type: 'dialog',
  dialogId: 'vimeo',
  showInToolbar: true,
  showInPicker: true,
},
```

**Step 7: config/inspector-registry.ts に VimeoNode を追加**

Read して確認後、`getInspectableInfoFromRegistry` に VimeoNode の分岐を追加。

**Step 8: inspector/hooks/inspectable-nodes.ts に VimeoNode を追加**

`InspectableNodeType` union と `SelectedNodeInfo` Discriminated Union に `'vimeo'` を追加。

**Step 9: inspector/InspectorSidebar.tsx の switch に VimeoInspectorPanel を追加**

Read して確認後、`renderPanel` switch に `case 'vimeo':` を追加。

**Step 10: 型チェック**

```bash
bun run type-check
```

**Step 11: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/
git commit -m "feat(lexical): VimeoNode・VimeoDialog・VimeoInspectorPanel を追加・登録"
```

---

## Task 7: MapEmbedNode を作成

**Files:**

- Create: `nodes/MapEmbedNode.tsx`

**Step 1: MapEmbedNode.tsx を作成**

```typescript
import type { EditorConfig, LexicalEditor, SerializedLexicalNode, Spread } from 'lexical'
import { DecoratorNode, type DOMConversionMap, type DOMExportOutput } from 'lexical'
import { createState, $getState, $setState } from '@lexical/state'

export const embedUrlState = createState('embedUrl', {
  parse: (v: unknown): string => typeof v === 'string' ? v : '',
})

export const labelState = createState('label', {
  parse: (v: unknown): string => typeof v === 'string' ? v : '',
})

export type SerializedMapEmbedNode = Spread<
  { embedUrl: string; label: string; type: 'mapEmbed'; version: 1 },
  SerializedLexicalNode
>

export function toEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    // すでに embed URL
    if (parsed.searchParams.has('pb') && parsed.pathname.includes('/maps/embed')) {
      return url
    }
    // 通常の maps.google.com/maps?q=xxx
    if (parsed.hostname.includes('google.com') && parsed.pathname.includes('/maps')) {
      if (!parsed.searchParams.has('output')) {
        parsed.searchParams.set('output', 'embed')
      }
      return parsed.toString()
    }
    return null
  } catch {
    return null
  }
}

export class MapEmbedNode extends DecoratorNode<JSX.Element> {
  static getType(): string { return 'mapEmbed' }

  static clone(node: MapEmbedNode): MapEmbedNode {
    return new MapEmbedNode(node.__key)
  }

  static importJSON(data: SerializedMapEmbedNode): MapEmbedNode {
    const node = new MapEmbedNode()
    $setState(node, embedUrlState, data.embedUrl)
    $setState(node, labelState, data.label)
    return node
  }

  exportJSON(): SerializedMapEmbedNode {
    return {
      ...super.exportJSON(),
      type: 'mapEmbed',
      version: 1,
      embedUrl: $getState(this, embedUrlState),
      label: $getState(this, labelState),
    }
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.setAttribute('data-map', 'true')
    return div
  }

  updateDOM(): false { return false }

  exportDOM(): DOMExportOutput {
    const div = document.createElement('div')
    const label = $getState(this, labelState)
    div.setAttribute('data-map', 'true')
    if (label) div.setAttribute('data-map-label', label)
    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', $getState(this, embedUrlState))
    iframe.setAttribute('loading', 'lazy')
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade')
    div.appendChild(iframe)
    return { element: div }
  }

  static importDOM(): DOMConversionMap {
    return {
      div: (node: HTMLElement) => {
        if (!node.hasAttribute('data-map')) return null
        return {
          conversion: (element: HTMLElement) => {
            const iframe = element.querySelector('iframe')
            const node = new MapEmbedNode()
            if (iframe) {
              $setState(node, embedUrlState, iframe.getAttribute('src') ?? '')
            }
            $setState(node, labelState, element.getAttribute('data-map-label') ?? '')
            return { node }
          },
          priority: 1,
        }
      },
    }
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    const embedUrl = $getState(this, embedUrlState)
    const label = $getState(this, labelState)
    return (
      <div data-map="true" className="flex flex-col gap-1">
        {label && <p className="text-sm text-muted-foreground">{label}</p>}
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={embedUrl}
            className="absolute inset-0 h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={label || 'Google マップ'}
          />
        </div>
      </div>
    )
  }

  isInline(): false { return false }
  isShadowRoot(): false { return false }
}

export function $createMapEmbedNode(embedUrl: string, label = ''): MapEmbedNode {
  const node = new MapEmbedNode()
  $setState(node, embedUrlState, embedUrl)
  $setState(node, labelState, label)
  return node
}

export function $isMapEmbedNode(node: unknown): node is MapEmbedNode {
  return node instanceof MapEmbedNode
}
```

**Step 2: 型チェック**

```bash
bun run type-check
```

**Step 3: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/nodes/MapEmbedNode.tsx
git commit -m "feat(lexical): MapEmbedNode を追加（NodeState API）"
```

---

## Task 8: MapEmbedDialog・MapEmbedInspectorPanel を作成し登録する

**Files:**

- Create: `dialogs/MapEmbedDialog.tsx`
- Create: `inspector/panels/MapEmbedInspectorPanel.tsx`
- Modify: `config/nodes.ts`
- Modify: `config/dialog-registry.ts`
- Modify: `config/insert-items.ts`
- Modify: `config/inspector-registry.ts`
- Modify: `inspector/hooks/inspectable-nodes.ts`
- Modify: `inspector/InspectorSidebar.tsx`

**Step 1: MapEmbedDialog.tsx を作成**

```tsx
"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useState } from "react";
import { $createMapEmbedNode, toEmbedUrl } from "../nodes/MapEmbedNode";

interface MapEmbedDialogProps {
  onClose: () => void;
}

export function MapEmbedDialog({ onClose }: MapEmbedDialogProps) {
  const [editor] = useLexicalComposerContext();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleInsert = () => {
    const embedUrl = toEmbedUrl(url);
    if (!embedUrl) {
      setError("有効な Google マップ URL を入力してください");
      return;
    }
    editor.update(() => {
      const node = $createMapEmbedNode(embedUrl, label);
      $insertNodeToNearestRoot(node);
    });
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="map-url">Google マップ URL</Label>
        <Input
          id="map-url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          placeholder="https://maps.google.com/maps?q=..."
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="map-label">ラベル（任意）</Label>
        <Input
          id="map-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例: アクセスマップ"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          キャンセル
        </Button>
        <Button onClick={handleInsert}>挿入</Button>
      </div>
    </div>
  );
}
```

**Step 2: MapEmbedInspectorPanel.tsx を作成**

```tsx
"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getState, $setState } from "@lexical/state";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import type { MapEmbedNode } from "../../nodes/MapEmbedNode";
import { embedUrlState, labelState } from "../../nodes/MapEmbedNode";

interface MapEmbedInspectorPanelProps {
  node: MapEmbedNode;
  nodeKey: string;
}

export function MapEmbedInspectorPanel({
  node,
  nodeKey,
}: MapEmbedInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const embedUrl = $getState(node, embedUrlState);
  const label = $getState(node, labelState);

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Google マップ
      </p>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">ラベル</Label>
        <Input
          value={label}
          onChange={(e) => {
            editor.update(() => {
              $setState(node, labelState, e.target.value);
            });
          }}
          placeholder="アクセスマップ"
          className="text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Embed URL</Label>
        <p className="text-xs text-muted-foreground break-all">{embedUrl}</p>
      </div>
    </div>
  );
}
```

**Step 3: 各設定ファイルに MapEmbedNode を登録**

Vimeo（Task 6）と同じ手順で、`nodes.ts`, `dialog-registry.ts`, `insert-items.ts`, `inspector-registry.ts`, `inspectable-nodes.ts`, `InspectorSidebar.tsx` に追加。

insert-items のカテゴリは `'media'`、dialogId は `'mapEmbed'`。

**Step 4: 型チェック**

```bash
bun run type-check
```

**Step 5: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/
git commit -m "feat(lexical): MapEmbedNode・MapEmbedDialog・MapEmbedInspectorPanel を追加・登録"
```

---

## Task 9: RubyNode を作成（インラインDecoratorNode）

**Files:**

- Create: `nodes/RubyNode.tsx`
- Modify: `config/nodes.ts`

**Step 1: RubyNode.tsx を作成**

```typescript
import type { EditorConfig, LexicalEditor, SerializedLexicalNode, Spread } from 'lexical'
import { DecoratorNode, type DOMConversionMap, type DOMExportOutput } from 'lexical'
import { createState, $getState, $setState } from '@lexical/state'

export const baseTextState = createState('baseText', {
  parse: (v: unknown): string => typeof v === 'string' ? v : '',
})

export const rubyTextState = createState('rubyText', {
  parse: (v: unknown): string => typeof v === 'string' ? v : '',
})

export type SerializedRubyNode = Spread<
  { baseText: string; rubyText: string; type: 'ruby'; version: 1 },
  SerializedLexicalNode
>

export class RubyNode extends DecoratorNode<JSX.Element> {
  static getType(): string { return 'ruby' }

  static clone(node: RubyNode): RubyNode {
    return new RubyNode(node.__key)
  }

  static importJSON(data: SerializedRubyNode): RubyNode {
    const node = new RubyNode()
    $setState(node, baseTextState, data.baseText)
    $setState(node, rubyTextState, data.rubyText)
    return node
  }

  exportJSON(): SerializedRubyNode {
    return {
      ...super.exportJSON(),
      type: 'ruby',
      version: 1,
      baseText: $getState(this, baseTextState),
      rubyText: $getState(this, rubyTextState),
    }
  }

  createDOM(): HTMLElement {
    const ruby = document.createElement('ruby')
    ruby.setAttribute('data-ruby', 'true')
    return ruby
  }

  updateDOM(): false { return false }

  exportDOM(): DOMExportOutput {
    const ruby = document.createElement('ruby')
    ruby.setAttribute('data-ruby', 'true')
    ruby.textContent = $getState(this, baseTextState)
    const rt = document.createElement('rt')
    rt.textContent = $getState(this, rubyTextState)
    ruby.appendChild(rt)
    return { element: ruby }
  }

  static importDOM(): DOMConversionMap {
    return {
      ruby: () => ({
        conversion: (element: HTMLElement) => {
          const rt = element.querySelector('rt')
          const node = new RubyNode()
          const baseText = element.textContent?.replace(rt?.textContent ?? '', '') ?? ''
          $setState(node, baseTextState, baseText.trim())
          $setState(node, rubyTextState, rt?.textContent ?? '')
          return { node }
        },
        priority: 1,
      }),
    }
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    const baseText = $getState(this, baseTextState)
    const rubyText = $getState(this, rubyTextState)
    return (
      <ruby data-ruby="true">
        {baseText}
        <rt>{rubyText}</rt>
      </ruby>
    )
  }

  isInline(): true { return true }
}

export function $createRubyNode(baseText: string, rubyText: string): RubyNode {
  const node = new RubyNode()
  $setState(node, baseTextState, baseText)
  $setState(node, rubyTextState, rubyText)
  return node
}

export function $isRubyNode(node: unknown): node is RubyNode {
  return node instanceof RubyNode
}
```

**Step 2: config/nodes.ts に RubyNode を追加**

**Step 3: 型チェック**

```bash
bun run type-check
```

**Step 4: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/nodes/RubyNode.tsx src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/config/nodes.ts
git commit -m "feat(lexical): RubyNode を追加（インラインDecoratorNode）"
```

---

## Task 10: RubyPlugin を作成し FloatingToolbar にボタン追加

**Files:**

- Create: `dialogs/RubyDialog.tsx`
- Modify: `config/dialog-registry.ts`
- Modify: `plugins/FloatingToolbarPlugin.tsx`

**Step 1: FloatingToolbarPlugin.tsx を Read する**

現在のボタン構成を確認し、Ruby ボタンの挿入位置を特定する。

**Step 2: RubyDialog.tsx を作成**

```tsx
"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isRangeSelection, $insertNodes } from "lexical";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useState } from "react";
import { $createRubyNode } from "../nodes/RubyNode";

interface RubyDialogProps {
  onClose: () => void;
  initialText?: string;
}

export function RubyDialog({ onClose, initialText = "" }: RubyDialogProps) {
  const [editor] = useLexicalComposerContext();
  const [baseText, setBaseText] = useState(initialText);
  const [rubyText, setRubyText] = useState("");

  const handleInsert = () => {
    if (!baseText || !rubyText) return;
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.deleteContents();
      }
      $insertNodes([$createRubyNode(baseText, rubyText)]);
    });
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ruby-base">ベーステキスト</Label>
        <Input
          id="ruby-base"
          value={baseText}
          onChange={(e) => setBaseText(e.target.value)}
          placeholder="漢字"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ruby-text">ルビ（ふりがな）</Label>
        <Input
          id="ruby-text"
          value={rubyText}
          onChange={(e) => setRubyText(e.target.value)}
          placeholder="かんじ"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          キャンセル
        </Button>
        <Button onClick={handleInsert} disabled={!baseText || !rubyText}>
          挿入
        </Button>
      </div>
    </div>
  );
}
```

**Step 3: dialog-registry.ts に RubyDialog を追加**

`REGISTRY_DIALOG_IDS` に `'ruby'` を追加し、`DIALOG_REGISTRY` に `{ dialogId: 'ruby', component: RubyDialog }` を追加。

**Step 4: FloatingToolbarPlugin.tsx にルビボタンを追加**

選択テキストを `initialText` として渡せるよう、ダイアログ呼び出し時に選択文字列を取得してから `openDialog('ruby', { initialText: selectedText })` を呼ぶ。

既存の他のボタン（Bold/Italic 等）の後に追加:

```tsx
<Button
  size="sm"
  variant="ghost"
  onClick={() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      const text = $isRangeSelection(selection)
        ? selection.getTextContent()
        : "";
      openDialog("ruby", { initialText: text });
    });
  }}
  title="ルビ"
  aria-label="ルビを追加"
>
  <span className="text-xs font-medium">ルビ</span>
</Button>
```

**Step 5: 型チェック**

```bash
bun run type-check
```

**Step 6: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/
git commit -m "feat(lexical): RubyDialog を追加し FloatingToolbar にルビボタンを追加"
```

---

## Task 11: TooltipNode を作成

**Files:**

- Create: `nodes/TooltipNode.tsx`
- Modify: `config/nodes.ts`

**Step 1: TooltipNode.tsx を作成**

```typescript
import type { EditorConfig, LexicalEditor, SerializedLexicalNode, Spread } from 'lexical'
import { DecoratorNode, type DOMConversionMap, type DOMExportOutput } from 'lexical'
import { createState, $getState, $setState } from '@lexical/state'

export const baseTextState = createState('baseText', {
  parse: (v: unknown): string => typeof v === 'string' ? v : '',
})

export const tooltipTextState = createState('tooltipText', {
  parse: (v: unknown): string => typeof v === 'string' ? v : '',
})

export type SerializedTooltipNode = Spread<
  { baseText: string; tooltipText: string; type: 'tooltip'; version: 1 },
  SerializedLexicalNode
>

export class TooltipNode extends DecoratorNode<JSX.Element> {
  static getType(): string { return 'tooltip' }

  static clone(node: TooltipNode): TooltipNode {
    return new TooltipNode(node.__key)
  }

  static importJSON(data: SerializedTooltipNode): TooltipNode {
    const node = new TooltipNode()
    $setState(node, baseTextState, data.baseText)
    $setState(node, tooltipTextState, data.tooltipText)
    return node
  }

  exportJSON(): SerializedTooltipNode {
    return {
      ...super.exportJSON(),
      type: 'tooltip',
      version: 1,
      baseText: $getState(this, baseTextState),
      tooltipText: $getState(this, tooltipTextState),
    }
  }

  createDOM(): HTMLElement {
    const abbr = document.createElement('abbr')
    abbr.setAttribute('data-tooltip', 'true')
    return abbr
  }

  updateDOM(): false { return false }

  exportDOM(): DOMExportOutput {
    const abbr = document.createElement('abbr')
    abbr.setAttribute('data-tooltip', 'true')
    abbr.setAttribute('title', $getState(this, tooltipTextState))
    abbr.textContent = $getState(this, baseTextState)
    return { element: abbr }
  }

  static importDOM(): DOMConversionMap {
    return {
      abbr: (node: HTMLElement) => {
        if (!node.hasAttribute('data-tooltip')) return null
        return {
          conversion: (element: HTMLElement) => {
            const node = new TooltipNode()
            $setState(node, baseTextState, element.textContent ?? '')
            $setState(node, tooltipTextState, element.getAttribute('title') ?? '')
            return { node }
          },
          priority: 1,
        }
      },
    }
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    const baseText = $getState(this, baseTextState)
    const tooltipText = $getState(this, tooltipTextState)
    return (
      <abbr data-tooltip="true" title={tooltipText} className="cursor-help underline decoration-dotted">
        {baseText}
      </abbr>
    )
  }

  isInline(): true { return true }
}

export function $createTooltipNode(baseText: string, tooltipText: string): TooltipNode {
  const node = new TooltipNode()
  $setState(node, baseTextState, baseText)
  $setState(node, tooltipTextState, tooltipText)
  return node
}

export function $isTooltipNode(node: unknown): node is TooltipNode {
  return node instanceof TooltipNode
}
```

**Step 2: config/nodes.ts に TooltipNode を追加**

**Step 3: 型チェック**

```bash
bun run type-check
```

**Step 4: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/nodes/TooltipNode.tsx src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/config/nodes.ts
git commit -m "feat(lexical): TooltipNode を追加（インラインDecoratorNode）"
```

---

## Task 12: TooltipPlugin を作成し FloatingToolbar にボタン追加、CSS 追加

**Files:**

- Create: `dialogs/TooltipDialog.tsx`
- Modify: `config/dialog-registry.ts`
- Modify: `plugins/FloatingToolbarPlugin.tsx`
- Modify: `src/app/(public)/_styles/lexical-content.css` （または公開 CSS）

**Step 1: TooltipDialog.tsx を作成**

RubyDialog と同じパターン:

```tsx
"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isRangeSelection, $insertNodes } from "lexical";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { useState } from "react";
import { $createTooltipNode } from "../nodes/TooltipNode";

interface TooltipDialogProps {
  onClose: () => void;
  initialText?: string;
}

export function TooltipDialog({
  onClose,
  initialText = "",
}: TooltipDialogProps) {
  const [editor] = useLexicalComposerContext();
  const [baseText, setBaseText] = useState(initialText);
  const [tooltipText, setTooltipText] = useState("");

  const handleInsert = () => {
    if (!baseText || !tooltipText) return;
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.deleteContents();
      }
      $insertNodes([$createTooltipNode(baseText, tooltipText)]);
    });
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="tooltip-base">表示テキスト</Label>
        <Input
          id="tooltip-base"
          value={baseText}
          onChange={(e) => setBaseText(e.target.value)}
          placeholder="表示テキスト"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tooltip-text">ツールチップ説明</Label>
        <Textarea
          id="tooltip-text"
          value={tooltipText}
          onChange={(e) => setTooltipText(e.target.value)}
          placeholder="ホバー時に表示される説明文"
          rows={3}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          キャンセル
        </Button>
        <Button onClick={handleInsert} disabled={!baseText || !tooltipText}>
          挿入
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: dialog-registry.ts に TooltipDialog を追加**

**Step 3: FloatingToolbarPlugin.tsx にツールチップボタンを追加**

ルビボタンの後に追加（同じパターン）。

**Step 4: lexical-content.css を探して [data-tooltip] スタイルを追加**

公開側の Lexical CSS ファイルを Glob で探し（`lexical-content.css` または類似の名前）、以下を追記:

```css
[data-tooltip] {
  text-decoration: underline dotted;
  cursor: help;
}
```

**Step 5: 型チェック**

```bash
bun run type-check
```

**Step 6: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/
git commit -m "feat(lexical): TooltipNode・TooltipDialog を追加し FloatingToolbar にボタン追加"
```

---

## Task 13: 全画面モードを実装

**Files:**

- Modify: `LexicalEditor.tsx`
- Modify: `plugins/ToolbarPlugin.tsx`

**Step 1: LexicalEditor.tsx を Read する**

現在の実装（270行）を確認。

**Step 2: LexicalEditor.tsx に isFullscreen state を追加**

`EditorInner` または `LexicalEditorDesktop` コンポーネントに:

```typescript
const [isFullscreen, setIsFullscreen] = useState(false);

// Escape キー解除（useEffectEvent を使用）
const handleEsc = useEffectEvent(() => setIsFullscreen(false));
useEffect(() => {
  if (!isFullscreen) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape") handleEsc();
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [isFullscreen]);
```

**Step 3: ルートコンテナに全画面 CSS を適用**

```tsx
<div
  className={cn(
    'flex flex-col border rounded-lg overflow-hidden',
    isFullscreen && 'fixed inset-0 z-[100] rounded-none border-0',
  )}
>
```

**Step 4: ToolbarPlugin に isFullscreen・onFullscreenToggle を追加**

```typescript
interface ToolbarPluginProps {
  // 既存の props...
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
}
```

**Step 5: ToolbarPlugin にトグルボタンを追加**

ツールバーの右端（最後のセパレータの後）に追加:

```tsx
import { Maximize, Minimize } from "lucide-react";

// ツールバーの末尾
<div className="ml-auto">
  <Button
    size="sm"
    variant="ghost"
    onClick={onFullscreenToggle}
    title={isFullscreen ? "全画面終了" : "全画面表示"}
    aria-label={isFullscreen ? "全画面終了" : "全画面表示"}
  >
    {isFullscreen ? (
      <Minimize className="h-4 w-4" />
    ) : (
      <Maximize className="h-4 w-4" />
    )}
  </Button>
</div>;
```

**Step 6: LexicalEditor.tsx で ToolbarPlugin に props を渡す**

```tsx
<ToolbarPlugin
  // 既存 props...
  isFullscreen={isFullscreen}
  onFullscreenToggle={() => setIsFullscreen((v) => !v)}
/>
```

**Step 7: 型チェック**

```bash
bun run type-check
```

**Step 8: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/LexicalEditor.tsx src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx
git commit -m "feat(lexical): 全画面モードを追加（Maximize/Minimize + Escape 解除）"
```

---

## Task 14: DraggableBlockPlugin にブロック複製を追加

**Files:**

- Modify: `plugins/DraggableBlockPlugin.tsx`

**Step 1: DraggableBlockPlugin.tsx を Read する**

現在の実装（特に `DragHandle` コンポーネント）を確認。

**Step 2: contextMenu state を追加**

```typescript
const [contextMenu, setContextMenu] = useState<{
  x: number;
  y: number;
  nodeKey: string;
} | null>(null);
```

**Step 3: DragHandle の onContextMenu を追加**

```tsx
<button
  // 既存 props...
  onContextMenu={(e) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, nodeKey })
  }}
>
  <GripVertical ... />
</button>
```

**Step 4: ContextMenu コンポーネントを追加**

`@/shared/components/ui/dropdown-menu` または `@/shared/components/ui/context-menu` を使用:

```tsx
{contextMenu && (
  <DropdownMenu
    open
    onOpenChange={(open) => { if (!open) setContextMenu(null) }}
  >
    <DropdownMenuContent
      style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y }}
    >
      <DropdownMenuItem
        onClick={() => {
          editor.update(() => {
            const node = $getNodeByKey(contextMenu.nodeKey)
            if (!node) return
            const clone = node.exportJSON()
            // ノードを再作成して直後に挿入
            const newNode = $createNodeFromParse(clone, ...)
            node.insertAfter(newNode)
          })
          setContextMenu(null)
        }}
      >
        複製
      </DropdownMenuItem>
      <DropdownMenuItem
        className="text-destructive"
        onClick={() => {
          editor.update(() => {
            $getNodeByKey(contextMenu.nodeKey)?.remove()
          })
          setContextMenu(null)
        }}
      >
        削除
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)}
```

> **注意**: `$createNodeFromParse` は Lexical の内部 API であることが多い。代わりに `node.exportJSON()` → `NodeClass.importJSON(serialized)` パターンを使う。ノードの型は `$isXxxNode(node)` で判別するか、`LexicalEditor.parseEditorState` を使う。

シンプルな実装として、`node.getType()` + registered classes から importJSON を呼ぶか、`editor._nodes.get(type)` を参照する。

**Step 5: 型チェック**

```bash
bun run type-check
```

**Step 6: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/plugins/DraggableBlockPlugin.tsx
git commit -m "feat(lexical): DraggableBlockPlugin に右クリック複製・削除メニューを追加"
```

---

## Task 15: TablePlugin にセル結合・背景色・リサイザーを有効化

**Files:**

- Modify: `LexicalEditor.tsx`

**Step 1: LexicalEditor.tsx を Read する（最新状態）**

`<TablePlugin />` の現在の使用箇所を確認。

**Step 2: TablePlugin に hasCellMerge・hasCellBackgroundColor を追加**

```tsx
// Before
<TablePlugin />

// After
<TablePlugin hasCellMerge={true} hasCellBackgroundColor={true} />
```

**Step 3: TableCellResizerPlugin を追加**

```tsx
import { TableCellResizerPlugin } from "@lexical/react/LexicalTableCellResizerPlugin";

// TablePlugin の後に追加
<TableCellResizerPlugin />;
```

**Step 4: 型チェック**

```bash
bun run type-check
```

**Step 5: Commit**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/LexicalEditor.tsx
git commit -m "feat(lexical): TablePlugin に hasCellMerge・hasCellBackgroundColor を有効化、TableCellResizerPlugin 追加"
```

---

## Task 16: 最終検証

**Step 1: type-check + lint**

```bash
bun run validate
```

期待: エラー・警告なし

**Step 2: ビルド**

```bash
bun run build
```

期待: エラーなし

**Step 3: 実装サマリーを確認**

以下がすべて完了していることを確認:

- [x] YouTubeNode/ImageNode: createDOM から theme 参照除去
- [x] ToolbarPlugin: Sub/Sup ボタン追加
- [x] README: AccentColor 完了マーク
- [x] ImageNode: captionState + figure/figcaption
- [x] ImageInspectorPanel: キャプションフィールド追加
- [x] VimeoNode + VimeoDialog + VimeoInspectorPanel
- [x] MapEmbedNode + MapEmbedDialog + MapEmbedInspectorPanel
- [x] RubyNode + RubyDialog + FloatingToolbar ボタン
- [x] TooltipNode + TooltipDialog + FloatingToolbar ボタン + CSS
- [x] LexicalEditor: 全画面モード（isFullscreen + Escape）
- [x] ToolbarPlugin: 全画面トグルボタン
- [x] DraggableBlockPlugin: 右クリック複製・削除メニュー
- [x] TablePlugin: hasCellMerge + hasCellBackgroundColor
- [x] TableCellResizerPlugin 追加

**Step 4: 最終 Commit**

```bash
git add docs/plans/README.md
git commit -m "docs(plans): Lexical 改善計画を完了マーク"
```
