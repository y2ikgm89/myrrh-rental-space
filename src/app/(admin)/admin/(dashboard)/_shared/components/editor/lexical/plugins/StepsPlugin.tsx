/**
 * Steps Plugin
 *
 * @description ステップリストの挿入を提供するプラグイン
 *
 * ダイアログでステップ数とスタイルを選択し、Steps構造を挿入
 */

'use client'

import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  mergeRegister,
} from 'lexical'
import {
  $createStepsContainerNode,
  $isStepsContainerNode,
  isStepsStyle,
  StepsContainerNode,
  type StepsStyle,
} from '../nodes/StepsContainerNode'
import { $createStepItemNode, StepItemNode } from '../nodes/StepItemNode'
import { $createStepTitleNode, StepTitleNode, $isStepTitleNode } from '../nodes/StepTitleNode'
import { $createStepContentNode, StepContentNode } from '../nodes/StepContentNode'
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
// Options
// =============================================================================

const STYLE_OPTIONS = [
  { value: 'numbered', label: '番号', description: '数字で順序を示す' },
  { value: 'icon', label: 'アイコン', description: 'チェックアイコンで表示' },
  { value: 'timeline', label: 'タイムライン', description: '縦線で繋がったスタイル' },
]

const COUNT_OPTIONS = [
  { value: '2', label: '2', description: '2ステップ' },
  { value: '3', label: '3', description: '3ステップ' },
  { value: '4', label: '4', description: '4ステップ' },
  { value: '5', label: '5', description: '5ステップ' },
]

// =============================================================================
// Step Number Badge Component
// =============================================================================

function StepNumberBadge({
  stepNumber,
  style,
}: {
  stepNumber: number
  style: StepsStyle
}): ReactElement {
  if (style === 'icon') {
    return (
      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
    )
  }

  if (style === 'timeline') {
    return (
      <div className="w-4 h-4 rounded-full bg-primary border-2 border-background flex-shrink-0 -ml-6 mr-2" />
    )
  }

  // numbered (default)
  return (
    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 text-sm font-medium">
      {stepNumber}
    </div>
  )
}

// =============================================================================
// Hook
// =============================================================================

export function useStepsDialog() {
  const [isStepsDialogOpen, setIsStepsDialogOpen] = useState(false)

  const openStepsDialog = () => setIsStepsDialogOpen(true)
  const closeStepsDialog = () => setIsStepsDialogOpen(false)

  return {
    isStepsDialogOpen,
    openStepsDialog,
    closeStepsDialog,
  }
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * 矢印キーでSteps境界を脱出
 */
function $onEscape(direction: 'up' | 'down'): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }

  const node = selection.anchor.getNode()
  let stepsNode: StepsContainerNode | null = null
  let current = node.getParent()

  while (current) {
    if ($isStepsContainerNode(current)) {
      stepsNode = current
      break
    }
    current = current.getParent()
  }

  if (!stepsNode) return false

  const isAtStart = selection.anchor.offset === 0
  const isAtEnd =
    selection.anchor.offset === selection.anchor.getNode().getTextContentSize()

  if ((direction === 'up' && isAtStart) || (direction === 'down' && isAtEnd)) {
    const paragraph = $createParagraphNode()
    if (direction === 'up') {
      stepsNode.insertBefore(paragraph)
    } else {
      stepsNode.insertAfter(paragraph)
    }
    paragraph.select()
    return true
  }

  return false
}

// =============================================================================
// Types
// =============================================================================

type StepsPluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Component
// =============================================================================

