# Lexical サイドバーインスペクター実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** LexicalエディタにWordPress Gutenberg方式の右サイドバーを追加し、選択中ノードのプロパティをリアルタイム編集可能にする

**Architecture:**
- `NodeInspectorPlugin`: 選択中ノードを検出し、対応するパネルを表示
- `InspectorSidebar`: サイドバーUI（折りたたみ可能なセクション構造）
- `*InspectorPanel`: 各ノードタイプ専用の編集パネル（ButtonInspectorPanel等）
- `useLexicalNodeSelection`フック（公式）でノード選択状態を管理

**Tech Stack:** Lexical 0.39, React 19, Tailwind CSS 4, shadcn/ui

---

## 実装方針

### 対象ノード（Phase 1）
| ノード | プロパティ数 | 優先度 |
|--------|-------------|--------|
| ButtonNode | 6 | 高 |
| ImageNode | 4 | 高 |
| CalloutNode | 1 | 中 |
| BookmarkNode | 6 | 中 |

### ディレクトリ構造
```
lexical/
├── LexicalEditor.tsx          # サイドバー統合
├── plugins/
│   ├── NodeInspectorPlugin.tsx # 選択検出・パネル切替
│   └── index.ts               # エクスポート追加
└── inspector/
    ├── InspectorSidebar.tsx   # サイドバーコンテナ
    ├── InspectorSection.tsx   # 折りたたみセクション
    ├── panels/
    │   ├── ButtonInspectorPanel.tsx
    │   ├── ImageInspectorPanel.tsx
    │   ├── CalloutInspectorPanel.tsx
    │   ├── BookmarkInspectorPanel.tsx
    │   └── index.ts
    ├── hooks/
    │   └── use-selected-node.ts
    └── index.ts
```

---

## Task 1: 選択ノード検出フック作成

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/hooks/use-selected-node.ts`

**Step 1: フック実装**

```typescript
/**
 * 選択中ノード検出フック
 *
 * @description SELECTION_CHANGE_COMMANDを監視し、選択中のDecoratorNode/ElementNodeを返す
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $getNodeByKey,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
  type LexicalNode,
  type NodeKey,
} from 'lexical'
import { mergeRegister } from '@lexical/utils'

import { $isButtonNode, type ButtonNode } from '../../nodes/ButtonNode'
import { $isImageNode, type ImageNode } from '../../nodes/ImageNode'
import { $isCalloutNode, type CalloutNode } from '../../nodes/CalloutNode'
import { $isBookmarkNode, type BookmarkNode } from '../../nodes/BookmarkNode'

// =============================================================================
// Types
// =============================================================================

export type InspectableNode = ButtonNode | ImageNode | CalloutNode | BookmarkNode

export type InspectableNodeType = 'button' | 'image' | 'callout' | 'bookmark'

export type SelectedNodeInfo = {
  node: InspectableNode
  nodeKey: NodeKey
  nodeType: InspectableNodeType
} | null

// =============================================================================
// Type Guards
// =============================================================================

function getInspectableNodeType(node: LexicalNode): InspectableNodeType | null {
  if ($isButtonNode(node)) return 'button'
  if ($isImageNode(node)) return 'image'
  if ($isCalloutNode(node)) return 'callout'
  if ($isBookmarkNode(node)) return 'bookmark'
  return null
}

function isInspectableNode(node: LexicalNode): node is InspectableNode {
  return getInspectableNodeType(node) !== null
}

// =============================================================================
// Hook
// =============================================================================

export function useSelectedNode(): SelectedNodeInfo {
  const [editor] = useLexicalComposerContext()
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo>(null)

  const updateSelectedNode = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()

      // NodeSelection: DecoratorNode（Button, Image等）が選択された場合
      if ($isNodeSelection(selection)) {
        const nodes = selection.getNodes()
        if (nodes.length === 1) {
          const node = nodes[0]
          const nodeType = getInspectableNodeType(node)
          if (nodeType && isInspectableNode(node)) {
            setSelectedNode({
              node,
              nodeKey: node.getKey(),
              nodeType,
            })
            return
          }
        }
      }

      // RangeSelection: ElementNode（Callout等）内にカーソルがある場合
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode()
        // 親をたどってInspectableNodeを探す
        let current: LexicalNode | null = anchorNode
        while (current !== null) {
          const nodeType = getInspectableNodeType(current)
          if (nodeType && isInspectableNode(current)) {
            setSelectedNode({
              node: current,
              nodeKey: current.getKey(),
              nodeType,
            })
            return
          }
          current = current.getParent()
        }
      }

      // 該当なし
      setSelectedNode(null)
    })
  }, [editor])

  useEffect(() => {
    // 初回実行
    updateSelectedNode()

    // リスナー登録
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateSelectedNode()
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerUpdateListener(() => {
        updateSelectedNode()
      })
    )
  }, [editor, updateSelectedNode])

  return selectedNode
}
```

**Step 2: 型チェック実行**

Run: `bun run type-check`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/hooks/use-selected-node.ts
git commit -m "feat(lexical): add useSelectedNode hook for inspector"
```

---

## Task 2: インスペクターセクションコンポーネント

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/InspectorSection.tsx`

**Step 1: コンポーネント実装**

```typescript
/**
 * Inspector Section
 *
 * @description 折りたたみ可能なセクション（Gutenberg PanelBody相当）
 */

