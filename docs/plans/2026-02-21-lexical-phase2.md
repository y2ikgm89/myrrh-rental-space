# Lexical エディタ Phase 2 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Lexical エディタに Phase 2（バグ修正 3件・新規ノード 7種・出力強化 3件・UX改善 3件）を実装し、エディタの総合機能を大幅に強化する。

**Architecture:** $config() + NodeState API パターン統一。DecoratorNode（メディア系）と ElementNode（コンテナ系）の 2 アーキテクチャを使い分ける。コンポジットノードは Container + Item の 2 クラス構成で `isShadowRoot(): true` を付与。

**Tech Stack:** Lexical 0.40.0, React 19 + React Compiler 1.0（useCallback/useMemo/React.memo 禁止）, TypeScript 6.0-beta（as 型アサーション禁止）, Tailwind CSS 4.x（ハードコードカラー禁止）

**設計ドキュメント:** `docs/plans/2026-02-21-lexical-phase2-design.md`

---

## 重要: 共通パス定義

```
BASE = src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical
NODES = {BASE}/nodes
CONFIG = {BASE}/config
PLUGINS = {BASE}/plugins
INSPECTOR = {BASE}/inspector
PANELS = {INSPECTOR}/panels
```

## 重要: 新規ノード登録 9 箇所チェックリスト

新規ノード追加時は必ず以下 9 箇所を更新すること:

| #   | ファイル                                 | 内容                                                                        |
| --- | ---------------------------------------- | --------------------------------------------------------------------------- |
| 1   | `NODES/XxxNode.tsx`                      | ノードクラス本体                                                            |
| 2   | `NODES/index.ts`                         | barrel export                                                               |
| 3   | `CONFIG/nodes.ts`                        | `EDITOR_NODES` 配列                                                         |
| 4   | `PLUGINS/XxxPlugin.tsx`                  | Plugin コンポーネント                                                       |
| 5   | `PLUGINS/index.ts`                       | Plugin export                                                               |
| 6   | `CONFIG/dialog-registry.ts`              | `REGISTRY_DIALOG_IDS` + `DIALOG_REGISTRY`                                   |
| 7   | `CONFIG/insert-items.ts`                 | `INSERT_ITEMS` 配列                                                         |
| 8   | `INSPECTOR/config/inspector-registry.ts` | `getInspectableInfoFromRegistry()` + `INSPECTABLE_NODE_TYPES_FROM_REGISTRY` |
| 9   | `INSPECTOR/hooks/inspectable-nodes.ts`   | `InspectableNodeType` + `SelectedNodeInfo`                                  |
| 10  | `PANELS/XxxInspectorPanel.tsx`           | Inspector パネル UI                                                         |
| 11  | `PANELS/index.ts`                        | Panel export                                                                |
| 12  | `INSPECTOR/InspectorSidebar.tsx`         | `renderPanel()` switch case                                                 |

---

## Phase 1: バグ修正・品質向上

### Task 1-A: ImageNode caption 表示バグ修正

**Files:**

- Modify: `NODES/ImageNode.tsx`

**背景:** `ImageNode.decorate()` が `captionState` を `ImageComponent` に渡していないため、エディタ上でキャプションが表示されない。

**Step 1: ImageNode.tsx を読む**

```bash
# Read ツールで確認
# NODES/ImageNode.tsx 全体を読んで captionState の定義と decorate() の実装を確認
```

**Step 2: ImageComponent に caption prop を追加し、decorate() で渡す**

`ImageComponent` の props 型に `caption?: string` を追加:

```typescript
// ImageComponent の props に caption を追加
function ImageComponent({
  src,
  alt,
  width,
  height,
  alignment,
  caption,   // ← 追加
  nodeKey,
}: {
  src: string
  alt: string
  width?: number
  height?: number
  alignment?: ImageAlignment
  caption?: string   // ← 追加
  nodeKey: NodeKey
}) {
  // 既存の実装...
  return (
    <figure ...>
      <img ... />
      {caption && (
        <figcaption className="text-sm text-muted-foreground text-center mt-2">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
```

`decorate()` で `caption` を渡す:

```typescript
override decorate(): ReactElement {
  return (
    <ImageComponent
      src={$getState(this, srcState)}
      alt={$getState(this, altState)}
      width={$getState(this, widthState)}
      height={$getState(this, heightState)}
      alignment={$getState(this, alignmentState)}
      caption={$getState(this, captionState)}   // ← 追加
      nodeKey={this.__key}
    />
  )
}
```

**Step 3: 検証**

```bash
bun run validate
```

Expected: 型エラー・lint エラーなし

**Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/nodes/ImageNode.tsx
git commit -m "fix(lexical): ImageNode.decorate() に captionState を渡してキャプション表示を修正"
```

---

### Task 1-B: RubyNode importDOM ロジック改善

**Files:**

- Modify: `NODES/RubyNode.tsx`

**背景:** `element.textContent.replace(rtText, '')` は rt テキストが本文中に重複している場合、最初に出現した文字列を削除してしまう。

**Step 1: RubyNode.tsx を読む**

importDOM の変換関数を確認（約 40-60 行付近）。

**Step 2: baseText 抽出ロジックを修正**

```typescript
// Before (NG: rt テキストが本文に重複するとバグ)
const baseText = (element.textContent ?? "").replace(rtText, "").trim();

// After (OK: ChildNodes を走査して Text ノードのみ収集)
const baseText = Array.from(element.childNodes)
  .filter((n) => n.nodeType === Node.TEXT_NODE)
  .map((n) => n.textContent ?? "")
  .join("")
  .trim();
```

**Step 3: 検証**

```bash
bun run validate
```

**Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/nodes/RubyNode.tsx
git commit -m "fix(lexical): RubyNode importDOM の baseText 抽出を childNodes 走査に変更"
```

---

### Task 1-C: CodeNode 言語セレクタ Inspector パネル追加

**Files:**

- Create: `PANELS/CodeInspectorPanel.tsx`
- Modify: `PANELS/index.ts`
- Modify: `INSPECTOR/InspectorSidebar.tsx`
- Modify: `INSPECTOR/hooks/inspectable-nodes.ts`
- Modify: `CONFIG/inspector-registry.ts`

**背景:** `@lexical/code` の CodeNode は言語設定をサポートするが、Inspector パネルに言語セレクタがない。

**Step 1: 既存の Inspector パネルを 1 つ読んで UI パターンを把握**

例: `PANELS/ImageInspectorPanel.tsx` を Read ツールで確認。

**Step 2: CodeInspectorPanel.tsx を作成**

```typescript
'use client'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import { $isCodeNode, CodeNode } from '@lexical/code'
import type { NodeKey } from 'lexical'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui/select'
import { Label } from '@/admin/components/ui/label'

const CODE_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
  { value: 'text', label: 'プレーンテキスト' },
] as const

type Props = {
  nodeKey: NodeKey
  node: CodeNode
}

export function CodeInspectorPanel({ nodeKey, node }: Props) {
  const [editor] = useLexicalComposerContext()

  const currentLanguage = node.getLanguage() ?? 'text'

  function handleLanguageChange(language: string) {
    editor.update(() => {
      const codeNode = $getNodeByKey(nodeKey)
      if ($isCodeNode(codeNode)) {
        codeNode.setLanguage(language)
      }
    })
  }

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-sm font-semibold">コードブロック設定</h3>
      <div className="space-y-2">
        <Label htmlFor="code-language">言語</Label>
        <Select value={currentLanguage} onValueChange={handleLanguageChange}>
          <SelectTrigger id="code-language">
            <SelectValue placeholder="言語を選択" />
          </SelectTrigger>
          <SelectContent>
            {CODE_LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
```