export function StepsPlugin({ isOpen, onClose }: StepsPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [selectedStyle, setSelectedStyle] = useState<StepsStyle>('numbered')
  const [stepCount, setStepCount] = useState('3')

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
      // 構造検証トランスフォーマー: StepsContainer
      editor.registerNodeTransform(StepsContainerNode, (node) => {
        const children = node.getChildren()
        // StepItemNode以外の子は除去
        for (const child of children) {
          if (!(child instanceof StepItemNode)) {
            child.remove()
          }
        }
        // 少なくとも1つのStepItemが必要
        if (node.getChildren().length === 0) {
          const stepItem = $createStepItemNode(1)
          const titleNode = $createStepTitleNode()
          const titleParagraph = $createParagraphNode()
          titleNode.append(titleParagraph)

          const contentNode = $createStepContentNode()
          const contentParagraph = $createParagraphNode()
          contentNode.append(contentParagraph)

          stepItem.append(titleNode)
          stepItem.append(contentNode)
          node.append(stepItem)
        }
      }),
      // StepItemNodeの構造検証
      editor.registerNodeTransform(StepItemNode, (node) => {
        const children = node.getChildren()
        const hasTitle = children.some((child) => child instanceof StepTitleNode)
        const hasContent = children.some((child) => child instanceof StepContentNode)

        if (!hasTitle) {
          const titleNode = $createStepTitleNode()
          const paragraph = $createParagraphNode()
          titleNode.append(paragraph)
          node.append(titleNode)
        }
        if (!hasContent) {
          const contentNode = $createStepContentNode()
          const paragraph = $createParagraphNode()
          contentNode.append(paragraph)
          node.append(contentNode)
        }
      }),
      // StepTitleNodeの構造検証
      editor.registerNodeTransform(StepTitleNode, (node) => {
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode()
          node.append(paragraph)
        }
      }),
      // StepContentNodeの構造検証
      editor.registerNodeTransform(StepContentNode, (node) => {
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode()
          node.append(paragraph)
        }
      })
    )
  }, [editor])

  const resetForm = () => {
    setSelectedStyle('numbered')
    setStepCount('3')
  }

  const handleInsert = () => {
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return

      const count = parseInt(stepCount, 10)
      const stepsContainer = $createStepsContainerNode(selectedStyle)

      for (let i = 1; i <= count; i++) {
        const stepItem = $createStepItemNode(i)

        // タイトル
        const titleNode = $createStepTitleNode()
        const titleParagraph = $createParagraphNode()
        titleParagraph.append($createTextNode(`ステップ ${i}`))
        titleNode.append(titleParagraph)

        // コンテンツ
        const contentNode = $createStepContentNode()
        const contentParagraph = $createParagraphNode()
        contentParagraph.append($createTextNode('ステップの説明を入力してください'))
        contentNode.append(contentParagraph)

        stepItem.append(titleNode)
        stepItem.append(contentNode)
        stepsContainer.append(stepItem)
      }

      selection.insertNodes([stepsContainer])

      // 最初のステップのタイトルを選択
      const firstItem = stepsContainer.getChildAtIndex(0)
      if (firstItem instanceof StepItemNode) {
        const titleNode = firstItem.getChildren().find($isStepTitleNode)
        if (titleNode) {
          const paragraph = titleNode.getChildAtIndex(0)
          if (paragraph) {
            paragraph.selectEnd()
          }
        }
      }
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
          <DialogTitle>ステップを挿入</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* スタイル選択 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">スタイル</Label>
            <SelectionBox
              options={STYLE_OPTIONS}
              value={selectedStyle}
              onChange={(value) => isStepsStyle(value) && setSelectedStyle(value)}
              columns={3}
              name="ステップスタイル"
            />
          </div>

          {/* ステップ数選択 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">ステップ数</Label>
            <SelectionBox
              options={COUNT_OPTIONS}
              value={stepCount}
              onChange={setStepCount}
              columns={2}
              name="ステップ数"
            />
          </div>

          {/* プレビュー */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="text-xs text-muted-foreground mb-2">プレビュー</div>
            <div className={`space-y-2 ${selectedStyle === 'timeline' ? 'border-l-2 border-primary/30 ml-4' : ''}`}>
              {[1, 2].map((num) => (
                <div key={num} className="flex items-start gap-3">
                  <StepNumberBadge stepNumber={num} style={selectedStyle} />
                  <div>
                    <div className="font-medium text-sm">ステップ {num}</div>
                    <div className="text-xs text-muted-foreground">説明文</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