'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

type InspectorSectionProps = {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export function InspectorSection({
  title,
  defaultOpen = true,
  children,
}: InspectorSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <span>{title}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      {isOpen && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  )
}
```

**Step 2: 型チェック実行**

Run: `bun run type-check`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/InspectorSection.tsx
git commit -m "feat(lexical): add InspectorSection component"
```

---

## Task 3: ButtonInspectorPanel

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/ButtonInspectorPanel.tsx`

**Step 1: パネル実装**

```typescript
/**
 * Button Inspector Panel
 *
 * @description ButtonNodeのプロパティ編集パネル
 */

'use client'

import { useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import {
  $isButtonNode,
  type ButtonNode,
  type ButtonVariant,
  type ButtonSize,
  type ButtonAlignment,
  isButtonVariant,
  isButtonSize,
  isButtonAlignment,
} from '../../nodes/ButtonNode'
import { InspectorSection } from '../InspectorSection'
import { Input, Label, SelectionBox, Switch } from '@/admin/components/ui'

// =============================================================================
// Options
// =============================================================================

const VARIANT_OPTIONS = [
  { value: 'primary', label: 'プライマリ' },
  { value: 'secondary', label: 'セカンダリ' },
  { value: 'outline', label: 'アウトライン' },
]

const SIZE_OPTIONS = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
]

const ALIGNMENT_OPTIONS = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中央' },
  { value: 'right', label: '右' },
]

// =============================================================================
// Types
// =============================================================================

type ButtonInspectorPanelProps = {
  nodeKey: string
  node: ButtonNode
}

// =============================================================================
// Component
// =============================================================================

