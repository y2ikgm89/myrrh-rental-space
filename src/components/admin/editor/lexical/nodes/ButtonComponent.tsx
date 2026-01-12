/**
 * Button Component
 *
 * エディタ内でボタン/CTAリンクを表示・編集するコンポーネント
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
import { Pencil, Trash2, ExternalLink } from 'lucide-react'
import { $isButtonNode, type ButtonVariant } from './ButtonNode'

const styles = tv({
  slots: {
    wrapper: 'inline-flex items-center gap-1 group',
    button: [
      'inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm',
      'transition-all cursor-pointer',
    ],
    externalIcon: 'w-3 h-3',
    editOverlay: [
      'absolute inset-0 bg-black/50 rounded-md',
      'flex items-center justify-center gap-2',
      'opacity-0 group-hover:opacity-100 transition-opacity',
    ],
    editButton: 'p-1.5 bg-white rounded-md hover:bg-gray-100',
    popup: [
      'absolute top-full left-0 mt-2 p-3 bg-popover border rounded-lg shadow-lg z-50',
      'min-w-[280px] space-y-3',
    ],
    field: 'space-y-1',
    label: 'text-xs font-medium text-muted-foreground',
    input: 'w-full px-2 py-1.5 border rounded text-sm bg-background',
    variantGrid: 'grid grid-cols-3 gap-2',
    variantButton: 'px-3 py-1.5 text-xs rounded border transition-colors',
    variantButtonActive: 'border-primary bg-primary/10',
    variantButtonInactive: 'hover:border-primary/50',
    checkbox: 'flex items-center gap-2 text-sm',
    popupActions: 'flex justify-end gap-2 pt-2 border-t',
    actionButton: 'px-3 py-1 text-xs rounded transition-colors',
    actionButtonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    actionButtonSecondary: 'border hover:bg-muted',
  },
  variants: {
    variant: {
      primary: {
        button: 'bg-primary text-primary-foreground hover:bg-primary/90',
      },
      secondary: {
        button: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      },
      outline: {
        button: 'border-2 border-primary text-primary hover:bg-primary/10',
      },
    },
    selected: {
      true: {
        wrapper: 'ring-2 ring-primary ring-offset-2 rounded-md',
      },
    },
  },
})()

type ButtonComponentProps = {
  nodeKey: string
  text: string
  url: string
  variant: ButtonVariant
  openInNewTab: boolean
}

const VARIANT_LABELS: Record<ButtonVariant, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  outline: 'Outline',
}

export function ButtonComponent({
  nodeKey,
  text,
  url,
  variant,
  openInNewTab,
}: ButtonComponentProps) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)
  const [showPopup, setShowPopup] = useState(false)
  // Use props directly for display, local state only for popup editing
  const [localText, setLocalText] = useState(text)
  const [localUrl, setLocalUrl] = useState(url)
  const [localVariant, setLocalVariant] = useState(variant)
  const [localOpenInNewTab, setLocalOpenInNewTab] = useState(openInNewTab)

  // Reset local state when popup opens
  const handleOpenPopup = useCallback(() => {
    setLocalText(text)
    setLocalUrl(url)
    setLocalVariant(variant)
    setLocalOpenInNewTab(openInNewTab)
    setShowPopup(true)
  }, [text, url, variant, openInNewTab])

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isButtonNode(node)) {
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
          const buttonWrapper = target.closest('.button-wrapper')
          if (buttonWrapper) {
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

  const handleSave = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isButtonNode(node)) {
        node.setText(localText)
        node.setUrl(localUrl)
        node.setVariant(localVariant)
        node.setOpenInNewTab(localOpenInNewTab)
      }
    })
    setShowPopup(false)
  }, [editor, nodeKey, localText, localUrl, localVariant, localOpenInNewTab])

  const handleRemove = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isButtonNode(node)) {
        node.remove()
      }
    })
  }, [editor, nodeKey])

  // Close popup when clicking outside
  useEffect(() => {
    if (!showPopup) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.button-popup') && !target.closest('.button-edit-trigger')) {
        setShowPopup(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showPopup])

  return (
    <span className={`${styles.wrapper({ selected: isSelected })} relative`}>
      <span
        className={styles.button({ variant })}
        onClick={(e) => {
          e.preventDefault()
          handleOpenPopup()
        }}
      >
        {text || 'ボタン'}
        {openInNewTab && <ExternalLink className={styles.externalIcon()} />}
      </span>

      {isSelected && (
        <span className="inline-flex items-center gap-1 ml-1">
          <button
            type="button"
            className="button-edit-trigger p-1 rounded hover:bg-muted"
            onClick={handleOpenPopup}
            aria-label="編集"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            onClick={handleRemove}
            aria-label="削除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </span>
      )}

      {showPopup && (
        <span className={`button-popup ${styles.popup()}`}>
          <div className={styles.field()}>
            <label className={styles.label()}>ボタンテキスト</label>
            <input
              type="text"
              className={styles.input()}
              value={localText}
              onChange={(e) => setLocalText(e.target.value)}
              placeholder="ボタン"
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>リンクURL</label>
            <input
              type="url"
              className={styles.input()}
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>スタイル</label>
            <div className={styles.variantGrid()}>
              {(Object.keys(VARIANT_LABELS) as ButtonVariant[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.variantButton()} ${
                    localVariant === v
                      ? styles.variantButtonActive()
                      : styles.variantButtonInactive()
                  }`}
                  onClick={() => setLocalVariant(v)}
                >
                  {VARIANT_LABELS[v]}
                </button>
              ))}
            </div>
          </div>

          <label className={styles.checkbox()}>
            <input
              type="checkbox"
              checked={localOpenInNewTab}
              onChange={(e) => setLocalOpenInNewTab(e.target.checked)}
            />
            <span>新しいタブで開く</span>
          </label>

          <div className={styles.popupActions()}>
            <button
              type="button"
              className={`${styles.actionButton()} ${styles.actionButtonSecondary()}`}
              onClick={() => setShowPopup(false)}
            >
              キャンセル
            </button>
            <button
              type="button"
              className={`${styles.actionButton()} ${styles.actionButtonPrimary()}`}
              onClick={handleSave}
            >
              保存
            </button>
          </div>
        </span>
      )}
    </span>
  )
}
