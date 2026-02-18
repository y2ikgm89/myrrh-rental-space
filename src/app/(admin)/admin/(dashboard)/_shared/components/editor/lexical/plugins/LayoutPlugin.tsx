/**
 * Layout Plugin
 *
 * @description カラムレイアウトの挿入・更新を提供するプラグイン
 *
 * 公式Playgroundパターンに準拠
 * - INSERT_LAYOUT_COMMAND: 新規レイアウト挿入
 * - UPDATE_LAYOUT_COMMAND: 既存レイアウトの列数変更
 * - 矢印キーでのコンテナ境界脱出
 * - 構造検証トランスフォーマー
 */

'use client'

import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $setState,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  createCommand,
  mergeRegister,
  type LexicalCommand,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import {
  $createLayoutContainerNode,
  $isLayoutContainerNode,
  LayoutContainerNode,
  templateColumnsState,
} from '../nodes/LayoutContainerNode'
import {
  $createLayoutItemNode,
  $isLayoutItemNode,
  LayoutItemNode,
} from '../nodes/LayoutItemNode'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Label,
} from '@/admin/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui/select'

// =============================================================================
// Commands
// =============================================================================

export type InsertLayoutPayload = {
  templateColumns: string
}

export type UpdateLayoutPayload = {
  nodeKey: NodeKey
  templateColumns: string
}

export const INSERT_LAYOUT_COMMAND: LexicalCommand<InsertLayoutPayload> =
  createCommand('INSERT_LAYOUT_COMMAND')

export const UPDATE_LAYOUT_COMMAND: LexicalCommand<UpdateLayoutPayload> =
  createCommand('UPDATE_LAYOUT_COMMAND')

// =============================================================================
// Layout Templates
// =============================================================================

const LAYOUT_TEMPLATES = [
  { value: '1fr 1fr', label: '2カラム（均等）', columns: 2, description: '50% / 50%' },
  { value: '1fr 1fr 1fr', label: '3カラム（均等）', columns: 3, description: '33% / 33% / 33%' },
  { value: '2fr 1fr', label: '2カラム（2:1）', columns: 2, description: '66% / 33%' },
  { value: '1fr 2fr', label: '2カラム（1:2）', columns: 2, description: '33% / 66%' },
  { value: '1fr 1fr 1fr 1fr', label: '4カラム（均等）', columns: 4, description: '25% / 25% / 25% / 25%' },
] as const


// =============================================================================
// Utilities
// =============================================================================

/**
 * テンプレート文字列からカラム数を計算
 */
function getColumnsFromTemplate(template: string): number {
  return template.split(/\s+/).filter(Boolean).length
}

/**
 * 矢印キーでコンテナ境界を脱出
 */
function $onEscape(
  editor: LexicalEditor,
  direction: 'up' | 'down' | 'left' | 'right'
): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }

  const node = selection.anchor.getNode()
  const parent = node.getParent()

  // LayoutItem内かチェック
  let layoutItem: LayoutItemNode | null = null
  let current = parent
  while (current) {
    if ($isLayoutItemNode(current)) {
      layoutItem = current
      break
    }
    current = current.getParent()
  }

  if (!layoutItem) return false

  const container = layoutItem.getParent()
  if (!$isLayoutContainerNode(container)) return false

  const siblings = container.getChildren()
  const itemIndex = siblings.indexOf(layoutItem)

  // 上下キー: コンテナの前後に段落挿入
  if (direction === 'up' || direction === 'down') {
    const isFirst = itemIndex === 0
    const isAtStart = selection.anchor.offset === 0
    const isAtEnd =
      selection.anchor.offset === selection.anchor.getNode().getTextContentSize()

    if ((direction === 'up' && isFirst && isAtStart) ||
        (direction === 'down' && isAtEnd)) {
      const paragraph = $createParagraphNode()
      if (direction === 'up') {
        container.insertBefore(paragraph)
      } else {
        container.insertAfter(paragraph)
      }
      paragraph.select()
      return true
    }
  }

  return false
}

// =============================================================================
// Types
// =============================================================================

type LayoutPluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Component
// =============================================================================

