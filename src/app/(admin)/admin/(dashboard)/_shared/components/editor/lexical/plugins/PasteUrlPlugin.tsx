'use client'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
} from 'lexical'
import { useEffect } from 'react'
import { INSERT_BOOKMARK_COMMAND } from './BookmarkPlugin'

const URL_PATTERN = /^https?:\/\/[^\s]+$/

export function PasteUrlPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const clipboardData =
          event instanceof ClipboardEvent ? event.clipboardData : null
        const text = clipboardData?.getData('text/plain')?.trim()

        if (!text || !URL_PATTERN.test(text)) return false

        let isEmptyParagraph = false
        editor.getEditorState().read(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return
          const node = selection.anchor.getNode()
          const parent = node.getParent()
          if (parent && $isRootOrShadowRoot(parent.getParent())) {
            isEmptyParagraph = node.getTextContent() === ''
          }
        })

        if (!isEmptyParagraph) return false

        editor.dispatchCommand(INSERT_BOOKMARK_COMMAND, { url: text })
        event.preventDefault()
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor])

  return null
}
