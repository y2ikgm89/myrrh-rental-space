/**
 * PostListWidget Component
 *
 * エディタ内で記事リストウィジェットを表示・編集するコンポーネント
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical'
import { tv } from 'tailwind-variants'
import { Newspaper, Settings, Trash2 } from 'lucide-react'
import {
  $isPostListWidgetNode,
  type PostListWidgetType,
} from './PostListWidgetNode'

const styles = tv({
  slots: {
    wrapper: [
      'relative rounded-lg border-2 p-4 transition-colors',
      'bg-gradient-to-br from-primary/5 to-primary/10',
    ],
    header: 'flex items-center justify-between mb-3',
    title: 'flex items-center gap-2 font-medium text-sm',
    actions: 'flex items-center gap-1',
    actionButton: [
      'p-1.5 rounded-md transition-colors',
      'hover:bg-primary/20 text-muted-foreground hover:text-foreground',
    ],
    content: 'space-y-2',
    badge: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary',
    preview: 'text-sm text-muted-foreground',
    dialog: 'absolute top-full left-0 mt-2 p-4 bg-popover border rounded-lg shadow-lg z-50 min-w-[280px]',
    field: 'space-y-1.5',
    label: 'text-sm font-medium',
    select: 'w-full px-3 py-2 border rounded-md bg-background text-sm',
    input: 'w-full px-3 py-2 border rounded-md bg-background text-sm',
    dialogActions: 'flex justify-end gap-2 mt-4',
    button: 'px-3 py-1.5 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    buttonSecondary: 'border hover:bg-muted',
  },
  variants: {
    selected: {
      true: {
        wrapper: 'border-primary ring-2 ring-primary/20',
      },
      false: {
        wrapper: 'border-border hover:border-primary/50',
      },
    },
  },
})()

type PostListWidgetComponentProps = {
  nodeKey: string
  widgetType: PostListWidgetType
  count: number
  categoryId?: string
}

const WIDGET_TYPE_LABELS: Record<PostListWidgetType, string> = {
  recent: '最新記事',
  popular: '人気記事',
  category: 'カテゴリ別',
}

export function PostListWidgetComponent({
  nodeKey,
  widgetType,
  count,
  categoryId,
}: PostListWidgetComponentProps) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)
  const [showSettings, setShowSettings] = useState(false)
  const [localType, setLocalType] = useState(widgetType)
  const [localCount, setLocalCount] = useState(count)
  const [localCategoryId, setLocalCategoryId] = useState(categoryId || '')

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isPostListWidgetNode(node)) {
            node.remove()
          }
        })
        return true
      }
      return false
    },
    [editor, isSelected, nodeKey]
  )

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        (event) => {
          const target = event.target as HTMLElement
          const widgetWrapper = target.closest('.post-list-widget-wrapper')
          if (widgetWrapper) {
            clearSelection()
            setSelected(true)
            return true
          }
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      )
    )
  }, [clearSelection, editor, onDelete, setSelected])

  const handleSaveSettings = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isPostListWidgetNode(node)) {
        node.setWidgetType(localType)
        node.setCount(localCount)
        node.setCategoryId(localCategoryId || undefined)
      }
    })
    setShowSettings(false)
  }

  const handleRemove = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isPostListWidgetNode(node)) {
        node.remove()
      }
    })
  }

  return (
    <div className={styles.wrapper({ selected: isSelected })}>
      <div className={styles.header()}>
        <div className={styles.title()}>
          <Newspaper className="w-4 h-4 text-primary" />
          <span>記事リストウィジェット</span>
        </div>
        <div className={styles.actions()}>
          <button
            type="button"
            className={styles.actionButton()}
            onClick={() => setShowSettings(!showSettings)}
            aria-label="設定"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            className={styles.actionButton()}
            onClick={handleRemove}
            aria-label="削除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className={styles.content()}>
        <div className="flex items-center gap-2">
          <span className={styles.badge()}>
            {WIDGET_TYPE_LABELS[widgetType]}
          </span>
          <span className={styles.badge()}>{count}件表示</span>
          {categoryId && (
            <span className={styles.badge()}>
              カテゴリID: {categoryId.slice(0, 8)}...
            </span>
          )}
        </div>
        <p className={styles.preview()}>
          公開時にこの位置に記事リストが表示されます
        </p>
      </div>

      {showSettings && (
        <div className={styles.dialog()}>
          <div className="space-y-4">
            <div className={styles.field()}>
              <label className={styles.label()}>表示タイプ</label>
              <select
                className={styles.select()}
                value={localType}
                onChange={(e) =>
                  setLocalType(e.target.value as PostListWidgetType)
                }
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
                className={styles.input()}
                value={localCount}
                onChange={(e) => setLocalCount(parseInt(e.target.value, 10) || 5)}
                min={1}
                max={20}
              />
            </div>

            {localType === 'category' && (
              <div className={styles.field()}>
                <label className={styles.label()}>カテゴリID</label>
                <input
                  type="text"
                  className={styles.input()}
                  value={localCategoryId}
                  onChange={(e) => setLocalCategoryId(e.target.value)}
                  placeholder="カテゴリIDを入力"
                />
              </div>
            )}
          </div>

          <div className={styles.dialogActions()}>
            <button
              type="button"
              className={`${styles.button()} ${styles.buttonSecondary()}`}
              onClick={() => setShowSettings(false)}
            >
              キャンセル
            </button>
            <button
              type="button"
              className={`${styles.button()} ${styles.buttonPrimary()}`}
              onClick={handleSaveSettings}
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
