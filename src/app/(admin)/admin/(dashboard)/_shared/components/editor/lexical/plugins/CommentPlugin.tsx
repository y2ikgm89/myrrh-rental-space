/**
 * Comment Plugin
 *
 * @description Lexical MarkNode を使用したコメント機能を提供するプラグイン
 *
 * 公式推奨パターン: @lexical/mark を使用してテキストにマークを追加
 * @see https://lexical.dev/docs/concepts/serialization#mark-nodes
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical'
import {
  $getMarkIDs,
  $isMarkNode,
  $unwrapMarkNode,
  $wrapSelectionInMarkNode,
  MarkNode,
} from '@lexical/mark'
import { mergeRegister } from '@lexical/utils'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/admin/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/admin/components/ui/dialog'
import { Textarea } from '@/admin/components/ui/textarea'
import { Label } from '@/admin/components/ui/label'

// =============================================================================
// Types & Commands
// =============================================================================

export type AddCommentPayload = {
  markId: string
  quotedText: string
}

export const ADD_COMMENT_COMMAND: LexicalCommand<AddCommentPayload> =
  createCommand('ADD_COMMENT_COMMAND')

export const REMOVE_COMMENT_COMMAND: LexicalCommand<string> =
  createCommand('REMOVE_COMMENT_COMMAND')

export const CLICK_MARK_COMMAND: LexicalCommand<string> =
  createCommand('CLICK_MARK_COMMAND')

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * ユニークなマークIDを生成
 */