export function ButtonInspectorPanel({ nodeKey, node }: ButtonInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()

  // 現在の値を取得
  const text = node.getText()
  const href = node.getHref()
  const variant = node.getVariant()
  const size = node.getSize()
  const alignment = node.getAlignment()
  const openInNewTab = node.getOpenInNewTab()

  // 更新ヘルパー
  const updateNode = useCallback(
    (updater: (node: ButtonNode) => void) => {
      editor.update(() => {
        const targetNode = $getNodeByKey(nodeKey)
        if ($isButtonNode(targetNode)) {
          updater(targetNode)
        }
      })
    },
    [editor, nodeKey]
  )

  const handleTextChange = useCallback(
    (value: string) => updateNode((n) => n.setText(value)),
    [updateNode]
  )

  const handleHrefChange = useCallback(
    (value: string) => updateNode((n) => n.setHref(value)),
    [updateNode]
  )

  const handleVariantChange = useCallback(
    (value: string) => {
      if (isButtonVariant(value)) {
        updateNode((n) => n.setVariant(value))
      }
    },
    [updateNode]
  )

  const handleSizeChange = useCallback(
    (value: string) => {
      if (isButtonSize(value)) {
        updateNode((n) => n.setSize(value))
      }
    },
    [updateNode]
  )

  const handleAlignmentChange = useCallback(
    (value: string) => {
      if (isButtonAlignment(value)) {
        updateNode((n) => n.setAlignment(value))
      }
    },
    [updateNode]
  )

  const handleOpenInNewTabChange = useCallback(
    (value: boolean) => updateNode((n) => n.setOpenInNewTab(value)),
    [updateNode]
  )

  return (
    <div>
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">ボタン</h3>
      </div>

      <InspectorSection title="基本設定">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="inspector-button-text" className="text-xs">
              テキスト
            </Label>
            <Input
              id="inspector-button-text"
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspector-button-href" className="text-xs">
              リンク先URL
            </Label>
            <Input
              id="inspector-button-href"
              value={href}
              onChange={(e) => handleHrefChange(e.target.value)}
              placeholder="https://example.com"
              className="h-8 text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="inspector-button-new-tab" className="text-xs cursor-pointer">
              新しいタブで開く
            </Label>
            <Switch
              id="inspector-button-new-tab"
              checked={openInNewTab}
              onCheckedChange={handleOpenInNewTabChange}
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="スタイル">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">スタイル</Label>
            <SelectionBox
              options={VARIANT_OPTIONS}
              value={variant}
              onChange={handleVariantChange}
              columns={3}
              name="ボタンスタイル"
              size="sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">サイズ</Label>
            <SelectionBox
              options={SIZE_OPTIONS}
              value={size}
              onChange={handleSizeChange}
              columns={3}
              name="ボタンサイズ"
              size="sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">配置</Label>
            <SelectionBox
              options={ALIGNMENT_OPTIONS}
              value={alignment}
              onChange={handleAlignmentChange}
              columns={3}
              name="ボタン配置"
              size="sm"
            />
          </div>
        </div>
      </InspectorSection>
    </div>
  )
}
```

**Step 2: 型チェック実行**

Run: `bun run type-check`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/panels/ButtonInspectorPanel.tsx
git commit -m "feat(lexical): add ButtonInspectorPanel"
```

---

## Task 4: ImageInspectorPanel

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/ImageInspectorPanel.tsx`

**Step 1: パネル実装**

```typescript
/**
 * Image Inspector Panel
 *
 * @description ImageNodeのプロパティ編集パネル
 */

'use client'

import { useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import { $isImageNode, type ImageNode } from '../../nodes/ImageNode'
import { InspectorSection } from '../InspectorSection'
import { Input, Label } from '@/admin/components/ui'

// =============================================================================
// Types
// =============================================================================

type ImageInspectorPanelProps = {
  nodeKey: string
  node: ImageNode
}

// =============================================================================
// Component
// =============================================================================

export function ImageInspectorPanel({ nodeKey, node }: ImageInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()

  // ImageNodeにはgetterがないため、プライベートプロパティから直接取得
  // Note: Lexical公式パターンに従い、getLatest()経由でアクセス
  const latestNode = node.getLatest()
  const src = latestNode.__src
  const alt = latestNode.__alt
  const width = latestNode.__width
  const height = latestNode.__height

  // 更新ヘルパー
  const updateNode = useCallback(
    (updater: (node: ImageNode) => void) => {
      editor.update(() => {
        const targetNode = $getNodeByKey(nodeKey)
        if ($isImageNode(targetNode)) {
          updater(targetNode)
        }
      })
    },
    [editor, nodeKey]
  )

  const handleAltChange = useCallback(
    (value: string) => {
      updateNode((n) => {
        const writable = n.getWritable()
        writable.__alt = value
      })
    },
    [updateNode]
  )

  const handleWidthChange = useCallback(
    (value: string) => {
      const numValue = value ? parseInt(value, 10) : undefined
      updateNode((n) => {
        const writable = n.getWritable()
        writable.__width = numValue
      })
    },
    [updateNode]
  )

  const handleHeightChange = useCallback(
    (value: string) => {
      const numValue = value ? parseInt(value, 10) : undefined
      updateNode((n) => {
        const writable = n.getWritable()
        writable.__height = numValue
      })
    },
    [updateNode]
  )

  return (
    <div>
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">画像</h3>
      </div>

      <InspectorSection title="基本設定">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <p className="text-xs text-muted-foreground truncate">{src}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspector-image-alt" className="text-xs">
              代替テキスト（ALT）
            </Label>
            <Input
              id="inspector-image-alt"
              value={alt}
              onChange={(e) => handleAltChange(e.target.value)}
              placeholder="画像の説明"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="サイズ" defaultOpen={false}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inspector-image-width" className="text-xs">
                幅（px）
              </Label>
              <Input
                id="inspector-image-width"
                type="number"
                value={width ?? ''}
                onChange={(e) => handleWidthChange(e.target.value)}
                placeholder="自動"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inspector-image-height" className="text-xs">
                高さ（px）
              </Label>
              <Input
                id="inspector-image-height"
                type="number"
                value={height ?? ''}
                onChange={(e) => handleHeightChange(e.target.value)}
                placeholder="自動"
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>
      </InspectorSection>
    </div>
  )
}
```

**Step 2: ImageNodeにgetter/setter追加**

Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/ImageNode.tsx`

ImageNodeに以下のメソッドを追加（`decorate()`の後、ファクトリ関数の前）:

```typescript
  // Getters
  getSrc(): string {
    return this.getLatest().__src
  }

  getAlt(): string {
    return this.getLatest().__alt
  }

  getWidth(): number | undefined {
    return this.getLatest().__width
  }

  getHeight(): number | undefined {
    return this.getLatest().__height
  }

  // Setters
  setAlt(alt: string): void {
    const self = this.getWritable()
    self.__alt = alt
  }

  setWidth(width: number | undefined): void {
    const self = this.getWritable()
    self.__width = width
  }

  setHeight(height: number | undefined): void {
    const self = this.getWritable()
    self.__height = height
  }
```

**Step 3: ImageInspectorPanelを更新（getter使用）**

```typescript
  const src = node.getSrc()
  const alt = node.getAlt()
  const width = node.getWidth()
  const height = node.getHeight()

  const handleAltChange = useCallback(
    (value: string) => updateNode((n) => n.setAlt(value)),
    [updateNode]
  )

  const handleWidthChange = useCallback(
    (value: string) => {
      const numValue = value ? parseInt(value, 10) : undefined
      updateNode((n) => n.setWidth(numValue))
    },
    [updateNode]
  )

  const handleHeightChange = useCallback(
    (value: string) => {
      const numValue = value ? parseInt(value, 10) : undefined
      updateNode((n) => n.setHeight(numValue))
    },
    [updateNode]
  )
```

**Step 4: 型チェック実行**

Run: `bun run type-check`
Expected: エラーなし

**Step 5: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/nodes/ImageNode.tsx
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/panels/ImageInspectorPanel.tsx
git commit -m "feat(lexical): add ImageInspectorPanel with getter/setter"
```

---

## Task 5: CalloutInspectorPanel

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/CalloutInspectorPanel.tsx`

**Step 1: パネル実装**

```typescript
/**
 * Callout Inspector Panel
 *
 * @description CalloutNodeのプロパティ編集パネル
 */

'use client'

import { useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import {
  $isCalloutNode,
  type CalloutNode,
  type CalloutType,
  CALLOUT_TYPES,
} from '../../nodes/CalloutNode'
import { InspectorSection } from '../InspectorSection'
import { Label, SelectionBox } from '@/admin/components/ui'
import { Info, AlertTriangle, XCircle, CheckCircle } from 'lucide-react'

// =============================================================================
// Options
// =============================================================================

const CALLOUT_OPTIONS = [
  { value: 'info', label: '情報', icon: Info },
  { value: 'warning', label: '注意', icon: AlertTriangle },
  { value: 'error', label: 'エラー', icon: XCircle },
  { value: 'success', label: '成功', icon: CheckCircle },
]

// =============================================================================
// Type Guard
// =============================================================================

function isCalloutType(value: string): value is CalloutType {
  return CALLOUT_TYPES.includes(value as CalloutType)
}

// =============================================================================
// Types
// =============================================================================

type CalloutInspectorPanelProps = {
  nodeKey: string
  node: CalloutNode
}

// =============================================================================
// Component
// =============================================================================

export function CalloutInspectorPanel({ nodeKey, node }: CalloutInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()

  const calloutType = node.getCalloutType()

  const handleTypeChange = useCallback(
    (value: string) => {
      if (!isCalloutType(value)) return

      editor.update(() => {
        const targetNode = $getNodeByKey(nodeKey)
        if ($isCalloutNode(targetNode)) {
          targetNode.setCalloutType(value)
        }
      })
    },
    [editor, nodeKey]
  )

  return (
    <div>
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">コールアウト</h3>
      </div>

      <InspectorSection title="スタイル">
        <div className="space-y-1.5">
          <Label className="text-xs">種類</Label>
          <SelectionBox
            options={CALLOUT_OPTIONS}
            value={calloutType}
            onChange={handleTypeChange}
            columns={2}
            name="コールアウト種類"
            size="sm"
          />
        </div>
      </InspectorSection>
    </div>
  )
}
```

**Step 2: 型チェック実行**

Run: `bun run type-check`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/panels/CalloutInspectorPanel.tsx
git commit -m "feat(lexical): add CalloutInspectorPanel"
```

---

## Task 6: BookmarkInspectorPanel

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/BookmarkInspectorPanel.tsx`

**Step 1: パネル実装**

```typescript
/**
 * Bookmark Inspector Panel
 *
 * @description BookmarkNodeのプロパティ編集パネル
 */

'use client'

import { useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import { $isBookmarkNode, type BookmarkNode } from '../../nodes/BookmarkNode'
import { InspectorSection } from '../InspectorSection'
import { Input, Label, Textarea } from '@/admin/components/ui'

// =============================================================================
// Types
// =============================================================================

type BookmarkInspectorPanelProps = {
  nodeKey: string
  node: BookmarkNode
}

// =============================================================================
// Component
// =============================================================================

export function BookmarkInspectorPanel({ nodeKey, node }: BookmarkInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()

  const url = node.getUrl()
  const title = node.getTitle()
  const description = node.getDescription()
  const siteName = node.getSiteName()

  const updateNode = useCallback(
    (updater: (node: BookmarkNode) => void) => {
      editor.update(() => {
        const targetNode = $getNodeByKey(nodeKey)
        if ($isBookmarkNode(targetNode)) {
          updater(targetNode)
        }
      })
    },
    [editor, nodeKey]
  )

  const handleTitleChange = useCallback(
    (value: string) => updateNode((n) => n.setTitle(value)),
    [updateNode]
  )

  const handleDescriptionChange = useCallback(
    (value: string) => updateNode((n) => n.setDescription(value)),
    [updateNode]
  )

  const handleSiteNameChange = useCallback(
    (value: string) => updateNode((n) => n.setSiteName(value)),
    [updateNode]
  )

  return (
    <div>
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">ブックマーク</h3>
      </div>

      <InspectorSection title="基本設定">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <p className="text-xs text-muted-foreground break-all">{url}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspector-bookmark-title" className="text-xs">
              タイトル
            </Label>
            <Input
              id="inspector-bookmark-title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspector-bookmark-description" className="text-xs">
              説明
            </Label>
            <Textarea
              id="inspector-bookmark-description"
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              className="text-sm min-h-[60px] resize-none"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspector-bookmark-sitename" className="text-xs">
              サイト名
            </Label>
            <Input
              id="inspector-bookmark-sitename"
              value={siteName}
              onChange={(e) => handleSiteNameChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      </InspectorSection>
    </div>
  )
}
```

**Step 2: 型チェック実行**

Run: `bun run type-check`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/panels/BookmarkInspectorPanel.tsx
git commit -m "feat(lexical): add BookmarkInspectorPanel"
```

---

## Task 7: パネルインデックス作成

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/index.ts`

**Step 1: エクスポート**

```typescript
/**
 * Inspector Panels エクスポート
 */

export { ButtonInspectorPanel } from './ButtonInspectorPanel'
export { ImageInspectorPanel } from './ImageInspectorPanel'
export { CalloutInspectorPanel } from './CalloutInspectorPanel'
export { BookmarkInspectorPanel } from './BookmarkInspectorPanel'
```

**Step 2: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/panels/index.ts
git commit -m "feat(lexical): add inspector panels index"
```

---

## Task 8: InspectorSidebar

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/InspectorSidebar.tsx`

**Step 1: サイドバー実装**

```typescript
/**
 * Inspector Sidebar
 *
 * @description 選択中ノードのプロパティ編集サイドバー
 */

'use client'

import { useSelectedNode, type SelectedNodeInfo } from './hooks/use-selected-node'
import {
  ButtonInspectorPanel,
  ImageInspectorPanel,
  CalloutInspectorPanel,
  BookmarkInspectorPanel,
} from './panels'
import type { ButtonNode } from '../nodes/ButtonNode'
import type { ImageNode } from '../nodes/ImageNode'
import type { CalloutNode } from '../nodes/CalloutNode'
import type { BookmarkNode } from '../nodes/BookmarkNode'
import { Settings2 } from 'lucide-react'

// =============================================================================
// Panel Renderer
// =============================================================================

function renderPanel(info: SelectedNodeInfo) {
  if (!info) return null

  const { node, nodeKey, nodeType } = info

  switch (nodeType) {
    case 'button':
      return <ButtonInspectorPanel nodeKey={nodeKey} node={node as ButtonNode} />
    case 'image':
      return <ImageInspectorPanel nodeKey={nodeKey} node={node as ImageNode} />
    case 'callout':
      return <CalloutInspectorPanel nodeKey={nodeKey} node={node as CalloutNode} />
    case 'bookmark':
      return <BookmarkInspectorPanel nodeKey={nodeKey} node={node as BookmarkNode} />
    default:
      return null
  }
}

// =============================================================================
// Component
// =============================================================================

export function InspectorSidebar() {
  const selectedNode = useSelectedNode()

  return (
    <div className="w-64 border-l border-border bg-background flex flex-col h-full">
      {selectedNode ? (
        <div className="flex-1 overflow-y-auto">{renderPanel(selectedNode)}</div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-4">
          <Settings2 className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm text-center">
            ブロックを選択すると
            <br />
            設定を編集できます
          </p>
        </div>
      )}
    </div>
  )
}
```

**Step 2: 型チェック実行**

Run: `bun run type-check`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/InspectorSidebar.tsx
git commit -m "feat(lexical): add InspectorSidebar component"
```

---

## Task 9: Inspectorインデックス作成

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/index.ts`

**Step 1: エクスポート**

```typescript
/**
 * Inspector エクスポート
 */

export { InspectorSidebar } from './InspectorSidebar'
export { InspectorSection } from './InspectorSection'
export { useSelectedNode } from './hooks/use-selected-node'
export type { SelectedNodeInfo, InspectableNode, InspectableNodeType } from './hooks/use-selected-node'

// Panels
export * from './panels'
```

**Step 2: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/index.ts
git commit -m "feat(lexical): add inspector index"
```

---

## Task 10: LexicalEditorにサイドバー統合

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/LexicalEditor.tsx`

**Step 1: インポート追加**

```typescript
import { InspectorSidebar } from './inspector'
```

**Step 2: LexicalEditorPropsに追加**

```typescript
export type LexicalEditorProps = {
  // ... 既存プロパティ
  /** インスペクターサイドバーを表示するかどうか */
  showInspector?: boolean
}
```

**Step 3: EditorInner修正**

propsに `showInspector = true` を追加し、レイアウトを変更:

```typescript
function EditorInner({
  // ... 既存props
  showInspector = true,
}: LexicalEditorProps) {
  // ... 既存コード

  return (
    <div className="flex h-full">
      {/* メインエディタ部分 */}
      <div
        className="flex flex-col flex-1 bg-background min-w-0"
        style={{ height }}
      >
        {/* ツールバー - 固定（スクロールしない）、フルワイド */}
        {showToolbar && (
          <div className="shrink-0">
            <ToolbarPlugin
              // ... 既存props
            />
          </div>
        )}

        {/* コンテンツラッパー - スクロール可能 */}
        <div ref={setContentWrapperRef} className="flex-1 overflow-y-auto">
          {/* 幅制御ラッパー */}
          <div
            ref={setContentWidthRef}
            className={cn('relative', contentWidthClassName)}
            style={contentWidthStyle}
          >
            <RichTextPlugin
              // ... 既存設定
            />
          </div>
        </div>

        {/* プラグイン群 - 変更なし */}
        {/* ... 既存プラグイン */}
      </div>

      {/* インスペクターサイドバー */}
      {showInspector && <InspectorSidebar />}
    </div>
  )
}
```

**Step 4: 型チェック実行**

Run: `bun run type-check`
Expected: エラーなし

**Step 5: ビルド確認**

Run: `bun run build`
Expected: ビルド成功

**Step 6: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/LexicalEditor.tsx
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/types.ts
git commit -m "feat(lexical): integrate InspectorSidebar into LexicalEditor"
```

---

## Task 11: 検証

**Step 1: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

**Step 2: Lint**

Run: `bun run lint`
Expected: エラーなし

**Step 3: ビルド**

Run: `bun run build`
Expected: ビルド成功

**Step 4: 動作確認**

1. 開発サーバー起動: `bun dev`
2. ニュース作成ページにアクセス: `/admin/news/new`
3. ボタンを挿入（/button）
4. ボタンをクリックして選択
5. 右サイドバーにプロパティパネルが表示されることを確認
6. テキスト、URL、スタイル等を変更し、リアルタイムで反映されることを確認

**Step 5: 最終コミット**

```bash
git add -A
git commit -m "feat(lexical): complete inspector sidebar implementation

- Add useSelectedNode hook for node selection detection
- Add InspectorSection collapsible component
- Add ButtonInspectorPanel with all properties
- Add ImageInspectorPanel with getter/setter methods
- Add CalloutInspectorPanel for type selection
- Add BookmarkInspectorPanel for OGP editing
- Integrate InspectorSidebar into LexicalEditor"
```

---

## 将来の拡張

### Phase 2 対象ノード
- YouTubeNode: videoId編集
- XNode: postId編集
- InstagramNode: postId編集
- LayoutContainerNode: カラム数変更

### Phase 3 機能追加
- サイドバー折りたたみ（レスポンシブ対応）
- ノード削除ボタン
- ノード複製ボタン
- ドラッグでの並び替え
