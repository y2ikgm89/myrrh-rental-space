/**
 * Image Drop Plugin
 *
 * @description 画像のドラッグ&ドロップ・ペーストアップロードプラグイン
 */

'use client'

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $insertNodes,
  COMMAND_PRIORITY_HIGH,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  PASTE_COMMAND,
} from 'lexical'
import { toast } from 'sonner'
import { uploadMedia } from '@/admin/actions/media'
import { $createImageNode } from '../nodes/ImageNode'

// =============================================================================
// Utilities
// =============================================================================

function getImageFiles(dataTransfer: DataTransfer): File[] {
  const files: File[] = []
  for (let i = 0; i < dataTransfer.files.length; i++) {
    const file = dataTransfer.files[i]
    if (file && file.type.startsWith('image/')) {
      files.push(file)
    }
  }
  return files
}

// =============================================================================
// Component
// =============================================================================

export function ImageDropPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const handleImageUpload = async (files: File[]) => {
      const toastId = toast.loading('画像をアップロード中...')

      for (const file of files) {
        try {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('usage', 'POST')

          const result = await uploadMedia(formData)

          if (!result.success) {
            toast.error(result.error, { id: toastId })
            return
          }

          editor.update(() => {
            const imageNode = $createImageNode({
              src: result.data.url,
              alt: file.name.replace(/\.[^.]+$/, ''),
            })
            $insertNodes([imageNode])
          })
        } catch {
          toast.error('アップロード中にエラーが発生しました', { id: toastId })
          return
        }
      }

      toast.success('画像をアップロードしました', { id: toastId })
    }

    const removeDragOverCommand = editor.registerCommand(
      DRAGOVER_COMMAND,
      (event) => {
        const dataTransfer = event.dataTransfer
        if (!dataTransfer) return false

        const imageFiles = getImageFiles(dataTransfer)
        if (imageFiles.length > 0) {
          event.preventDefault()
          return true
        }
        return false
      },
      COMMAND_PRIORITY_HIGH
    )

    const removeDropCommand = editor.registerCommand(
      DROP_COMMAND,
      (event) => {
        const dataTransfer = event.dataTransfer
        if (!dataTransfer) return false

        const imageFiles = getImageFiles(dataTransfer)
        if (imageFiles.length > 0) {
          event.preventDefault()
          void handleImageUpload(imageFiles)
          return true
        }
        return false
      },
      COMMAND_PRIORITY_HIGH
    )

    const removePasteCommand = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const clipboardEvent = event instanceof ClipboardEvent ? event : null
        if (!clipboardEvent?.clipboardData) return false

        const imageFiles = getImageFiles(clipboardEvent.clipboardData)
        if (imageFiles.length > 0) {
          event.preventDefault()
          void handleImageUpload(imageFiles)
          return true
        }
        return false
      },
      COMMAND_PRIORITY_HIGH
    )

    return () => {
      removeDragOverCommand()
      removeDropCommand()
      removePasteCommand()
    }
  }, [editor])

  return null
}