export function generateMarkId(): string {
  return `mark_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 選択範囲のテキストを取得
 */
function getSelectedText(editor: LexicalEditor): string {
  let selectedText = ''

  editor.getEditorState().read(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      selectedText = selection.getTextContent()
    }
  })

  return selectedText
}

// =============================================================================
// Hook: useComment
// =============================================================================

export type UseCommentReturn = {
  canAddComment: boolean
  addComment: () => AddCommentPayload | null
  activeMarkIds: string[]
}

export function useComment(): UseCommentReturn {
  const [editor] = useLexicalComposerContext()
  const [canAddComment, setCanAddComment] = useState(false)
  const [activeMarkIds, setActiveMarkIds] = useState<string[]>([])

  // 選択状態の監視
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection) && !selection.isCollapsed()) {
          // テキストが選択されている場合はコメント追加可能
          setCanAddComment(true)
        } else {
          setCanAddComment(false)
        }

        // 現在のカーソル位置のマークIDを取得
        if ($isRangeSelection(selection)) {
          const anchorNode = selection.anchor.getNode()
          if ($isTextNode(anchorNode)) {
            const markIds = $getMarkIDs(anchorNode, selection.anchor.offset)
            setActiveMarkIds(markIds ?? [])
          } else {
            setActiveMarkIds([])
          }
        } else {
          setActiveMarkIds([])
        }
      })
    })
  }, [editor])

  // コメントを追加
  const addComment = (): AddCommentPayload | null => {
    const quotedText = getSelectedText(editor)
    if (!quotedText) return null

    const markId = generateMarkId()

    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        $wrapSelectionInMarkNode(selection, selection.isBackward(), markId)
      }
    })

    return { markId, quotedText }
  }

  return { canAddComment, addComment, activeMarkIds }
}

// =============================================================================
// Hook: useCommentDialog
// =============================================================================

export type UseCommentDialogReturn = {
  isOpen: boolean
  open: () => void
  close: () => void
  pendingComment: AddCommentPayload | null
  setPendingComment: (comment: AddCommentPayload | null) => void
}

export function useCommentDialog(): UseCommentDialogReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingComment, setPendingComment] = useState<AddCommentPayload | null>(null)

  const open = () => setIsOpen(true)
  const close = () => {
    setIsOpen(false)
    setPendingComment(null)
  }

  return { isOpen, open, close, pendingComment, setPendingComment }
}

// =============================================================================
// Component: CommentButton (for Floating Toolbar)
// =============================================================================

type CommentButtonProps = {
  onClick: () => void
  disabled?: boolean
}

export function CommentButton({ onClick, disabled }: CommentButtonProps): React.ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={onClick}
      disabled={disabled}
      aria-label="コメントを追加"
      title="コメントを追加"
    >
      <MessageSquarePlus className="h-4 w-4" />
    </Button>
  )
}

// =============================================================================
// Component: CommentInputDialog
// =============================================================================

type CommentInputDialogProps = {
  isOpen: boolean
  onClose: () => void
  quotedText: string
  onSubmit: (comment: string) => void
}

export function CommentInputDialog({
  isOpen,
  onClose,
  quotedText,
  onSubmit,
}: CommentInputDialogProps): React.ReactElement {
  const [comment, setComment] = useState('')

  const handleSubmit = () => {
    const trimmed = comment.trim()
    if (trimmed) {
      onSubmit(trimmed)
      setComment('')
      onClose()
    }
  }

  const handleClose = () => {
    setComment('')
    onClose()
  }

  const displayText =
    quotedText.length > 100 ? `${quotedText.slice(0, 100)}...` : quotedText

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>コメントを追加</DialogTitle>
          <DialogDescription>
            選択したテキストにコメントを追加します
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>選択テキスト</Label>
            <div className="rounded-md bg-muted p-3 text-sm">
              &ldquo;{displayText}&rdquo;
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="comment">コメント</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="コメントを入力..."
              rows={4}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!comment.trim()}
          >
            追加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Plugin: CommentPlugin
// =============================================================================

type CommentPluginProps = {
  onMarkClick?: (markId: string) => void
}

export function CommentPlugin({
  onMarkClick,
}: CommentPluginProps) {
  const [editor] = useLexicalComposerContext()
  // イベントリスナーを追跡してクリーンアップ
  const clickListenersRef = useRef<Map<string, () => void>>(new Map())

  // マーククリックのリスナー登録
  useEffect(() => {
    const clickListeners = clickListenersRef.current

    return mergeRegister(
      // マーククリックコマンド
      editor.registerCommand(
        CLICK_MARK_COMMAND,
        (markId) => {
          onMarkClick?.(markId)
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      // コメント追加コマンド
      editor.registerCommand(
        ADD_COMMENT_COMMAND,
        (payload) => {
          editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              $wrapSelectionInMarkNode(
                selection,
                selection.isBackward(),
                payload.markId
              )
            }
          })
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      // コメント削除コマンド
      editor.registerCommand(
        REMOVE_COMMENT_COMMAND,
        (markId) => {
          editor.update(() => {
            const markNodeMap = $getMarkNodesInDocument()
            const markNodes = markNodeMap.get(markId)
            if (markNodes) {
              for (const markNode of markNodes) {
                $unwrapMarkNode(markNode)
              }
            }
          })
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      // マークノードのクリックイベントをキャプチャ
      editor.registerMutationListener(MarkNode, (mutations) => {
        for (const [nodeKey, mutation] of mutations) {
          // 削除時: イベントリスナーをクリーンアップ
          if (mutation === 'destroyed') {
            const listener = clickListeners.get(nodeKey)
            if (listener) {
              const element = editor.getElementByKey(nodeKey)
              element?.removeEventListener('click', listener)
              clickListeners.delete(nodeKey)
            }
          } else if (mutation === 'created' || mutation === 'updated') {
            // 既存のリスナーがあれば削除
            const existingListener = clickListeners.get(nodeKey)
            if (existingListener) {
              const element = editor.getElementByKey(nodeKey)
              element?.removeEventListener('click', existingListener)
            }

            const element = editor.getElementByKey(nodeKey)
            if (element) {
              const listener = () => {
                editor.getEditorState().read(() => {
                  const node = $getNodeByKey(nodeKey)
                  if ($isMarkNode(node)) {
                    const ids = node.getIDs()
                    if (ids.length > 0) {
                      editor.dispatchCommand(CLICK_MARK_COMMAND, ids[0])
                    }
                  }
                })
              }
              element.addEventListener('click', listener)
              clickListeners.set(nodeKey, listener)
            }
          }
        }
      }),
      // コンポーネントアンマウント時に全リスナーをクリーンアップ
      () => {
        for (const [nodeKey, listener] of clickListeners) {
          const element = editor.getElementByKey(nodeKey)
          element?.removeEventListener('click', listener)
        }
        clickListeners.clear()
      }
    )
  }, [editor, onMarkClick])

  return null
}

// =============================================================================
// Utility: Get all MarkNodes in document
// =============================================================================

function $getMarkNodesInDocument(): Map<string, MarkNode[]> {
  const markNodeMap = new Map<string, MarkNode[]>()
  const root = $getRoot()

  // DFS でルートからすべてのノードを走査
  const traverse = (node: LexicalNode) => {
    if ($isMarkNode(node)) {
      const ids = node.getIDs()
      for (const id of ids) {
        const existing = markNodeMap.get(id) ?? []
        existing.push(node)
        markNodeMap.set(id, existing)
      }
    }
    if ($isElementNode(node)) {
      for (const child of node.getChildren()) {
        traverse(child)
      }
    }
  }

  for (const child of root.getChildren()) {
    traverse(child)
  }

  return markNodeMap
}

// =============================================================================
// Hook: useMarkIds - Get all mark IDs in the current document
// =============================================================================

export function useMarkIds(): string[] {
  const [editor] = useLexicalComposerContext()
  const [markIds, setMarkIds] = useState<string[]>([])

  useEffect(() => {
    const updateMarkIds = () => {
      editor.getEditorState().read(() => {
        const ids = new Set<string>()
        const markNodeMap = $getMarkNodesInDocument()
        for (const [id] of markNodeMap) {
          ids.add(id)
        }
        setMarkIds([...ids])
      })
    }

    updateMarkIds()

    return editor.registerUpdateListener(() => {
      updateMarkIds()
    })
  }, [editor])

  return markIds
}
