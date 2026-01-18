/**
 * Button Plugin
 *
 * ボタン/CTAリンクの挿入機能
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
import { X, MousePointerClick } from 'lucide-react'
import { $createButtonNode, ButtonNode, type ButtonVariant } from '../nodes/ButtonNode'

const styles = tv({
  slots: {
    overlay: 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center',
    dialog: 'bg-popover rounded-lg shadow-lg p-4 w-full max-w-md',
    header: 'flex items-center justify-between mb-4',
    title: 'text-lg font-semibold flex items-center gap-2',
    titleIcon: 'w-5 h-5 text-primary',
    closeButton: 'p-1 rounded-md hover:bg-muted',
    form: 'space-y-4',
    field: 'space-y-1.5',
    label: 'text-sm font-medium',
    input: 'w-full px-3 py-2 border rounded-md bg-background text-sm',
    variantGrid: 'grid grid-cols-3 gap-2',
    variantButton: [
      'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors',
      'hover:border-primary/50 cursor-pointer',
    ],
    variantButtonActive: 'border-primary bg-primary/10',
    variantButtonInactive: 'border-border',
    variantPreview: 'px-3 py-1 rounded text-xs font-medium',
    variantLabel: 'text-xs text-muted-foreground',
    checkbox: 'flex items-center gap-2 text-sm',
    preview: 'p-4 bg-muted/50 rounded-lg text-center',
    previewButton: 'inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm',
    actions: 'flex justify-end gap-2 mt-4',
    button: 'px-4 py-2 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    buttonSecondary: 'border hover:bg-muted',
  },
})()

export const INSERT_BUTTON_COMMAND: LexicalCommand<{
  text: string
  url: string
  variant: ButtonVariant
  openInNewTab: boolean
}> = createCommand('INSERT_BUTTON_COMMAND')

type ButtonDialogProps = {
  isOpen: boolean
  onClose: () => void
}

const VARIANT_CONFIG: Record<ButtonVariant, { label: string; previewClass: string }> = {
  primary: {
    label: 'Primary',
    previewClass: 'bg-primary text-primary-foreground',
  },
  secondary: {
    label: 'Secondary',
    previewClass: 'bg-secondary text-secondary-foreground',
  },
  outline: {
    label: 'Outline',
    previewClass: 'border-2 border-primary text-primary bg-transparent',
  },
}

function ButtonDialog({ isOpen, onClose }: ButtonDialogProps) {
  const [editor] = useLexicalComposerContext()
  const [text, setText] = useState('ボタン')
  const [url, setUrl] = useState('')
  const [variant, setVariant] = useState<ButtonVariant>('primary')
  const [openInNewTab, setOpenInNewTab] = useState(false)

  const handleSubmit = () => {
    editor.dispatchCommand(INSERT_BUTTON_COMMAND, {
      text: text.trim() || 'ボタン',
      url: url.trim(),
      variant,
      openInNewTab,
    })
    onClose()
    setText('ボタン')
    setUrl('')
    setVariant('primary')
    setOpenInNewTab(false)
  }

  const handleClose = () => {
    onClose()
    setText('ボタン')
    setUrl('')
    setVariant('primary')
    setOpenInNewTab(false)
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.overlay()} onClick={handleClose}>
      <div className={styles.dialog()} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>
            <MousePointerClick className={styles.titleIcon()} />
            ボタンを挿入
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

        <div className={styles.form()}>
          <div className={styles.field()}>
            <label className={styles.label()}>ボタンテキスト</label>
            <input
              type="text"
              className={styles.input()}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ボタン"
              autoFocus
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>リンクURL</label>
            <input
              type="url"
              className={styles.input()}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>スタイル</label>
            <div className={styles.variantGrid()}>
              {(Object.keys(VARIANT_CONFIG) as ButtonVariant[]).map((v) => {
                const config = VARIANT_CONFIG[v]
                return (
                  <button
                    key={v}
                    type="button"
                    className={`${styles.variantButton()} ${
                      variant === v
                        ? styles.variantButtonActive()
                        : styles.variantButtonInactive()
                    }`}
                    onClick={() => setVariant(v)}
                  >
                    <span className={`${styles.variantPreview()} ${config.previewClass}`}>
                      Aa
                    </span>
                    <span className={styles.variantLabel()}>{config.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <label className={styles.checkbox()}>
            <input
              type="checkbox"
              checked={openInNewTab}
              onChange={(e) => setOpenInNewTab(e.target.checked)}
            />
            <span>新しいタブで開く</span>
          </label>

          <div className={styles.preview()}>
            <span
              className={`${styles.previewButton()} ${VARIANT_CONFIG[variant].previewClass}`}
            >
              {text || 'ボタン'}
            </span>
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

export function useButtonDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openButtonDialog = () => {
    setIsOpen(true)
  }

  const closeButtonDialog = () => {
    setIsOpen(false)
  }

  const ButtonDialogComponent = () => (
    <ButtonDialog isOpen={isOpen} onClose={closeButtonDialog} />
  )

  return {
    openButtonDialog,
    closeButtonDialog,
    ButtonDialog: ButtonDialogComponent,
  }
}

export function ButtonPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([ButtonNode])) {
      throw new Error('ButtonPlugin: ButtonNode not registered on editor')
    }

    return mergeRegister(
      editor.registerCommand(
        INSERT_BUTTON_COMMAND,
        (payload) => {
          const buttonNode = $createButtonNode(
            payload.text,
            payload.url,
            payload.variant,
            payload.openInNewTab
          )

          $insertNodes([buttonNode])
          if ($isRootOrShadowRoot(buttonNode.getParentOrThrow())) {
            $wrapNodeInElement(buttonNode, $createParagraphNode).selectEnd()
          }

          return true
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
  }, [editor])

  return null
}
