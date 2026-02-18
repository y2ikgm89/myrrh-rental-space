/**
 * PullQuote Plugin
 *
 * @description プルクォート（強調引用）の挿入を提供するプラグイン
 *
 * ダイアログでスタイルを選択し、PullQuote構造を挿入
 */

'use client'

import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  mergeRegister,
} from 'lexical'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import {
  $createPullQuoteNode,
  $isPullQuoteNode,
  isPullQuoteStyle,
  PullQuoteNode,
  type PullQuoteStyle,
  PULL_QUOTE_STYLES,
} from '../nodes/PullQuoteNode'
import { $createPullQuoteTextNode, PullQuoteTextNode } from '../nodes/PullQuoteTextNode'
import { $createPullQuoteCitationNode, PullQuoteCitationNode } from '../nodes/PullQuoteCitationNode'
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
import { PULL_QUOTE_STYLE_LABELS } from '../config/node-labels'

// =============================================================================
// Utilities
// =============================================================================

/**
 * 矢印キーでPullQuote境界を脱出
 */
function $onEscape(
  direction: 'up' | 'down'
): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }

  const node = selection.anchor.getNode()
  let pullQuoteNode: PullQuoteNode | null = null
  let current = node.getParent()

  while (current) {
    if ($isPullQuoteNode(current)) {
      pullQuoteNode = current
      break
    }
    current = current.getParent()
  }

  if (!pullQuoteNode) return false

  const isAtStart = selection.anchor.offset === 0
  const isAtEnd =
    selection.anchor.offset === selection.anchor.getNode().getTextContentSize()

  if ((direction === 'up' && isAtStart) || (direction === 'down' && isAtEnd)) {
    const paragraph = $createParagraphNode()
    if (direction === 'up') {
      pullQuoteNode.insertBefore(paragraph)
    } else {
      pullQuoteNode.insertAfter(paragraph)
    }
    paragraph.select()
    return true
  }

  return false
}

// =============================================================================
// Types
// =============================================================================

type PullQuotePluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Component
// =============================================================================

export function PullQuotePlugin({ isOpen, onClose }: PullQuotePluginProps) {
  const [editor] = useLexicalComposerContext()
  const [selectedStyle, setSelectedStyle] = useState<PullQuoteStyle>('classic')

  // リスナー登録（mergeRegisterで統一）
  useEffect(() => {
    return mergeRegister(
      // 矢印キーリスナー
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => $onEscape('up'),
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => $onEscape('down'),
        COMMAND_PRIORITY_LOW
      ),
      // 構造検証トランスフォーマー: PullQuote
      editor.registerNodeTransform(PullQuoteNode, (node) => {
        const children = node.getChildren()
        const hasTextNode = children.some((child) => child instanceof PullQuoteTextNode)
        const hasCitationNode = children.some((child) => child instanceof PullQuoteCitationNode)

        // 必要な子ノードがない場合は追加
        if (!hasTextNode) {
          const textNode = $createPullQuoteTextNode()
          const paragraph = $createParagraphNode()
          textNode.append(paragraph)
          node.append(textNode)
        }
        if (!hasCitationNode) {
          const citationNode = $createPullQuoteCitationNode()
          const paragraph = $createParagraphNode()
          citationNode.append(paragraph)
          node.append(citationNode)
        }
      }),
      // PullQuoteTextNodeの構造検証
      editor.registerNodeTransform(PullQuoteTextNode, (node) => {
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode()
          node.append(paragraph)
        }
      }),
      // PullQuoteCitationNodeの構造検証
      editor.registerNodeTransform(PullQuoteCitationNode, (node) => {
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode()
          node.append(paragraph)
        }
      })
    )
  }, [editor])

  const resetForm = () => {
    setSelectedStyle('classic')
  }

  const handleInsert = () => {
    editor.update(() => {
      // PullQuote構造を作成
      const pullQuote = $createPullQuoteNode(selectedStyle)
      const textNode = $createPullQuoteTextNode()
      const textParagraph = $createParagraphNode()
      textNode.append(textParagraph)

      const citationNode = $createPullQuoteCitationNode()
      const citationParagraph = $createParagraphNode()
      citationNode.append(citationParagraph)

      pullQuote.append(textNode)
      pullQuote.append(citationNode)

      $insertNodeToNearestRoot(pullQuote)

      // テキスト部分を選択
      textParagraph.selectEnd()
    })

    resetForm()
    onClose()
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>プルクォートを挿入</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <Label className="text-sm font-medium mb-3 block">
            スタイルを選択
          </Label>
          <Select value={selectedStyle} onValueChange={(value) => { if (isPullQuoteStyle(value)) setSelectedStyle(value) }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PULL_QUOTE_STYLES.map((style) => (
                <SelectItem key={style} value={style}>
                  {PULL_QUOTE_STYLE_LABELS[style]}
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
