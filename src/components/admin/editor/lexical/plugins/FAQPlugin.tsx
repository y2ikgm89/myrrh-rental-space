/**
 * FAQ Plugin
 *
 * FAQアコーディオンの挿入機能
 */

'use client'

import { useEffect, useState } from 'react'
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
import { X, HelpCircle, Plus, Trash2 } from 'lucide-react'
import { $createFAQNode, FAQNode, type FAQItem } from '../nodes/FAQNode'

const styles = tv({
  slots: {
    overlay: 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center',
    dialog: 'bg-popover rounded-lg shadow-lg p-4 w-full max-w-lg max-h-[80vh] overflow-y-auto',
    header: 'flex items-center justify-between mb-4',
    title: 'text-lg font-semibold flex items-center gap-2',
    titleIcon: 'w-5 h-5 text-violet-600',
    closeButton: 'p-1 rounded-md hover:bg-muted',
    description: 'text-sm text-muted-foreground mb-4',
    form: 'space-y-4',
    itemList: 'space-y-3',
    item: 'relative rounded-lg border p-3 space-y-2',
    itemHeader: 'flex items-center justify-between',
    itemLabel: 'text-xs font-medium text-muted-foreground',
    removeButton: 'p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive',
    input: 'w-full px-3 py-2 border rounded-md bg-background text-sm',
    textarea: 'w-full px-3 py-2 border rounded-md bg-background text-sm min-h-[60px] resize-none',
    addButton: [
      'flex items-center justify-center gap-2 w-full p-2 rounded-lg border-2 border-dashed',
      'text-sm text-muted-foreground hover:border-primary hover:text-foreground',
      'transition-colors cursor-pointer',
    ],
    actions: 'flex justify-end gap-2 mt-4 pt-4 border-t',
    button: 'px-4 py-2 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    buttonSecondary: 'border hover:bg-muted',
  },
})()

export const INSERT_FAQ_COMMAND: LexicalCommand<{
  items: FAQItem[]
}> = createCommand('INSERT_FAQ_COMMAND')

type FAQDialogProps = {
  isOpen: boolean
  onClose: () => void
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

function FAQDialog({ isOpen, onClose }: FAQDialogProps) {
  const [editor] = useLexicalComposerContext()
  const [items, setItems] = useState<FAQItem[]>([
    { id: generateId(), question: '', answer: '' },
  ])

  const handleAddItem = () => {
    setItems((prev) => [...prev, { id: generateId(), question: '', answer: '' }])
  }

  const handleRemoveItem = (id: string) => {
    setItems((prev) => {
      const newItems = prev.filter((item) => item.id !== id)
      return newItems.length > 0
        ? newItems
        : [{ id: generateId(), question: '', answer: '' }]
    })
  }

  const handleUpdateItem = (id: string, field: 'question' | 'answer', value: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    )
  }

  const handleSubmit = () => {
    // Filter out empty items
    const validItems = items.filter(
      (item) => item.question.trim() || item.answer.trim()
    )
    editor.dispatchCommand(INSERT_FAQ_COMMAND, {
      items: validItems.length > 0 ? validItems : items,
    })
    onClose()
    setItems([{ id: generateId(), question: '', answer: '' }])
  }

  const handleClose = () => {
    onClose()
    setItems([{ id: generateId(), question: '', answer: '' }])
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.overlay()} onClick={handleClose}>
      <div className={styles.dialog()} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>
            <HelpCircle className={styles.titleIcon()} />
            FAQを挿入
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className={styles.closeButton()}
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className={styles.description()}>
          質問と回答のペアを追加してください。挿入後も編集可能です。
        </p>

        <div className={styles.form()}>
          <div className={styles.itemList()}>
            {items.map((item, index) => (
              <div key={item.id} className={styles.item()}>
                <div className={styles.itemHeader()}>
                  <span className={styles.itemLabel()}>質問 {index + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      className={styles.removeButton()}
                      onClick={() => handleRemoveItem(item.id)}
                      aria-label="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  className={styles.input()}
                  value={item.question}
                  onChange={(e) =>
                    handleUpdateItem(item.id, 'question', e.target.value)
                  }
                  placeholder="質問を入力..."
                />
                <textarea
                  className={styles.textarea()}
                  value={item.answer}
                  onChange={(e) =>
                    handleUpdateItem(item.id, 'answer', e.target.value)
                  }
                  placeholder="回答を入力..."
                  rows={2}
                />
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

          <div className={styles.actions()}>
            <button
              type="button"
              onClick={handleClose}
              className={`${styles.button()} ${styles.buttonSecondary()}`}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className={`${styles.button()} ${styles.buttonPrimary()}`}
            >
              挿入
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function useFAQDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openFAQDialog = () => {
    setIsOpen(true)
  }

  const closeFAQDialog = () => {
    setIsOpen(false)
  }

  const FAQDialogComponent = () => (
    <FAQDialog isOpen={isOpen} onClose={closeFAQDialog} />
  )

  return {
    openFAQDialog,
    closeFAQDialog,
    FAQDialog: FAQDialogComponent,
  }
}

export function FAQPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([FAQNode])) {
      throw new Error('FAQPlugin: FAQNode not registered on editor')
    }

    return mergeRegister(
      editor.registerCommand(
        INSERT_FAQ_COMMAND,
        (payload) => {
          const faqNode = $createFAQNode(payload.items)

          $insertNodes([faqNode])
          if ($isRootOrShadowRoot(faqNode.getParentOrThrow())) {
            $wrapNodeInElement(faqNode, $createParagraphNode).selectEnd()
          }

          return true
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
  }, [editor])

  return null
}
