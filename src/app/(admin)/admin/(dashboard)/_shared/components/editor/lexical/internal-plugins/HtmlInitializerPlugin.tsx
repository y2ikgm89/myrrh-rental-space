/**
 * HTML Initializer Plugin
 *
 * @description HTMLコンテンツからエディタ初期状態を生成するプラグイン
 */

'use client'

import { useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $generateNodesFromDOM } from '@lexical/html'
import { $getRoot, $insertNodes, type LexicalEditor } from 'lexical'
import { logger } from '@/shared/lib/logger'

type HtmlInitializerPluginProps = {
  content?: string
  editorRef: React.MutableRefObject<LexicalEditor | null>
}

export function HtmlInitializerPlugin({
  content,
  editorRef,
}: HtmlInitializerPluginProps) {
  const [editor] = useLexicalComposerContext()
  const hasInitialized = useRef(false)

  useEffect(() => {
    editorRef.current = editor
  }, [editor, editorRef])

  useEffect(() => {
    if (hasInitialized.current || !content) return

    try {
      editor.update(() => {
        const parser = new DOMParser()
        const dom = parser.parseFromString(content, 'text/html')
        const nodes = $generateNodesFromDOM(editor, dom)
        const root = $getRoot()
        root.clear()
        $insertNodes(nodes)
      })
    } catch (error) {
      logger.error('Failed to initialize editor from HTML', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    hasInitialized.current = true
  }, [editor, content])

  return null
}
