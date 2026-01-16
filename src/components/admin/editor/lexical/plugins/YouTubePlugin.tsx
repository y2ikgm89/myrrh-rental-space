/**
 * YouTube Plugin
 *
 * YouTube動画の挿入機能
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
import { X, Youtube } from 'lucide-react'
import {
  $createYouTubeNode,
  YouTubeNode,
  extractYouTubeVideoId,
} from '../nodes'

const styles = tv({
  slots: {
    overlay: 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center',
    dialog: 'bg-popover rounded-lg shadow-lg p-4 w-full max-w-lg',
    header: 'flex items-center justify-between mb-4',
    title: 'text-lg font-semibold',
    closeButton: 'p-1 rounded-md hover:bg-muted',
    form: 'space-y-4',
    field: 'space-y-1.5',
    label: 'text-sm font-medium',
    input: 'w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary',
    hint: 'text-xs text-muted-foreground',
    preview: 'mt-4 aspect-video rounded-lg overflow-hidden border bg-black',
    actions: 'flex justify-end gap-2 mt-4',
    button: 'px-4 py-2 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    buttonSecondary: 'border hover:bg-muted',
    error: 'text-sm text-destructive',
  },
})()

export const INSERT_YOUTUBE_COMMAND: LexicalCommand<{
  videoId: string
}> = createCommand('INSERT_YOUTUBE_COMMAND')

type YouTubeDialogProps = {
  isOpen: boolean
  onClose: () => void
}

function YouTubeDialog({ isOpen, onClose }: YouTubeDialogProps) {
  const [editor] = useLexicalComposerContext()
  const [url, setUrl] = useState('')
  const [videoId, setVideoId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleUrlChange = (value: string) => {
    setUrl(value)
    setError('')

    if (!value.trim()) {
      setVideoId(null)
      return
    }

    const id = extractYouTubeVideoId(value)
    if (id) {
      setVideoId(id)
    } else {
      setVideoId(null)
      if (value.trim()) {
        setError('有効なYouTube URLを入力してください')
      }
    }
  }

  const handleSubmit = () => {
    if (videoId) {
      editor.dispatchCommand(INSERT_YOUTUBE_COMMAND, { videoId })
      onClose()
      setUrl('')
      setVideoId(null)
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.overlay()} onClick={onClose}>
      <div className={styles.dialog()} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>
            <Youtube className="w-5 h-5 inline mr-2 text-red-500" />
            YouTube動画を挿入
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

        <div className={styles.form()}>
          <div className={styles.field()}>
            <label className={styles.label()}>YouTube URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className={styles.input()}
              autoFocus
            />
            <p className={styles.hint()}>
              YouTube動画のURL、共有リンク、または動画IDを入力
            </p>
            {error && <p className={styles.error()}>{error}</p>}
          </div>

          {videoId && (
            <div className={styles.preview()}>
              <iframe
                src={`https://www.youtube.com/embed/${videoId}`}
                title="YouTube video preview"
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
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
              type="button"
              onClick={handleSubmit}
              disabled={!videoId}
              className={`${styles.button()} ${styles.buttonPrimary()} disabled:opacity-50`}
            >
              挿入
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function useYouTubeDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openYouTubeDialog = () => {
    setIsOpen(true)
  }

  const closeYouTubeDialog = () => {
    setIsOpen(false)
  }

  const YouTubeDialogComponent = () => (
    <YouTubeDialog isOpen={isOpen} onClose={closeYouTubeDialog} />
  )

  return {
    openYouTubeDialog,
    closeYouTubeDialog,
    YouTubeDialog: YouTubeDialogComponent,
  }
}

export function YouTubePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([YouTubeNode])) {
      throw new Error('YouTubePlugin: YouTubeNode not registered on editor')
    }

    return mergeRegister(
      editor.registerCommand(
        INSERT_YOUTUBE_COMMAND,
        (payload) => {
          const youtubeNode = $createYouTubeNode(payload.videoId)

          $insertNodes([youtubeNode])
          if ($isRootOrShadowRoot(youtubeNode.getParentOrThrow())) {
            $wrapNodeInElement(youtubeNode, $createParagraphNode).selectEnd()
          }

          return true
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
  }, [editor])

  return null
}
