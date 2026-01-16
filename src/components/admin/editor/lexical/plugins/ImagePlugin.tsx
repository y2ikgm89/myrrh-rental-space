/**
 * Image Plugin
 *
 * 画像の挿入・編集機能
 */

'use client'

import { useEffect, useRef, useState } from 'react'
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
import { X, Upload, Link } from 'lucide-react'
import { $createImageNode, ImageNode } from '../nodes'

const styles = tv({
  slots: {
    overlay: 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center',
    dialog: 'bg-popover rounded-lg shadow-lg p-4 w-full max-w-lg',
    header: 'flex items-center justify-between mb-4',
    title: 'text-lg font-semibold',
    closeButton: 'p-1 rounded-md hover:bg-muted',
    tabs: 'flex border-b mb-4',
    tab: 'px-4 py-2 text-sm font-medium transition-colors -mb-px',
    tabActive: 'border-b-2 border-primary text-primary',
    tabInactive: 'text-muted-foreground hover:text-foreground',
    form: 'space-y-4',
    field: 'space-y-1.5',
    label: 'text-sm font-medium',
    input: 'w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary',
    dropzone: [
      'border-2 border-dashed rounded-lg p-8',
      'flex flex-col items-center justify-center gap-2',
      'cursor-pointer transition-colors',
      'hover:border-primary hover:bg-primary/5',
    ],
    dropzoneActive: 'border-primary bg-primary/10',
    preview: 'mt-4 rounded-lg overflow-hidden border',
    previewImage: 'w-full h-auto max-h-64 object-contain',
    actions: 'flex justify-end gap-2 mt-4',
    button: 'px-4 py-2 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    buttonSecondary: 'border hover:bg-muted',
  },
})()

export const INSERT_IMAGE_COMMAND: LexicalCommand<{
  src: string
  alt?: string
}> = createCommand('INSERT_IMAGE_COMMAND')

type ImageDialogProps = {
  isOpen: boolean
  onClose: () => void
}

function ImageDialog({ isOpen, onClose }: ImageDialogProps) {
  const [editor] = useLexicalComposerContext()
  const [activeTab, setActiveTab] = useState<'url' | 'upload'>('url')
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileReaderRef = useRef<FileReader | null>(null)
  const isMountedRef = useRef(true)

  // マウント状態を追跡し、FileReaderをクリーンアップ
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (fileReaderRef.current) {
        fileReaderRef.current.abort()
      }
    }
  }, [])

  const handleUrlChange = (value: string) => {
    setUrl(value)
    setPreviewUrl(value)
  }

  const handleFileSelect = async (file: File) => {
    // 既存のFileReaderをキャンセル
    if (fileReaderRef.current) {
      fileReaderRef.current.abort()
    }

    // In a real app, you would upload the file to a server
    // For now, we'll use a data URL for preview
    const reader = new FileReader()
    fileReaderRef.current = reader

    reader.onload = (e) => {
      // アンマウント後にsetStateしない
      if (!isMountedRef.current) return
      const dataUrl = e.target?.result as string
      setPreviewUrl(dataUrl)
      setUrl(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleSubmit = () => {
    if (url.trim()) {
      editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
        src: url.trim(),
        alt: alt.trim(),
      })
    }
    onClose()
    setUrl('')
    setAlt('')
    setPreviewUrl('')
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.overlay()} onClick={onClose}>
      <div className={styles.dialog()} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>画像を挿入</h3>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton()}
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={styles.tabs()}>
          <button
            type="button"
            className={`${styles.tab()} ${
              activeTab === 'url' ? styles.tabActive() : styles.tabInactive()
            }`}
            onClick={() => setActiveTab('url')}
          >
            <Link className="w-4 h-4 inline mr-1" />
            URL
          </button>
          <button
            type="button"
            className={`${styles.tab()} ${
              activeTab === 'upload' ? styles.tabActive() : styles.tabInactive()
            }`}
            onClick={() => setActiveTab('upload')}
          >
            <Upload className="w-4 h-4 inline mr-1" />
            アップロード
          </button>
        </div>

        <div className={styles.form()}>
          {activeTab === 'url' ? (
            <div className={styles.field()}>
              <label className={styles.label()}>画像URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className={styles.input()}
                autoFocus
              />
            </div>
          ) : (
            <div
              className={`${styles.dropzone()} ${
                isDragging ? styles.dropzoneActive() : ''
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                ドラッグ&ドロップ または クリックして選択
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={handleInputChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          )}

          <div className={styles.field()}>
            <label className={styles.label()}>代替テキスト（alt）</label>
            <input
              type="text"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="画像の説明"
              className={styles.input()}
            />
          </div>

          {previewUrl && (
            <div className={styles.preview()}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Editor handles external URLs */}
              <img
                src={previewUrl}
                alt={alt || 'プレビュー'}
                className={styles.previewImage()}
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
              disabled={!url.trim()}
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

export function useImageDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openImageDialog = () => {
    setIsOpen(true)
  }

  const closeImageDialog = () => {
    setIsOpen(false)
  }

  const ImageDialogComponent = () => (
    <ImageDialog isOpen={isOpen} onClose={closeImageDialog} />
  )

  return {
    openImageDialog,
    closeImageDialog,
    ImageDialog: ImageDialogComponent,
  }
}

export function ImagePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([ImageNode])) {
      throw new Error('ImagePlugin: ImageNode not registered on editor')
    }

    return mergeRegister(
      editor.registerCommand(
        INSERT_IMAGE_COMMAND,
        (payload) => {
          const imageNode = $createImageNode({
            src: payload.src,
            alt: payload.alt,
          })

          $insertNodes([imageNode])
          if ($isRootOrShadowRoot(imageNode.getParentOrThrow())) {
            $wrapNodeInElement(imageNode, $createParagraphNode).selectEnd()
          }

          return true
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
  }, [editor])

  return null
}
