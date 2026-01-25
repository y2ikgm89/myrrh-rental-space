/**
 * Image Plugin
 *
 * @description 画像挿入ダイアログを提供するプラグイン
 */

'use client'

import { useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $insertNodes } from 'lexical'
import { MediaPickerDialog } from '@/admin/components/media-picker'
import { $createImageNode } from '../nodes/ImageNode'
import type { SelectedMedia } from '@/admin/types/media-picker'

// =============================================================================
// Types
// =============================================================================

type ImagePluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Component
// =============================================================================

export function ImagePlugin({ isOpen, onClose }: ImagePluginProps) {
  const [editor] = useLexicalComposerContext()

  const handleSelect = (media: SelectedMedia[]) => {
    if (media.length === 0) return

    editor.update(() => {
      const nodes = media.map((m) =>
        $createImageNode({
          src: m.url,
          alt: m.alt ?? '',
        })
      )
      $insertNodes(nodes)
    })

    onClose()
  }

  return (
    <MediaPickerDialog
      isOpen={isOpen}
      onClose={onClose}
      onSelect={handleSelect}
      selectionMode="single"
      defaultUsage="BLOG"
      showUrlTab
    />
  )
}

// =============================================================================
// Hook
// =============================================================================

/**
 * 画像ダイアログの状態管理フック
 */
export function useImageDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openImageDialog = () => {
    setIsOpen(true)
  }

  const closeImageDialog = () => {
    setIsOpen(false)
  }

  return {
    isImageDialogOpen: isOpen,
    openImageDialog,
    closeImageDialog,
  }
}
