/**
 * PostListWidget Plugin
 *
 * 記事リストウィジェットの挿入機能
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $insertNodes,
  $isRootOrShadowRoot,
  $createParagraphNode,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
} from 'lexical'
import { $wrapNodeInElement, mergeRegister } from '@lexical/utils'
import { tv } from 'tailwind-variants'
import { X, Newspaper } from 'lucide-react'
import {
  $createPostListWidgetNode,
  PostListWidgetNode,
  type PostListWidgetType,
} from '../nodes'

const styles = tv({
  slots: {
    overlay: 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center',
    dialog: 'bg-popover rounded-lg shadow-lg p-4 w-full max-w-md',
    header: 'flex items-center justify-between mb-4',
    title: 'text-lg font-semibold',
    closeButton: 'p-1 rounded-md hover:bg-muted',
    form: 'space-y-4',
    field: 'space-y-1.5',
    label: 'text-sm font-medium',
    select: 'w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary',
    input: 'w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary',
    hint: 'text-xs text-muted-foreground',
    actions: 'flex justify-end gap-2 mt-4',
    button: 'px-4 py-2 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    buttonSecondary: 'border hover:bg-muted',
  },
})()

export const INSERT_POST_LIST_WIDGET_COMMAND: LexicalCommand<{
  type: PostListWidgetType
  count: number
  categoryId?: string
}> = createCommand('INSERT_POST_LIST_WIDGET_COMMAND')

type PostListWidgetDialogProps = {
  isOpen: boolean
  onClose: () => void
}

function PostListWidgetDialog({ isOpen, onClose }: PostListWidgetDialogProps) {
  const [editor] = useLexicalComposerContext()
  const [widgetType, setWidgetType] = useState<PostListWidgetType>('recent')
  const [count, setCount] = useState(5)
  const [categoryId, setCategoryId] = useState('')

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      editor.dispatchCommand(INSERT_POST_LIST_WIDGET_COMMAND, {
        type: widgetType,
        count,
        categoryId: categoryId || undefined,
      })
      onClose()
      setWidgetType('recent')
      setCount(5)
      setCategoryId('')
    },
    [editor, widgetType, count, categoryId, onClose]
  )

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.overlay()} onClick={onClose}>
      <div className={styles.dialog()} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>
            <Newspaper className="w-5 h-5 inline mr-2 text-primary" />
            記事リストウィジェットを挿入
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton()}
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form()}>
          <div className={styles.field()}>
            <label className={styles.label()}>表示タイプ</label>
            <select
              value={widgetType}
              onChange={(e) => setWidgetType(e.target.value as PostListWidgetType)}
              className={styles.select()}
            >
              <option value="recent">最新記事</option>
              <option value="popular">人気記事</option>
              <option value="category">カテゴリ別</option>
            </select>
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>表示件数</label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 5)}
              min={1}
              max={20}
              className={styles.input()}
            />
            <p className={styles.hint()}>1〜20件まで設定可能</p>
          </div>

          {widgetType === 'category' && (
            <div className={styles.field()}>
              <label className={styles.label()}>カテゴリID</label>
              <input
                type="text"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                placeholder="カテゴリIDを入力"
                className={styles.input()}
              />
              <p className={styles.hint()}>
                表示したいカテゴリのIDを指定してください
              </p>
            </div>
          )}

          <div className={styles.actions()}>
            <button
              type="button"
              onClick={onClose}
              className={`${styles.button()} ${styles.buttonSecondary()}`}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className={`${styles.button()} ${styles.buttonPrimary()}`}
            >
              挿入
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function usePostListWidgetDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openPostListWidgetDialog = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closePostListWidgetDialog = useCallback(() => {
    setIsOpen(false)
  }, [])

  const PostListWidgetDialogComponent = useCallback(
    () => (
      <PostListWidgetDialog isOpen={isOpen} onClose={closePostListWidgetDialog} />
    ),
    [isOpen, closePostListWidgetDialog]
  )

  return {
    openPostListWidgetDialog,
    closePostListWidgetDialog,
    PostListWidgetDialog: PostListWidgetDialogComponent,
  }
}

export function PostListWidgetPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([PostListWidgetNode])) {
      throw new Error(
        'PostListWidgetPlugin: PostListWidgetNode not registered on editor'
      )
    }

    return mergeRegister(
      editor.registerCommand(
        INSERT_POST_LIST_WIDGET_COMMAND,
        (payload) => {
          const widgetNode = $createPostListWidgetNode(
            payload.type,
            payload.count,
            payload.categoryId
          )

          $insertNodes([widgetNode])
          if ($isRootOrShadowRoot(widgetNode.getParentOrThrow())) {
            $wrapNodeInElement(widgetNode, $createParagraphNode).selectEnd()
          }

          return true
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
  }, [editor])

  return null
}