**Step 3: inspectable-nodes.ts を更新**

```typescript
// InspectableNodeType に 'code' を追加
export type InspectableNodeType =
  | "button"
  | "image"
  | "callout"
  | "bookmark"
  | "pullQuote"
  | "collapsible"
  | "steps"
  | "tabs"
  | "layout"
  | "youtube"
  | "vimeo"
  | "x"
  | "instagram"
  | "pageBreak"
  | "mapEmbed"
  | "code"; // ← 追加

// SelectedNodeInfo に union メンバーを追加
// import { CodeNode, $isCodeNode } from '@lexical/code' を追加してから:
export type SelectedNodeInfo =
  // ... 既存のメンバー
  { nodeType: "code"; node: CodeNode; nodeKey: NodeKey } | null;
```

**Step 4: inspector-registry.ts を更新**

```typescript
import { CodeNode, $isCodeNode } from "@lexical/code";

// getInspectableInfoFromRegistry() に追加
if ($isCodeNode(node)) return { nodeType: "code", node, nodeKey };

// INSPECTABLE_NODE_TYPES_FROM_REGISTRY に追加
export const INSPECTABLE_NODE_TYPES_FROM_REGISTRY = [
  // ...既存,
  "code",
] as const satisfies readonly InspectableNodeType[];
```

**Step 5: panels/index.ts を更新**

```typescript
export { CodeInspectorPanel } from "./CodeInspectorPanel";
```

**Step 6: InspectorSidebar.tsx の renderPanel() に case 追加**

```typescript
case 'code':
  return <CodeInspectorPanel nodeKey={info.nodeKey} node={info.node} />
```

**Step 7: 検証・コミット**

```bash
bun run validate
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/inspector/
git commit -m "feat(lexical): CodeNode 言語セレクタ InspectorPanel を追加"
```

---

## Phase 2: 新規ノード

> **参照実装:** DecoratorNode 系 → `NODES/VimeoNode.tsx` と `PLUGINS/VimeoPlugin.tsx`
> **参照実装:** ElementNode 系 → `NODES/CalloutNode.tsx` と `PLUGINS/CalloutPlugin.tsx`

---

### Task 2-A: AudioNode（音声プレイヤー）

**Files:**

- Create: `NODES/AudioNode.tsx`
- Create: `PLUGINS/AudioPlugin.tsx`
- Modify: `NODES/index.ts`, `CONFIG/nodes.ts`, `CONFIG/dialog-registry.ts`, `CONFIG/insert-items.ts`
- Modify: `PLUGINS/index.ts`
- Create: `PANELS/AudioInspectorPanel.tsx`
- Modify: `CONFIG/inspector-registry.ts`, `INSPECTOR/hooks/inspectable-nodes.ts`, `PANELS/index.ts`, `INSPECTOR/InspectorSidebar.tsx`

**Step 1: AudioNode.tsx を作成**

```typescript
// NODES/AudioNode.tsx
import type { ReactElement } from 'react'
import { DecoratorNode } from 'lexical'
import { createState, $getState, $setState } from '@lexical/config'

export const audioUrlState = createState('url', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})
export const audioTitleState = createState('title', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})
export const audioArtistState = createState('artist', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

export class AudioNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config('audio', {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: audioUrlState },
        { flat: true, stateConfig: audioTitleState },
        { flat: true, stateConfig: audioArtistState },
      ],
    })
  }

  override createDOM(): HTMLElement {
    return document.createElement('div')
  }

  override updateDOM(): boolean {
    return false
  }

  override exportDOM() {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-audio', 'true')
    wrapper.setAttribute('data-audio-title', $getState(this, audioTitleState))
    wrapper.setAttribute('data-audio-artist', $getState(this, audioArtistState))
    const audio = document.createElement('audio')
    audio.setAttribute('src', $getState(this, audioUrlState))
    audio.setAttribute('controls', '')
    audio.setAttribute('preload', 'metadata')
    wrapper.appendChild(audio)
    return { element: wrapper }
  }

  override decorate(): ReactElement {
    return (
      <AudioComponent
        url={$getState(this, audioUrlState)}
        title={$getState(this, audioTitleState)}
        artist={$getState(this, audioArtistState)}
        nodeKey={this.__key}
      />
    )
  }
}

export function $createAudioNode(params: {
  url: string
  title?: string
  artist?: string
}): AudioNode {
  const node = new AudioNode()
  $setState(node, audioUrlState, params.url)
  $setState(node, audioTitleState, params.title ?? '')
  $setState(node, audioArtistState, params.artist ?? '')
  return node
}

export function $isAudioNode(node: unknown): node is AudioNode {
  return node instanceof AudioNode
}

// AudioComponent（同ファイル内）
function AudioComponent({
  url,
  title,
  artist,
  nodeKey,
}: {
  url: string
  title: string
  artist: string
  nodeKey: string
}) {
  // useLexicalNodeSelection で選択状態管理
  return (
    <div className="rounded-lg border bg-card p-4 my-2" data-audio-component>
      {(title || artist) && (
        <div className="mb-2">
          {title && <p className="text-sm font-medium">{title}</p>}
          {artist && <p className="text-xs text-muted-foreground">{artist}</p>}
        </div>
      )}
      <audio src={url} controls preload="metadata" className="w-full" />
    </div>
  )
}
```

**Step 2: AudioPlugin.tsx を作成**

VimeoPlugin.tsx を参照してダイアログ付きプラグインを作成:

```typescript
// PLUGINS/AudioPlugin.tsx
'use client'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import { useEffect, useState } from 'react'
import { $getSelection, $isRangeSelection } from 'lexical'
import { $createAudioNode } from '../nodes/AudioNode'
import type { DialogPluginProps } from '../config/dialog-registry'
// UI imports: Dialog, Input, Button, Label (from @/admin/components/ui/*)

export function AudioPlugin({ dialogId, onClose }: DialogPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')

  function handleInsert() {
    if (!url.trim()) return
    editor.update(() => {
      const audioNode = $createAudioNode({ url: url.trim(), title, artist })
      $insertNodeToNearestRoot(audioNode)
    })
    onClose()
  }

  // Dialog UI レンダリング（url 入力必須、title・artist は任意）
  return (
    <Dialog open onOpenChange={onClose}>
      {/* ... */}
    </Dialog>
  )
}
```

**Step 3: 9 箇所の登録更新**

以下を一括更新する:

**nodes/index.ts** に追加:

```typescript
export {
  AudioNode,
  $createAudioNode,
  $isAudioNode,
  audioUrlState,
  audioTitleState,
  audioArtistState,
} from "./AudioNode";
```

**config/nodes.ts** の `EDITOR_NODES` に追加:

