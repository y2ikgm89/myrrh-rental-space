/**
 * Link Plugin
 *
 * リンクの挿入・編集機能
 */

'use client'

import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical'
import { $findMatchingParent } from '@lexical/utils'
import { tv } from 'tailwind-variants'
import { X, ExternalLink } from 'lucide-react'

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
    input: 'w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary',
    actions: 'flex justify-end gap-2 mt-4',
    button: 'px-4 py-2 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    buttonSecondary: 'border hover:bg-muted',
    previewLink: 'text-sm text-primary flex items-center gap-1 truncate',
  },
})()

type LinkDialogProps = {
  isOpen: boolean
  onClose: () => void
  initialUrl?: string
  editor: LexicalEditor | null
}

function LinkDialog({ isOpen, onClose, initialUrl = '', editor }: LinkDialogProps) {
  const [url, setUrl] = useState(initialUrl)

  useEffect(() => {
    setUrl(initialUrl)
  }, [initialUrl])

  const handleSubmit = () => {
    if (!editor) return
    if (url.trim()) {
      let finalUrl = url.trim()
      // Add https:// if no protocol specified
      if (!/^https?:\/\//i.test(finalUrl) && !finalUrl.startsWith('/')) {
        finalUrl = `https://${finalUrl}`
      }
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, finalUrl)
    }
    onClose()
  }

  const handleRemove = () => {
    if (!editor) return
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    onClose()
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.overlay()} onClick={onClose}>
      <div className={styles.dialog()} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>リンクを挿入</h3>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton()}
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={styles.form()}>
          <div className={styles.field()}>
            <label className={styles.label()}>URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className={styles.input()}
              autoFocus
            />
          </div>

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.previewLink()}
            >
              <ExternalLink className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{url}</span>
            </a>
          )}

          <div className={styles.actions()}>
            {initialUrl && (
              <button
                type="button"
                onClick={handleRemove}
                className={`${styles.button()} text-destructive hover:bg-destructive/10`}
              >
                リンク解除
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`${styles.button()} ${styles.buttonSecondary()}`}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className={`${styles.button()} ${styles.buttonPrimary()}`}
            >
              {initialUrl ? '更新' : '挿入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Link Dialog Hook
 * Must be used within LexicalComposer
 */
export function useLinkDialog() {
  const [editor] = useLexicalComposerContext()
  const [isOpen, setIsOpen] = useState(false)
  const [initialUrl, setInitialUrl] = useState('')

  const openLinkDialog = () => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        const node = selection.anchor.getNode()
        const linkNode = $findMatchingParent(node, $isLinkNode)
        if ($isLinkNode(linkNode)) {
          setInitialUrl(linkNode.getURL())
        } else {
          setInitialUrl('')
        }
      }
    })
    setIsOpen(true)
  }

  const closeLinkDialog = () => {
    setIsOpen(false)
  }

  const LinkDialogComponent = () => (
    <LinkDialog
      isOpen={isOpen}
      onClose={closeLinkDialog}
      initialUrl={initialUrl}
      editor={editor}
    />
  )

  return {
    openLinkDialog,
    closeLinkDialog,
    LinkDialog: LinkDialogComponent,
  }
}

export function LinkPlugin() {
  // This plugin just enables link functionality
  // The actual UI is handled by useLinkDialog hook
  return null
}