export function LayoutPlugin({ isOpen, onClose }: LayoutPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [selectedTemplate, setSelectedTemplate] = useState('1fr 1fr')

  // コマンドリスナー登録
  useEffect(() => {
    return mergeRegister(
      // INSERT_LAYOUT_COMMAND
      editor.registerCommand(
        INSERT_LAYOUT_COMMAND,
        (payload) => {
          editor.update(() => {
            const container = $createLayoutContainerNode(payload.templateColumns)
            const columns = getColumnsFromTemplate(payload.templateColumns)

            // カラム数分のLayoutItemを作成
            for (let i = 0; i < columns; i++) {
              const item = $createLayoutItemNode()
              const paragraph = $createParagraphNode()
              item.append(paragraph)
              container.append(item)
            }

            $insertNodeToNearestRoot(container)

            // 最初のカラムの段落を選択
            const firstItem = container.getFirstChild()
            if ($isLayoutItemNode(firstItem)) {
              const firstParagraph = firstItem.getFirstChild()
              if (firstParagraph && $isElementNode(firstParagraph)) {
                firstParagraph.selectEnd()
              }
            }
          })
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),

      // UPDATE_LAYOUT_COMMAND
      editor.registerCommand(
        UPDATE_LAYOUT_COMMAND,
        (payload) => {
          editor.update(() => {
            const node = $getNodeByKey(payload.nodeKey)
            if (!$isLayoutContainerNode(node)) return false

            const currentColumns = node.getChildren().length
            const newColumns = getColumnsFromTemplate(payload.templateColumns)

            $setState(node, templateColumnsState, payload.templateColumns)

            if (newColumns > currentColumns) {
              // カラム追加
              for (let i = currentColumns; i < newColumns; i++) {
                const item = $createLayoutItemNode()
                const paragraph = $createParagraphNode()
                item.append(paragraph)
                node.append(item)
              }
            } else if (newColumns < currentColumns) {
              // カラム削除（末尾から）
              const children = node.getChildren()
              for (let i = currentColumns - 1; i >= newColumns; i--) {
                children[i]?.remove()
              }
            }
          })
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),

      // 矢印キーリスナー
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => $onEscape(editor, 'up'),
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => $onEscape(editor, 'down'),
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        () => $onEscape(editor, 'left'),
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        () => $onEscape(editor, 'right'),
        COMMAND_PRIORITY_LOW
      ),

      // 構造検証トランスフォーマー: LayoutItem
      editor.registerNodeTransform(
        LayoutItemNode,
        (node) => {
          const parent = node.getParent()
          // 親がLayoutContainerでない場合、アンラップ
          if (!$isLayoutContainerNode(parent)) {
            const children = node.getChildren()
            for (const child of children) {
              node.insertBefore(child)
            }
            node.remove()
            return
          }

          // 空のLayoutItemに段落を追加
          if (node.getChildren().length === 0) {
            const paragraph = $createParagraphNode()
            node.append(paragraph)
          }
        }
      ),

      // 構造検証トランスフォーマー: LayoutContainer
      editor.registerNodeTransform(
        LayoutContainerNode,
        (node) => {
          const children = node.getChildren()

          // 非LayoutItem子要素をアンラップ
          for (const child of children) {
            if (!$isLayoutItemNode(child)) {
              // 最初のLayoutItemに移動するか、新しいItemを作成
              const firstItem = children.find($isLayoutItemNode)
              if (firstItem && $isLayoutItemNode(firstItem)) {
                firstItem.append(child)
              } else {
                const item = $createLayoutItemNode()
                item.append(child)
                node.append(item)
              }
            }
          }
        }
      ),
    )
  }, [editor])

  const handleInsert = () => {
    editor.dispatchCommand(INSERT_LAYOUT_COMMAND, {
      templateColumns: selectedTemplate,
    })
    setSelectedTemplate('1fr 1fr')
    onClose()
  }

  const handleClose = () => {
    setSelectedTemplate('1fr 1fr')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>カラムレイアウトを挿入</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <Label className="text-sm font-medium mb-3 block">
            レイアウトを選択
          </Label>
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_TEMPLATES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleInsert}>
            挿入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