```typescript
import { AudioNode } from '../nodes/AudioNode'
// EDITOR_NODES 配列内に追加
AudioNode,
```

**config/dialog-registry.ts** の `REGISTRY_DIALOG_IDS` と `DIALOG_REGISTRY` に追加:

```typescript
// REGISTRY_DIALOG_IDS as const 配列に 'audio' を追加
// DIALOG_REGISTRY 配列に追加:
{ dialogId: 'audio', component: AudioPlugin },
```

**config/insert-items.ts** の `INSERT_ITEMS` に追加:

```typescript
{
  id: 'audio',
  type: 'dialog',
  label: '音声プレイヤー',
  icon: Volume2,  // lucide-react
  keywords: ['audio', '音声', 'sound', 'music', '音楽', 'podcast'],
  category: 'media',
  showInToolbar: false,
  showInPicker: true,
  dialogId: 'audio',
},
```

**plugins/index.ts** に追加:

```typescript
export { AudioPlugin } from "./AudioPlugin";
```

**config/inspector-registry.ts** に追加:

```typescript
import { $isAudioNode } from '../nodes/AudioNode'
// getInspectableInfoFromRegistry() に:
if ($isAudioNode(node)) return { nodeType: 'audio', node, nodeKey }
// INSPECTABLE_NODE_TYPES_FROM_REGISTRY に:
'audio',
```

**inspector/hooks/inspectable-nodes.ts** に追加:

```typescript
import { AudioNode } from '../../nodes/AudioNode'
// InspectableNodeType に:
| 'audio'
// SelectedNodeInfo に:
| { nodeType: 'audio'; node: AudioNode; nodeKey: NodeKey }
```

**inspector/panels/index.ts** に追加:

```typescript
export { AudioInspectorPanel } from "./AudioInspectorPanel";
```

**inspector/InspectorSidebar.tsx** の `renderPanel()` に追加:

```typescript
case 'audio':
  return <AudioInspectorPanel nodeKey={info.nodeKey} node={info.node} />
```

**Step 4: AudioInspectorPanel.tsx を作成**

```typescript
// PANELS/AudioInspectorPanel.tsx
'use client'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import type { NodeKey } from 'lexical'
import { AudioNode, audioTitleState, audioArtistState, $isAudioNode } from '../../nodes/AudioNode'
import { $setState } from '@lexical/config'
import { Input } from '@/admin/components/ui/input'
import { Label } from '@/admin/components/ui/label'

type Props = { nodeKey: NodeKey; node: AudioNode }

export function AudioInspectorPanel({ nodeKey, node }: Props) {
  const [editor] = useLexicalComposerContext()

  function update(field: 'title' | 'artist', value: string) {
    editor.update(() => {
      const n = $getNodeByKey(nodeKey)
      if (!$isAudioNode(n)) return
      if (field === 'title') $setState(n, audioTitleState, value)
      if (field === 'artist') $setState(n, audioArtistState, value)
    })
  }

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-sm font-semibold">音声プレイヤー設定</h3>
      <div className="space-y-2">
        <Label>タイトル</Label>
        <Input defaultValue={node.__states?.title ?? ''} onBlur={(e) => update('title', e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>アーティスト</Label>
        <Input defaultValue={node.__states?.artist ?? ''} onBlur={(e) => update('artist', e.target.value)} />
      </div>
    </div>
  )
}
```

> **Note:** `node.__states` の参照は実際の NodeState API の取得方法に合わせて調整すること（`$getState(node, audioTitleState)` 等）。

**Step 5: 検証・コミット**

```bash
bun run validate
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/
git commit -m "feat(lexical): AudioNode（音声プレイヤー）を追加"
```

---

### Task 2-B: FileNode（ファイル添付）

**Files:**

- Create: `NODES/FileNode.tsx`
- Create: `PLUGINS/FilePlugin.tsx`
- Create: `PANELS/FileInspectorPanel.tsx`
- 登録 9 箇所（AudioNode と同じパターン）

**Step 1: FileNode.tsx を作成**

```typescript
// NODES/FileNode.tsx
import type { ReactElement } from 'react'
import { DecoratorNode } from 'lexical'
import { createState, $getState, $setState } from '@lexical/config'

export const fileUrlState = createState('url', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})
export const fileNameState = createState('filename', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})
export const fileSizeState = createState('filesize', {
  parse: (v: unknown): number => (typeof v === 'number' ? v : 0),
})
export const fileMimeState = createState('mime', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

// ファイルサイズフォーマット（bytes → "1.2 MB" 等）
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '不明'
  const units = ['B', 'KB', 'MB', 'GB'] as const
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

// mime から色クラスを決定（Tailwind CSS セマンティックカラー使用）
function getMimeIconClass(mime: string): string {
  if (mime.includes('pdf')) return 'text-red-500'
  if (mime.includes('word') || mime.includes('doc')) return 'text-blue-500'
  if (mime.includes('sheet') || mime.includes('xls') || mime.includes('csv')) return 'text-green-500'
  if (mime.includes('zip') || mime.includes('archive')) return 'text-yellow-500'
  return 'text-muted-foreground'
}

export class FileNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config('file', {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: fileUrlState },
        { flat: true, stateConfig: fileNameState },
        { flat: true, stateConfig: fileSizeState },
        { flat: true, stateConfig: fileMimeState },
      ],
    })
  }

  override createDOM(): HTMLElement {
    return document.createElement('div')
  }

  override updateDOM(): boolean {
    return false
  }

  override exportDOM() {
    const a = document.createElement('a')
    a.setAttribute('data-file', 'true')
    a.setAttribute('href', $getState(this, fileUrlState))
    a.setAttribute('download', '')
    a.setAttribute('data-file-name', $getState(this, fileNameState))
    a.setAttribute('data-file-size', String($getState(this, fileSizeState)))
    a.setAttribute('data-file-mime', $getState(this, fileMimeState))
    const name = $getState(this, fileNameState)
    const size = formatFileSize($getState(this, fileSizeState))
    a.textContent = `ダウンロード: ${name} (${size})`
    return { element: a }
  }

  override decorate(): ReactElement {
    return (
      <FileComponent
        url={$getState(this, fileUrlState)}
        fileName={$getState(this, fileNameState)}
        fileSize={$getState(this, fileSizeState)}
        mime={$getState(this, fileMimeState)}
        nodeKey={this.__key}
      />
    )
  }
}

export function $createFileNode(params: {
  url: string
  fileName: string
  fileSize?: number
  mime?: string
}): FileNode {
  const node = new FileNode()
  $setState(node, fileUrlState, params.url)
  $setState(node, fileNameState, params.fileName)
  $setState(node, fileSizeState, params.fileSize ?? 0)
  $setState(node, fileMimeState, params.mime ?? '')
  return node
}

export function $isFileNode(node: unknown): node is FileNode {
  return node instanceof FileNode
}

function FileComponent({
  url,
  fileName,
  fileSize,
  mime,
  nodeKey,
}: {
  url: string
  fileName: string
  fileSize: number
  mime: string
  nodeKey: string
}) {
  const iconClass = getMimeIconClass(mime)
  const sizeText = formatFileSize(fileSize)

  return (
    <a
      href={url}
      download
      className="flex items-center gap-3 rounded-lg border bg-card p-3 my-2 hover:bg-accent transition-colors no-underline"
    >
      <span className={`text-2xl ${iconClass}`}>📄</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName || url}</p>
        {fileSize > 0 && (
          <p className="text-xs text-muted-foreground">{sizeText}</p>
        )}
      </div>
    </a>
  )
}
```

