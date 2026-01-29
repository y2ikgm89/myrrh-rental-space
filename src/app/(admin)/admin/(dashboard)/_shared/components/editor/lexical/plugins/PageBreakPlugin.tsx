/**
 * Page Break Plugin
 *
 * @description ページ区切りを挿入するプラグイン
 * コマンド登録のみ、ダイアログなし
 */

'use client'

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { createCommand, COMMAND_PRIORITY_EDITOR, $insertNodes } from 'lexical'
import { $createPageBreakNode } from '../nodes/PageBreakNode'

// =============================================================================
// Commands
// =============================================================================

export const INSERT_PAGE_BREAK_COMMAND = createCommand<void>('INSERT_PAGE_BREAK')

// =============================================================================
// Plugin
// =============================================================================

export function PageBreakPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      INSERT_PAGE_BREAK_COMMAND,
      () => {
        editor.update(() => {
          const pageBreakNode = $createPageBreakNode()
          $insertNodes([pageBreakNode])
        })
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
}
