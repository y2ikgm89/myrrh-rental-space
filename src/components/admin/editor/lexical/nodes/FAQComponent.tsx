/**
 * FAQ Component
 *
 * エディタ内でFAQアコーディオンを表示・編集するコンポーネント
 */

'use client'

import { useCallback, useEffect } from 'react'
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
import {
  HelpCircle,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
} from 'lucide-react'
import { $isFAQNode, type FAQItem } from './FAQNode'

const styles = tv({
  slots: {
    wrapper: [
      'relative rounded-lg border-2 p-4 transition-colors',
      'bg-gradient-to-br from-violet-50 to-violet-100/50',
      'dark:from-violet-950/30 dark:to-violet-900/20',
    ],
    header: 'flex items-center justify-between mb-4',
    title: 'flex items-center gap-2 font-medium text-sm',
    titleIcon: 'w-4 h-4 text-violet-600 dark:text-violet-400',
    actions: 'flex items-center gap-1',
    actionButton: [
      'p-1.5 rounded-md transition-colors',
      'hover:bg-violet-200/50 dark:hover:bg-violet-800/50',
      'text-muted-foreground hover:text-foreground',
    ],
    itemList: 'space-y-3',
    item: [
      'relative rounded-lg border bg-background p-3',
      'hover:border-violet-300 dark:hover:border-violet-700 transition-colors',
    ],
    itemHeader: 'flex items-start gap-2',
    dragHandle: [
      'mt-2 p-1 cursor-grab text-muted-foreground',
      'hover:text-foreground transition-colors',
    ],
    itemContent: 'flex-1 space-y-2',
    questionRow: 'flex items-center gap-2',
    questionIcon: 'w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0',
    questionInput: [
      'flex-1 px-2 py-1 text-sm font-medium bg-transparent border-none outline-none',
      'placeholder:text-muted-foreground',
    ],
    answerSection: 'pl-6',
    answerLabel: 'text-xs text-muted-foreground mb-1',
    answerTextarea: [
      'w-full px-2 py-1 text-sm bg-muted/50 rounded border-none outline-none resize-none',
      'placeholder:text-muted-foreground min-h-[60px]',
    ],
    itemActions: 'mt-1',
    removeButton: [
      'p-1 rounded text-muted-foreground',
      'hover:text-destructive hover:bg-destructive/10 transition-colors',
    ],
    addButton: [
      'flex items-center gap-2 w-full p-2 rounded-lg border-2 border-dashed',
      'text-sm text-muted-foreground',
      'hover:border-violet-300 hover:text-foreground hover:bg-violet-50',
      'dark:hover:border-violet-700 dark:hover:bg-violet-950/30',
      'transition-colors cursor-pointer',
    ],
  },
  variants: {
    selected: {
      true: {
        wrapper: 'border-violet-400 ring-2 ring-violet-200 dark:ring-violet-800',
      },
      false: {
        wrapper: 'border-violet-200 dark:border-violet-800',
      },
    },
  },
})()

type FAQComponentProps = {
  nodeKey: string
  items: FAQItem[]
}

export function FAQComponent({ nodeKey, items }: FAQComponentProps) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isFAQNode(node)) {
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
          const faqWrapper = target.closest('.faq-wrapper')
          if (faqWrapper) {
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

  const handleAddItem = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isFAQNode(node)) {
        node.addItem()
      }
    })
  }, [editor, nodeKey])

  const handleRemoveItem = useCallback(
    (id: string) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isFAQNode(node)) {
          node.removeItem(id)
        }
      })
    },
    [editor, nodeKey]
  )

  const handleUpdateItem = useCallback(
    (id: string, field: 'question' | 'answer', value: string) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isFAQNode(node)) {
          node.updateItem(id, field, value)
        }
      })
    },
    [editor, nodeKey]
  )

  const handleRemoveNode = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isFAQNode(node)) {
        node.remove()
      }
    })
  }, [editor, nodeKey])

  return (
    <div className={styles.wrapper({ selected: isSelected })}>
      <div className={styles.header()}>
        <div className={styles.title()}>
          <HelpCircle className={styles.titleIcon()} />
          <span>FAQ ({items.length}件)</span>
        </div>
        <div className={styles.actions()}>
          <button
            type="button"
            className={styles.actionButton()}
            onClick={handleRemoveNode}
            aria-label="削除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className={styles.itemList()}>
        {items.map((item, index) => (
          <div key={item.id} className={styles.item()}>
            <div className={styles.itemHeader()}>
              <div className={styles.dragHandle()}>
                <GripVertical className="w-4 h-4" />
              </div>
              <div className={styles.itemContent()}>
                <div className={styles.questionRow()}>
                  <ChevronDown className={styles.questionIcon()} />
                  <input
                    type="text"
                    className={styles.questionInput()}
                    value={item.question}
                    onChange={(e) =>
                      handleUpdateItem(item.id, 'question', e.target.value)
                    }
                    placeholder={`質問 ${index + 1}`}
                  />
                </div>
                <div className={styles.answerSection()}>
                  <div className={styles.answerLabel()}>回答</div>
                  <textarea
                    className={styles.answerTextarea()}
                    value={item.answer}
                    onChange={(e) =>
                      handleUpdateItem(item.id, 'answer', e.target.value)
                    }
                    placeholder="回答を入力..."
                    rows={2}
                  />
                </div>
              </div>
              <div className={styles.itemActions()}>
                <button
                  type="button"
                  className={styles.removeButton()}
                  onClick={() => handleRemoveItem(item.id)}
                  aria-label="この質問を削除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          className={styles.addButton()}
          onClick={handleAddItem}
        >
          <Plus className="w-4 h-4" />
          <span>質問を追加</span>
        </button>
      </div>
    </div>
  )
}