**Step 2: FilePlugin.tsx を作成**

URL から自動的にファイル名を抽出するロジック含む:

```typescript
// PLUGINS/FilePlugin.tsx
"use client";

// ... (AudioPlugin と同じ構造)
// URL から filename を自動抽出:
function extractFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split("/").pop() ?? url;
  } catch {
    return url;
  }
}

// Dialog: URL 入力 → ファイル名自動補完（上書き可） + mime 推測
```

**Step 3: 登録 9 箇所（AudioNode と同パターンで `file` に読み替え）**

insert-items の category は `'media'`、icon は `Paperclip`（lucide-react）。

**Step 4: FileInspectorPanel.tsx を作成**

fileName, fileSize, mime の編集 UI。

**Step 5: 検証・コミット**

```bash
bun run validate
git commit -m "feat(lexical): FileNode（ファイル添付）を追加"
```

---

### Task 2-C: FigmaNode（Figma 埋め込み）

**Files:**

- Create: `NODES/FigmaNode.tsx`
- Create: `PLUGINS/FigmaPlugin.tsx`
- Create: `PANELS/FigmaInspectorPanel.tsx`
- 登録 9 箇所

**Step 1: FigmaNode.tsx を作成**

URL 変換ユーティリティを含む:

```typescript
// NODES/FigmaNode.tsx
export function toFigmaEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('figma.com')) return null
    // /file/, /proto/, /design/ を /embed?embed_host=share&url=... に変換
    const encoded = encodeURIComponent(url)
    return `https://www.figma.com/embed?embed_host=share&url=${encoded}`
  } catch {
    return null
  }
}

export const figmaEmbedUrlState = createState('embedUrl', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})
export const figmaLabelState = createState('label', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

export class FigmaNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config('figma', {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: figmaEmbedUrlState },
        { flat: true, stateConfig: figmaLabelState },
      ],
    })
  }

  // createDOM / updateDOM / exportDOM / decorate ...
  override exportDOM() {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-figma', 'true')
    wrapper.setAttribute('data-figma-label', $getState(this, figmaLabelState))
    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', $getState(this, figmaEmbedUrlState))
    iframe.setAttribute('allow', 'fullscreen')
    iframe.setAttribute('loading', 'lazy')
    iframe.style.width = '100%'
    iframe.style.height = '450px'
    iframe.style.border = 'none'
    wrapper.appendChild(iframe)
    return { element: wrapper }
  }

  override decorate(): ReactElement {
    return (
      <FigmaComponent
        embedUrl={$getState(this, figmaEmbedUrlState)}
        label={$getState(this, figmaLabelState)}
        nodeKey={this.__key}
      />
    )
  }
}
```

**Step 2: FigmaPlugin.tsx を作成**

URL 入力 → `toFigmaEmbedUrl()` で変換 → 無効なら error 表示。

**Step 3: 登録 9 箇所**

category は `'media'`、icon は `Figma`（lucide-react）またはカスタムアイコン。

**Step 4: FigmaInspectorPanel.tsx を作成**

Label の編集 UI。

**Step 5: 検証・コミット**

```bash
bun run validate
git commit -m "feat(lexical): FigmaNode（Figma 埋め込み）を追加"
```

---

### Task 2-D: SpotifyNode（音楽・Podcast 埋め込み）

**Files:**

- Create: `NODES/SpotifyNode.tsx`
- Create: `PLUGINS/SpotifyPlugin.tsx`
- Create: `PANELS/SpotifyInspectorPanel.tsx`
- 登録 9 箇所

**Step 1: SpotifyNode.tsx を作成**

```typescript
// NODES/SpotifyNode.tsx
export type SpotifyType = 'track' | 'album' | 'playlist' | 'episode' | 'show'

export function toSpotifyEmbedUrl(url: string): { embedUrl: string; type: SpotifyType } | null {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('spotify.com')) return null
    // open.spotify.com/track/xxx → open.spotify.com/embed/track/xxx
    const parts = u.pathname.split('/').filter(Boolean)
    const types: SpotifyType[] = ['track', 'album', 'playlist', 'episode', 'show']
    const typeIndex = parts.findIndex((p) => types.includes(p as SpotifyType))
    if (typeIndex === -1 || !parts[typeIndex + 1]) return null
    const type = parts[typeIndex] as SpotifyType
    const id = parts[typeIndex + 1]
    return {
      embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
      type,
    }
  } catch {
    return null
  }
}

export const spotifyEmbedUrlState = createState('embedUrl', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})
export const spotifyTypeState = createState('spotifyType', {
  parse: (v: unknown): SpotifyType =>
    ['track', 'album', 'playlist', 'episode', 'show'].includes(v as string)
      ? (v as SpotifyType)
      : 'track',
})

export class SpotifyNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config('spotify', {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: spotifyEmbedUrlState },
        { flat: true, stateConfig: spotifyTypeState },
      ],
    })
  }

  override exportDOM() {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-spotify', 'true')
    wrapper.setAttribute('data-spotify-type', $getState(this, spotifyTypeState))
    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', $getState(this, spotifyEmbedUrlState))
    iframe.setAttribute('allow', 'encrypted-media')
    iframe.setAttribute('loading', 'lazy')
    iframe.style.width = '100%'
    iframe.style.height = '352px'
    iframe.style.border = 'none'
    iframe.style.borderRadius = '12px'
    wrapper.appendChild(iframe)
    return { element: wrapper }
  }

  override decorate(): ReactElement {
    return (
      <SpotifyComponent
        embedUrl={$getState(this, spotifyEmbedUrlState)}
        type={$getState(this, spotifyTypeState)}
        nodeKey={this.__key}
      />
    )
  }
}
```

**Step 2: 登録 9 箇所・検証・コミット**

```bash
git commit -m "feat(lexical): SpotifyNode（音楽/Podcast 埋め込み）を追加"
```

---

### Task 2-E: GalleryNode（画像ギャラリー）

**Files:**

- Create: `NODES/GalleryNode.tsx`（GalleryContainerNode + GalleryItemNode）
- Create: `PANELS/GalleryContainerInspectorPanel.tsx`
- Create: `PANELS/GalleryItemInspectorPanel.tsx`
- 登録 9 箇所（ダイアログは任意・コンポジットなので dialog は optional）

**背景:** GalleryContainerNode（ElementNode）が GalleryItemNode（ElementNode）を子として持つコンポジットノード。ダイアログで「列数選択」のみ行い、空のギャラリーを挿入。画像追加は Inspector から行う。

**Step 1: GalleryNode.tsx を作成**

```typescript
// NODES/GalleryNode.tsx
import { ElementNode } from "lexical";
import type { LexicalNode, NodeKey } from "lexical";
import {
  createState,
  $getState,
  $setState,
  $getStateChange,
} from "@lexical/config";
import type { SerializedLexicalNode } from "lexical";

