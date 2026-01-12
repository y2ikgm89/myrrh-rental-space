/**
 * Card Plugin
 *
 * カードコンポーネントの挿入機能
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
import { X, LayoutGrid, ImageIcon } from 'lucide-react'
import { $createCardNode, CardNode, type CardNodeOptions } from '../nodes/CardNode'

const styles = tv({
  slots: {
    overlay: 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center',
    dialog: 'bg-popover rounded-lg shadow-lg p-4 w-full max-w-lg max-h-[80vh] overflow-y-auto',
    header: 'flex items-center justify-between mb-4',
    title: 'text-lg font-semibold flex items-center gap-2',
    titleIcon: 'w-5 h-5 text-primary',
    closeButton: 'p-1 rounded-md hover:bg-muted',
    form: 'space-y-4',
    field: 'space-y-1.5',
    label: 'text-sm font-medium',
    input: 'w-full px-3 py-2 border rounded-md bg-background text-sm',
    textarea: 'w-full px-3 py-2 border rounded-md bg-background text-sm min-h-[80px] resize-none',
    preview: 'rounded-lg border overflow-hidden bg-muted/30',
    previewImage: 'aspect-video bg-muted flex items-center justify-center',
    previewImageActual: 'w-full h-full object-cover',
    previewContent: 'p-4 space-y-2',
    previewTitle: 'text-lg font-semibold',
    previewDescription: 'text-sm text-muted-foreground',
    previewLink: 'text-sm text-primary',
    actions: 'flex justify-end gap-2 mt-4',
    button: 'px-4 py-2 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    buttonSecondary: 'border hover:bg-muted',
  },
})()

export const INSERT_CARD_COMMAND: LexicalCommand<CardNodeOptions> = createCommand('INSERT_CARD_COMMAND')

type CardDialogProps = {
  isOpen: boolean
  onClose: () => void
}

function CardDialog({ isOpen, onClose }: CardDialogProps) {
  const [editor] = useLexicalComposerContext()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      editor.dispatchCommand(INSERT_CARD_COMMAND, {
        title: title.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim() || undefined,
        imageAlt: imageAlt.trim() || undefined,
        linkUrl: linkUrl.trim() || undefined,
        linkText: linkText.trim() || undefined,
      })
      onClose()
      setTitle('')
      setDescription('')
      setImageUrl('')
      setImageAlt('')
      setLinkUrl('')
      setLinkText('')
    },
    [editor, title, description, imageUrl, imageAlt, linkUrl, linkText, onClose]
  )

  const handleClose = useCallback(() => {
    onClose()
    setTitle('')
    setDescription('')
    setImageUrl('')
    setImageAlt('')
    setLinkUrl('')
    setLinkText('')
  }, [onClose])

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.overlay()} onClick={handleClose}>
      <div className={styles.dialog()} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>
            <LayoutGrid className={styles.titleIcon()} />
            カードを挿入
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

        <form onSubmit={handleSubmit} className={styles.form()}>
          <div className={styles.field()}>
            <label className={styles.label()}>タイトル</label>
            <input
              type="text"
              className={styles.input()}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="カードのタイトル"
              autoFocus
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>説明文</label>
            <textarea
              className={styles.textarea()}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="カードの説明文..."
              rows={2}
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>画像URL（任意）</label>
            <input
              type="url"
              className={styles.input()}
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>画像の代替テキスト（任意）</label>
            <input
              type="text"
              className={styles.input()}
              value={imageAlt}
              onChange={(e) => setImageAlt(e.target.value)}
              placeholder="画像の説明"
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>リンクURL（任意）</label>
            <input
              type="url"
              className={styles.input()}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>リンクテキスト（任意）</label>
            <input
              type="text"
              className={styles.input()}
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="詳細を見る"
            />
          </div>

          {/* Preview */}
          <div className={styles.preview()}>
            <div className={styles.previewImage()}>
              {imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- Editor handles external URLs */
                <img
                  src={imageUrl}
                  alt={imageAlt || ''}
                  className={styles.previewImageActual()}
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <div className={styles.previewContent()}>
              <div className={styles.previewTitle()}>
                {title || 'タイトル'}
              </div>
              <div className={styles.previewDescription()}>
                {description || '説明文'}
              </div>
              {linkUrl && (
                <div className={styles.previewLink()}>
                  {linkText || '詳細を見る'}
                </div>
              )}
            </div>
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

export function useCardDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openCardDialog = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closeCardDialog = useCallback(() => {
    setIsOpen(false)
  }, [])

  const CardDialogComponent = useCallback(
    () => <CardDialog isOpen={isOpen} onClose={closeCardDialog} />,
    [isOpen, closeCardDialog]
  )

  return {
    openCardDialog,
    closeCardDialog,
    CardDialog: CardDialogComponent,
  }
}

export function CardPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([CardNode])) {
      throw new Error('CardPlugin: CardNode not registered on editor')
    }

    return mergeRegister(
      editor.registerCommand(
        INSERT_CARD_COMMAND,
        (payload) => {
          const cardNode = $createCardNode(payload)

          $insertNodes([cardNode])
          if ($isRootOrShadowRoot(cardNode.getParentOrThrow())) {
            $wrapNodeInElement(cardNode, $createParagraphNode).selectEnd()
          }

          return true
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
  }, [editor])

  return null
}
