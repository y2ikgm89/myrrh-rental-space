/**
 * Callout Plugin
 *
 * @description コールアウト（注意書き）の挿入を提供するプラグイン
 *
 * ダイアログでタイプを選択し、Calloutノードを挿入
 */

'use client'

import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  createCommand,
  type LexicalCommand,
  type LexicalEditor,
} from 'lexical'
import {
  $createCalloutNode,
  $isCalloutNode,
  isCalloutType,
  CalloutNode,
  type CalloutType,
} from '../nodes/CalloutNode'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Label,
  SelectionBox,
} from '@/admin/components/ui'

// =============================================================================
// Commands
// =============================================================================

export type InsertCalloutPayload = {
  calloutType: CalloutType
}

export const INSERT_CALLOUT_COMMAND: LexicalCommand<InsertCalloutPayload> =
  createCommand('INSERT_CALLOUT_COMMAND')

// =============================================================================
// Callout Templates
// =============================================================================

const CALLOUT_OPTIONS = [
  { value: 'info', label: '情報', description: '補足説明や追加情報' },
  { value: 'warning', label: '警告', description: '注意が必要な内容' },
  { value: 'error', label: 'エラー', description: '重要な警告や危険な内容' },
  { value: 'success', label: '成功', description: '完了や成功の通知' },
]

// =============================================================================
// Utilities
// =============================================================================

/**
 * 矢印キーでCallout境界を脱出
 */
function $onEscape(
  editor: LexicalEditor,
  direction: 'up' | 'down'
): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }

  const node = selection.anchor.getNode()
  let calloutNode: CalloutNode | null = null
  let current = node.getParent()

  while (current) {
    if ($isCalloutNode(current)) {
      calloutNode = current
      break
    }
    current = current.getParent()
  }

  if (!calloutNode) return false

  const isAtStart = selection.anchor.offset === 0
  const isAtEnd =
    selection.anchor.offset === selection.anchor.getNode().getTextContentSize()

  if ((direction === 'up' && isAtStart) || (direction === 'down' && isAtEnd)) {
    const paragraph = $createParagraphNode()
    if (direction === 'up') {
      calloutNode.insertBefore(paragraph)
    } else {
      calloutNode.insertAfter(paragraph)
    }
    paragraph.select()
    return true
  }

  return false
}

// =============================================================================
// Hook
// =============================================================================

export function useCalloutDialog() {
  const [isCalloutDialogOpen, setIsCalloutDialogOpen] = useState(false)

  const openCalloutDialog = () => setIsCalloutDialogOpen(true)
  const closeCalloutDialog = () => setIsCalloutDialogOpen(false)

  return {
    isCalloutDialogOpen,
    openCalloutDialog,
    closeCalloutDialog,
  }
}

// =============================================================================
// Types
// =============================================================================

type CalloutPluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Component
// =============================================================================

export function CalloutPlugin({ isOpen, onClose }: CalloutPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [selectedType, setSelectedType] = useState<CalloutType>('info')

  // コマンドリスナー登録
  useEffect(() => {
    // INSERT_CALLOUT_COMMAND
    const insertUnregister = editor.registerCommand(
      INSERT_CALLOUT_COMMAND,
      (payload) => {
        editor.update(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return false

          const callout = $createCalloutNode(payload.calloutType)
          const paragraph = $createParagraphNode()
          callout.append(paragraph)

          selection.insertNodes([callout])

          // Callout内の段落を選択
          paragraph.selectEnd()
        })
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )

    // 矢印キーリスナー
    const arrowUpUnregister = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      () => $onEscape(editor, 'up'),
      COMMAND_PRIORITY_LOW
    )
    const arrowDownUnregister = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      () => $onEscape(editor, 'down'),
      COMMAND_PRIORITY_LOW
    )

    // 構造検証トランスフォーマー: Callout
    const calloutTransformUnregister = editor.registerNodeTransform(
      CalloutNode,
      (node) => {
        // 空のCalloutに段落を追加
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode()
          node.append(paragraph)
        }
      }
    )

    return () => {
      insertUnregister()
      arrowUpUnregister()
      arrowDownUnregister()
      calloutTransformUnregister()
    }
  }, [editor])

  const handleInsert = () => {
    editor.dispatchCommand(INSERT_CALLOUT_COMMAND, {
      calloutType: selectedType,
    })
    setSelectedType('info')
    onClose()
  }

  const handleClose = () => {
    setSelectedType('info')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>コールアウトを挿入</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <Label className="text-sm font-medium mb-3 block">
            種類を選択
          </Label>
          <SelectionBox
            options={CALLOUT_OPTIONS}
            value={selectedType}
            onChange={(value) => { if (isCalloutType(value)) setSelectedType(value) }}
            columns={2}
            name="コールアウト種類"
          />
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