export type GalleryColumns = 2 | 3 | 4;
export type GalleryStyle = "grid" | "masonry";

export const galleryColumnsState = createState("columns", {
  parse: (v: unknown): GalleryColumns =>
    v === 2 || v === 3 || v === 4 ? v : 3,
});
export const galleryStyleState = createState("style", {
  parse: (v: unknown): GalleryStyle =>
    v === "grid" || v === "masonry" ? v : "grid",
});

export class GalleryContainerNode extends ElementNode {
  override $config() {
    return this.config("gallery-container", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: galleryColumnsState },
        { flat: true, stateConfig: galleryStyleState },
      ],
    });
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override createDOM(): HTMLElement {
    const div = document.createElement("div");
    const cols = $getState(this, galleryColumnsState);
    const style = $getState(this, galleryStyleState);
    div.setAttribute("data-gallery", "true");
    div.setAttribute("data-gallery-columns", String(cols));
    div.setAttribute("data-gallery-style", style);
    return div;
  }

  override updateDOM(
    prevNode: GalleryContainerNode,
    dom: HTMLElement,
  ): boolean {
    const colsChanged = $getStateChange(prevNode, this, galleryColumnsState);
    const styleChanged = $getStateChange(prevNode, this, galleryStyleState);
    if (colsChanged !== undefined) {
      dom.setAttribute("data-gallery-columns", String(colsChanged));
    }
    if (styleChanged !== undefined) {
      dom.setAttribute("data-gallery-style", styleChanged);
    }
    return false;
  }

  override exportDOM() {
    const div = document.createElement("div");
    div.setAttribute("data-gallery", "true");
    div.setAttribute(
      "data-gallery-columns",
      String($getState(this, galleryColumnsState)),
    );
    div.setAttribute("data-gallery-style", $getState(this, galleryStyleState));
    return { element: div };
  }

  override canInsertTextBefore(): boolean {
    return false;
  }
  override canInsertTextAfter(): boolean {
    return false;
  }
}

// GalleryItem states
export const galleryItemSrcState = createState("src", {
  parse: (v: unknown): string => (typeof v === "string" ? v : ""),
});
export const galleryItemAltState = createState("alt", {
  parse: (v: unknown): string => (typeof v === "string" ? v : ""),
});
export const galleryItemCaptionState = createState("caption", {
  parse: (v: unknown): string => (typeof v === "string" ? v : ""),
});

export class GalleryItemNode extends ElementNode {
  override $config() {
    return this.config("gallery-item", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: galleryItemSrcState },
        { flat: true, stateConfig: galleryItemAltState },
        { flat: true, stateConfig: galleryItemCaptionState },
      ],
    });
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override createDOM(): HTMLElement {
    const figure = document.createElement("figure");
    figure.setAttribute("data-gallery-item", "true");
    const img = document.createElement("img");
    img.src = $getState(this, galleryItemSrcState);
    img.alt = $getState(this, galleryItemAltState);
    figure.appendChild(img);
    const caption = $getState(this, galleryItemCaptionState);
    if (caption) {
      const figcaption = document.createElement("figcaption");
      figcaption.textContent = caption;
      figure.appendChild(figcaption);
    }
    return figure;
  }

  override updateDOM(): boolean {
    return true; // DOM を完全に再生成
  }

  override exportDOM() {
    const figure = document.createElement("figure");
    figure.setAttribute("data-gallery-item", "true");
    const img = document.createElement("img");
    img.setAttribute("src", $getState(this, galleryItemSrcState));
    img.setAttribute("alt", $getState(this, galleryItemAltState));
    figure.appendChild(img);
    const caption = $getState(this, galleryItemCaptionState);
    if (caption) {
      const figcaption = document.createElement("figcaption");
      figcaption.textContent = caption;
      figure.appendChild(figcaption);
    }
    return { element: figure };
  }

  override canInsertTextBefore(): boolean {
    return false;
  }
  override canInsertTextAfter(): boolean {
    return false;
  }
}

// ファクトリ
export function $createGalleryContainerNode(
  columns: GalleryColumns = 3,
): GalleryContainerNode {
  const node = new GalleryContainerNode();
  $setState(node, galleryColumnsState, columns);
  return node;
}

export function $createGalleryItemNode(params: {
  src: string;
  alt?: string;
  caption?: string;
}): GalleryItemNode {
  const node = new GalleryItemNode();
  $setState(node, galleryItemSrcState, params.src);
  $setState(node, galleryItemAltState, params.alt ?? "");
  $setState(node, galleryItemCaptionState, params.caption ?? "");
  return node;
}

export function $isGalleryContainerNode(
  node: unknown,
): node is GalleryContainerNode {
  return node instanceof GalleryContainerNode;
}

export function $isGalleryItemNode(node: unknown): node is GalleryItemNode {
  return node instanceof GalleryItemNode;
}
```

**Step 2: GalleryPlugin.tsx を作成**（列数選択ダイアログ）

```typescript
// PLUGINS/GalleryPlugin.tsx
// ダイアログ: 2列 / 3列 / 4列 を RadioGroup で選択
// 挿入時: $createGalleryContainerNode(columns) を $insertNodeToNearestRoot
```

**Step 3: 登録 9 箇所**

`EDITOR_NODES` に **両方**（GalleryContainerNode + GalleryItemNode）を追加すること:

```typescript
GalleryContainerNode,
GalleryItemNode,
```

`INSPECTABLE_NODE_TYPES` / `SelectedNodeInfo` にも両方追加:

```typescript
| 'galleryContainer'
| 'galleryItem'
```

**Step 4: GalleryContainerInspectorPanel.tsx を作成**

列数変更（2/3/4）とスタイル変更（grid/masonry）の UI。

**Step 5: GalleryItemInspectorPanel.tsx を作成**

src / alt / caption の編集 UI + 画像プレビュー表示。

**Step 6: 検証・コミット**

```bash
bun run validate
git commit -m "feat(lexical): GalleryNode（画像ギャラリー）を追加"
```

---

### Task 2-F: TimelineNode（水平/垂直タイムライン）

**Files:**

- Create: `NODES/TimelineNode.tsx`（TimelineContainerNode + TimelineItemNode）
- Create: `PLUGINS/TimelinePlugin.tsx`
- Create: `PANELS/TimelineContainerInspectorPanel.tsx`
- Create: `PANELS/TimelineItemInspectorPanel.tsx`
- 登録 9 箇所

**Step 1: TimelineNode.tsx を作成**

```typescript
// NODES/TimelineNode.tsx
export type TimelineDirection = "horizontal" | "vertical";

export const timelineDirectionState = createState("direction", {
  parse: (v: unknown): TimelineDirection =>
    v === "horizontal" || v === "vertical" ? v : "vertical",
});
export const timelineColorState = createState("color", {
  parse: (v: unknown): string => (typeof v === "string" ? v : "default"),
});

