/**
 * Table of Contents Plugin
 *
 * @description 目次ノードの挿入コマンドを登録するプラグイン
 */

'use client'

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  createCommand,
  COMMAND_PRIORITY_EDITOR,
  type LexicalCommand,
} from 'lexical'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import { $createTableOfContentsNode } from '../nodes/TableOfContentsNode'

export const INSERT_TOC_COMMAND: LexicalCommand<undefined> = createCommand('INSERT_TOC')

export function TableOfContentsPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      INSERT_TOC_COMMAND,
      () => {
        editor.update(() => {
          const tocNode = $createTableOfContentsNode()
          $insertNodeToNearestRoot(tocNode)
        })
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
}