export class TimelineContainerNode extends ElementNode {
  override $config() {
    return this.config("timeline-container", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: timelineDirectionState },
        { flat: true, stateConfig: timelineColorState },
      ],
    });
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override createDOM(): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-timeline", "true");
    div.setAttribute("data-direction", $getState(this, timelineDirectionState));
    div.setAttribute("data-color", $getState(this, timelineColorState));
    return div;
  }

  override updateDOM(
    prevNode: TimelineContainerNode,
    dom: HTMLElement,
  ): boolean {
    const dirChange = $getStateChange(prevNode, this, timelineDirectionState);
    const colorChange = $getStateChange(prevNode, this, timelineColorState);
    if (dirChange !== undefined) dom.setAttribute("data-direction", dirChange);
    if (colorChange !== undefined) dom.setAttribute("data-color", colorChange);
    return false;
  }

  override exportDOM() {
    const div = document.createElement("div");
    div.setAttribute("data-timeline", "true");
    div.setAttribute("data-direction", $getState(this, timelineDirectionState));
    div.setAttribute("data-color", $getState(this, timelineColorState));
    return { element: div };
  }
}

export const timelineYearState = createState("year", {
  parse: (v: unknown): string => (typeof v === "string" ? v : ""),
});
export const timelineLabelState = createState("label", {
  parse: (v: unknown): string => (typeof v === "string" ? v : ""),
});

export class TimelineItemNode extends ElementNode {
  override $config() {
    return this.config("timeline-item", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: timelineYearState },
        { flat: true, stateConfig: timelineLabelState },
      ],
    });
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override createDOM(): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-timeline-item", "true");
    // year ラベル
    const yearDiv = document.createElement("div");
    yearDiv.setAttribute(
      "data-timeline-year",
      $getState(this, timelineYearState),
    );
    yearDiv.textContent = $getState(this, timelineYearState);
    // label
    const labelDiv = document.createElement("div");
    labelDiv.setAttribute("data-timeline-label", "");
    labelDiv.textContent = $getState(this, timelineLabelState);
    // content
    const contentDiv = document.createElement("div");
    contentDiv.setAttribute("data-timeline-content", "");
    div.appendChild(yearDiv);
    div.appendChild(labelDiv);
    div.appendChild(contentDiv);
    return div;
  }

  override updateDOM(): boolean {
    return true;
  }

  override exportDOM() {
    const div = document.createElement("div");
    div.setAttribute("data-timeline-item", "true");
    const yearDiv = document.createElement("div");
    yearDiv.setAttribute(
      "data-timeline-year",
      $getState(this, timelineYearState),
    );
    yearDiv.textContent = $getState(this, timelineYearState);
    const labelDiv = document.createElement("div");
    labelDiv.setAttribute("data-timeline-label", "");
    labelDiv.textContent = $getState(this, timelineLabelState);
    const contentDiv = document.createElement("div");
    contentDiv.setAttribute("data-timeline-content", "");
    div.appendChild(yearDiv);
    div.appendChild(labelDiv);
    div.appendChild(contentDiv);
    return { element: div };
  }
}

export function $createTimelineContainerNode(
  direction: TimelineDirection = "vertical",
  color = "default",
): TimelineContainerNode {
  const node = new TimelineContainerNode();
  $setState(node, timelineDirectionState, direction);
  $setState(node, timelineColorState, color);
  return node;
}

export function $createTimelineItemNode(
  params: {
    year?: string;
    label?: string;
  } = {},
): TimelineItemNode {
  const node = new TimelineItemNode();
  $setState(node, timelineYearState, params.year ?? "");
  $setState(node, timelineLabelState, params.label ?? "");
  return node;
}

export function $isTimelineContainerNode(
  n: unknown,
): n is TimelineContainerNode {
  return n instanceof TimelineContainerNode;
}
export function $isTimelineItemNode(n: unknown): n is TimelineItemNode {
  return n instanceof TimelineItemNode;
}
```

**Step 2: TimelinePlugin.tsx を作成**（direction 選択ダイアログ）

初期タイムライン（Container + 2 Item）を挿入。

**Step 3: 登録 9 箇所・Inspector パネル（方向/色変更、year/label 編集）**

category は `'layout'`、icon は `Timeline`（lucide-react の `GitCommitVertical` 等）。

**Step 4: 検証・コミット**

```bash
bun run validate
git commit -m "feat(lexical): TimelineNode（タイムライン）を追加"
```

---

### Task 2-G: PricingTableNode（料金比較表）

**Files:**

- Create: `NODES/PricingTableNode.tsx`（PricingTableContainerNode + PricingPlanNode + PricingFeatureNode）
- Create: `PLUGINS/PricingTablePlugin.tsx`
- Create: `PANELS/PricingPlanInspectorPanel.tsx`
- 登録 9 箇所

**Step 1: PricingTableNode.tsx を作成（3 クラス）**

```typescript
// NODES/PricingTableNode.tsx

// PricingTableContainerNode: ElementNode
// stateConfigs: なし（columns は子の数で自動決定）

// PricingPlanNode: ElementNode
// stateConfigs:
export const planNameState = createState('name', { parse: (v): string => typeof v === 'string' ? v : '' })
export const planPriceState = createState('price', { parse: (v): string => typeof v === 'string' ? v : '' })
export const planPeriodState = createState('period', { parse: (v): string => typeof v === 'string' ? v : '' })
export const planFeaturedState = createState('featured', { parse: (v): boolean => v === true })
export const planColorState = createState('color', { parse: (v): string => typeof v === 'string' ? v : 'default' })

// PricingFeatureNode: ElementNode
// stateConfigs:
export const featureTextState = createState('text', { parse: (v): string => typeof v === 'string' ? v : '' })
export const featureIncludedState = createState('included', { parse: (v): boolean => v !== false })

// 各クラス:
// - isShadowRoot(): true
// - createDOM / updateDOM / exportDOM で data-attributes 使用
// - exportDOM:
//   PricingTableContainerNode → <div data-pricing="true" data-pricing-columns="{count}">
//   PricingPlanNode → <div data-pricing-plan="true" data-featured="{bool}" data-color="{color}">
//   PricingFeatureNode → <li data-included="{bool}">{text}</li>

// ファクトリ関数
export function $createPricingTableContainerNode(): PricingTableContainerNode
export function $createPricingPlanNode(params: { name?: string; price?: string; ... }): PricingPlanNode
export function $createPricingFeatureNode(params: { text?: string; included?: boolean }): PricingFeatureNode
```

**Step 2: PricingTablePlugin.tsx**（列数選択 → 初期プラン 2〜3 列を自動挿入）

**Step 3: 登録 9 箇所**（3 ノードクラス全て EDITOR_NODES に登録）

category は `'layout'`、icon は `Table2`（lucide-react）。

**Step 4: PricingPlanInspectorPanel.tsx**（name, price, period, featured toggle, color 選択）

**Step 5: 検証・コミット**

```bash
bun run validate
git commit -m "feat(lexical): PricingTableNode（料金比較表）を追加"
```

---

## Phase 3: 出力・変換強化

### Task 3-A: Markdown インポート機能

**Files:**

- Modify: `PLUGINS/ToolbarPlugin.tsx`（または ToolbarPlugin が参照する Export/Import 用コンポーネント）

**Step 1: ToolbarPlugin.tsx を読む**

エクスポートメニューの現在実装を確認（`$convertToMarkdownString`, DropdownMenu など）。

**Step 2: インポートダイアログコンポーネントを追加**

```typescript
// ToolbarPlugin.tsx 内、または専用コンポーネントファイル
function MarkdownImportDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [editor] = useLexicalComposerContext()
  const [markdown, setMarkdown] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  function handleImport() {
    if (!confirmed) {
      setConfirmed(true)
      return
    }
    editor.update(() => {
      $convertFromMarkdownString(markdown, TRANSFORMERS)
    })
    onClose()
    setConfirmed(false)
    setMarkdown('')
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Markdown をインポート</DialogTitle>
          <DialogDescription>
            {confirmed
              ? '⚠️ インポートすると現在のコンテンツは置き換えられます。この操作は取り消せません。続行しますか？'
              : 'Markdown テキストを貼り付けてください。'}
          </DialogDescription>
        </DialogHeader>
        {!confirmed && (
          <Textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            rows={10}
            placeholder="# 見出し&#10;&#10;本文..."
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button
            onClick={handleImport}
            variant={confirmed ? 'destructive' : 'default'}
          >
            {confirmed ? '置き換える' : '次へ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 3: エクスポートメニューに「Markdown をインポート」を追加**

セパレーターの後に配置:

```typescript
// DropdownMenu 内
<DropdownMenuSeparator />
<DropdownMenuItem onClick={() => setShowMarkdownImport(true)}>
  <Upload className="h-4 w-4 mr-2" />
  Markdown をインポート
</DropdownMenuItem>
```

**Step 4: 検証・コミット**

```bash
bun run validate
git commit -m "feat(lexical): Markdown インポート機能をツールバーに追加"
```

---

### Task 3-B: エクスポートメニュー強化

**Files:**

- Modify: `PLUGINS/ToolbarPlugin.tsx`

**Step 1: ToolbarPlugin.tsx を読んで現在のエクスポートメニューを確認**

**Step 2: HTML コピー・プレーンテキストコピーを追加**

```typescript
import { $generateHtmlFromNodes } from "@lexical/html";

// HTML をコピー
function handleCopyHtml() {
  editor.read(() => {
    const html = $generateHtmlFromNodes(editor);
    navigator.clipboard.writeText(html);
  });
}

// プレーンテキストをコピー
function handleCopyPlainText() {
  editor.read(() => {
    const text = $getRoot().getTextContent();
    navigator.clipboard.writeText(text);
  });
}
```

エクスポートメニュー構成（統一後）:

```
📋 Markdown をコピー      (既存)
📄 HTML をコピー          (追加)
📝 プレーンテキストをコピー (追加)
─────────────────────────
⬆️ Markdown をインポート  (3-A)
```

**Step 3: 検証・コミット**

```bash
bun run validate
git commit -m "feat(lexical): エクスポートメニューに HTML・プレーンテキストコピーを追加"
```

---

### Task 3-C: プリントプレビューモード

**Files:**

- Modify: `PLUGINS/ToolbarPlugin.tsx`

**Step 1: ToolbarPlugin.tsx を読む**

**Step 2: プリントプレビュー状態と UI を追加**

```typescript
// ToolbarPlugin.tsx
const [isPrintPreview, setIsPrintPreview] = useState(false)

// プリントプレビュー UI
if (isPrintPreview) {
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-auto">
      <div className="flex justify-between items-center p-4 border-b print:hidden">
        <span className="text-sm text-muted-foreground">印刷プレビュー</span>
        <div className="flex gap-2">
          <Button onClick={() => window.print()} size="sm">
            印刷
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsPrintPreview(false)}>
            閉じる
          </Button>
        </div>
      </div>
      <div className="max-w-[21cm] mx-auto py-[2cm] px-[2.5cm] min-h-[29.7cm]">
        {/* エディタの読み取り専用レンダリング */}
        <LexicalComposer initialConfig={{ ...editorConfig, editable: false }}>
          <RichTextPlugin contentEditable={<div />} placeholder={null} ErrorBoundary={LexicalErrorBoundary} />
        </LexicalComposer>
      </div>
    </div>
  )
}

// ツールバーに「プリントプレビュー」ボタン追加
<Button
  variant="ghost"
  size="sm"
  onClick={() => setIsPrintPreview(true)}
  title="プリントプレビュー"
>
  <Printer className="h-4 w-4" />
</Button>
```

> **Note:** LexicalComposer の入れ子は制約があるため、実際の実装では `$generateHtmlFromNodes()` で HTML を生成して iframe や新しいウィンドウに出力する方が現実的。実装時に確認して適切な方法を選択すること。

**Step 3: 検証・コミット**

```bash
bun run validate
git commit -m "feat(lexical): プリントプレビューモードを追加"
```

---

## Phase 4: UX 改善

### Task 4-A: Link ホバープレビュー

**Files:**

- Modify: `PLUGINS/FloatingToolbarPlugin.tsx`（または FloatingLinkEditorPlugin）

**Step 1: 既存の FloatingToolbarPlugin / FloatingLinkEditorPlugin を読む**

リンク選択時の Popover パターンを確認。

**Step 2: ホバー時 Popover を追加**

```typescript
// FloatingLinkEditorPlugin.tsx または FloatingToolbarPlugin.tsx
// リンク上でホバーした時に useEffect で DOM イベントリスナーを追加
// Popover でドメイン + URL + 外部リンクアイコンを表示

function LinkHoverPreview({
  url,
  position,
}: {
  url: string
  position: { top: number; left: number }
}) {
  let domain = ''
  try {
    domain = new URL(url).hostname
  } catch {
    domain = url
  }
  const isExternal = !url.startsWith('/')

  return (
    <div
      className="fixed z-50 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md flex items-center gap-2"
      style={{ top: position.top, left: position.left }}
    >
      {isExternal && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
      <span className="text-muted-foreground text-xs">{domain}</span>
      <span className="max-w-[200px] truncate">{url}</span>
    </div>
  )
}
```

**Step 3: 検証・コミット**

```bash
bun run validate
git commit -m "feat(lexical): Link ホバープレビューを追加"
```

---

### Task 4-B: ブロック移動ボタン（Up/Down）

**Files:**

- Modify: `PLUGINS/DraggableBlockPlugin.tsx`

**Step 1: DraggableBlockPlugin.tsx を読む**

ドラッグハンドルの DOM 構造とイベントを確認。

**Step 2: ↑ / ↓ ボタンを追加**

```typescript
// ドラッグハンドル DOM に隣接してボタンを追加
function moveBlock(direction: 'up' | 'down', targetNode: LexicalNode) {
  editor.update(() => {
    if (direction === 'up') {
      const prev = targetNode.getPreviousSibling()
      if (prev) prev.insertBefore(targetNode)
    } else {
      const next = targetNode.getNextSibling()
      if (next) next.insertAfter(targetNode)
    }
  })
}

// ハンドル近傍 UI
<div className="flex flex-col gap-0.5">
  <button
    onClick={() => moveBlock('up', node)}
    className="h-4 w-4 rounded-sm hover:bg-accent flex items-center justify-center"
    title="上に移動"
  >
    <ChevronUp className="h-3 w-3" />
  </button>
  <button
    onClick={() => moveBlock('down', node)}
    className="h-4 w-4 rounded-sm hover:bg-accent flex items-center justify-center"
    title="下に移動"
  >
    <ChevronDown className="h-3 w-3" />
  </button>
</div>
```

**Step 3: 検証・コミット**

```bash
bun run validate
git commit -m "feat(lexical): DraggableBlockPlugin にブロック移動ボタン（Up/Down）を追加"
```

---

### Task 4-C: ショートカットヘルプモーダル

**Files:**

- Modify: `PLUGINS/ToolbarPlugin.tsx`
- Modify: `PLUGINS/KeyboardShortcutsPlugin.tsx`（既存のショートカット定義を参照）

**Step 1: KeyboardShortcutsPlugin.tsx を読む**

登録済みショートカット一覧を確認。

**Step 2: ショートカット一覧モーダルを作成**

```typescript
// ToolbarPlugin.tsx 内
const SHORTCUT_CATEGORIES = [
  {
    label: 'テキスト',
    shortcuts: [
      { keys: ['Ctrl', 'B'], description: '太字' },
      { keys: ['Ctrl', 'I'], description: 'イタリック' },
      { keys: ['Ctrl', 'U'], description: '下線' },
      { keys: ['Ctrl', 'Shift', 'S'], description: '取り消し線' },
      { keys: ['Ctrl', 'Shift', 'C'], description: 'インラインコード' },
    ],
  },
  {
    label: 'ブロック',
    shortcuts: [
      { keys: ['Ctrl', 'Alt', '1'], description: '見出し 1' },
      { keys: ['Ctrl', 'Alt', '2'], description: '見出し 2' },
      { keys: ['Ctrl', '\\'], description: 'ノーマルテキスト' },
      { keys: ['Tab'], description: 'インデント（リスト内）' },
    ],
  },
  {
    label: '操作',
    shortcuts: [
      { keys: ['Ctrl', 'Z'], description: '元に戻す' },
      { keys: ['Ctrl', 'Shift', 'Z'], description: 'やり直す' },
      { keys: ['Ctrl', 'A'], description: '全選択' },
      { keys: ['Ctrl', '/'], description: 'ショートカット一覧' },
    ],
  },
] as const

function ShortcutsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>キーボードショートカット</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SHORTCUT_CATEGORIES.map((cat) => (
            <div key={cat.label}>
              <h3 className="text-sm font-semibold mb-2">{cat.label}</h3>
              <ul className="space-y-1">
                {cat.shortcuts.map((s) => (
                  <li key={s.description} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{s.description}</span>
                    <div className="flex gap-1">
                      {s.keys.map((k) => (
                        <kbd key={k} className="rounded border px-1.5 py-0.5 text-xs font-mono bg-muted">
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 3: `Ctrl+/` ショートカットでモーダル表示**

```typescript
// KeyboardShortcutsPlugin.tsx または ToolbarPlugin.tsx
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      e.preventDefault();
      setShowShortcuts(true);
    }
  }
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, []);
```

**Step 4: ツールバーに `?` ボタンを追加**

```typescript
<Button
  variant="ghost"
  size="sm"
  onClick={() => setShowShortcuts(true)}
  title="ショートカット一覧 (Ctrl+/)"
>
  <HelpCircle className="h-4 w-4" />
</Button>
```

**Step 5: 検証・コミット**

```bash
bun run validate
git commit -m "feat(lexical): ショートカットヘルプモーダル（Ctrl+/?ボタン）を追加"
```

---

## 最終検証

**全タスク完了後に実行:**

```bash
bun run validate && bun run build
```

Expected: 型エラー・lint エラー・ビルドエラーなし

**動作確認チェックリスト:**

- [x] Phase 1-A: ImageNode でキャプション入力 → エディタ上に表示されること
- [x] Phase 1-B: `<ruby>京<rt>きょう</rt>都<rt>と</rt></ruby>` を HTML インポート → 正しく変換されること
- [x] Phase 1-C: コードブロック選択 → Inspector に言語セレクタが表示・変更できること
- [x] Phase 2-A: 「音声プレイヤー」から AudioNode を挿入 → audio タグが表示されること
- [x] Phase 2-B: 「ファイル添付」から FileNode を挿入 → ファイル名・サイズが表示されること
- [x] Phase 2-C: Figma URL を入力 → embed iframe が表示されること
- [x] Phase 2-D: Spotify URL を入力 → Spotify 埋め込みが表示されること
- [x] Phase 2-E: ギャラリー挿入 → 列数指定 → Inspector から画像追加できること
- [x] Phase 2-F: タイムライン挿入 → year・label を Inspector から編集できること
- [x] Phase 2-G: 料金表挿入 → プラン名・価格を Inspector から編集できること
- [x] Phase 3-A: Markdown インポート → 確認ダイアログ後にコンテンツ変換されること
- [x] Phase 3-B: HTML コピー → クリップボードに HTML が入ること
- [x] Phase 3-C: プリントプレビュー → A4 レイアウトで表示 → 印刷できること
- [x] Phase 4-A: リンク上でホバー → URL プレビュー Popover が表示されること
- [x] Phase 4-B: ブロック横の ↑↓ ボタン → ブロックが移動すること
- [x] Phase 4-C: `Ctrl+/` または `?` ボタン → ショートカット一覧が表示されること

---

## 参考: ファイル構造（実装後）

```
NODES/
├── AudioNode.tsx         (新規)
├── FileNode.tsx          (新規)
├── FigmaNode.tsx         (新規)
├── SpotifyNode.tsx       (新規)
├── GalleryNode.tsx       (新規: Container + Item)
├── TimelineNode.tsx      (新規: Container + Item)
├── PricingTableNode.tsx  (新規: Container + Plan + Feature)
└── index.ts              (更新)

PLUGINS/
├── AudioPlugin.tsx       (新規)
├── FilePlugin.tsx        (新規)
├── FigmaPlugin.tsx       (新規)
├── SpotifyPlugin.tsx     (新規)
├── GalleryPlugin.tsx     (新規)
├── TimelinePlugin.tsx    (新規)
├── PricingTablePlugin.tsx (新規)
└── index.ts              (更新)

PANELS/
├── AudioInspectorPanel.tsx         (新規)
├── FileInspectorPanel.tsx          (新規)
├── FigmaInspectorPanel.tsx         (新規)
├── SpotifyInspectorPanel.tsx       (新規)
├── CodeInspectorPanel.tsx          (新規)
├── GalleryContainerInspectorPanel.tsx (新規)
├── GalleryItemInspectorPanel.tsx   (新規)
├── TimelineContainerInspectorPanel.tsx (新規)
├── TimelineItemInspectorPanel.tsx  (新規)
├── PricingPlanInspectorPanel.tsx   (新規)
└── index.ts                        (更新)

CONFIG/
├── dialog-registry.ts  (更新: audio, file, figma, spotify, gallery, timeline, pricing)
├── insert-items.ts     (更新: 7 items 追加)
├── inspector-registry.ts (更新: 10 ノード追加)
└── nodes.ts            (更新: 10 ノードクラス追加)

INSPECTOR/
├── hooks/inspectable-nodes.ts  (更新)
└── InspectorSidebar.tsx        (更新)
```
