/**
 * Word Count Plugin
 *
 * @description 文字数・読了目安を計算するプラグイン
 */

'use client'

import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot } from 'lexical'

// =============================================================================
// Types
// =============================================================================

export type WordCountData = {
  /** 文字数（空白除く） */
  charCount: number
  /** 文字数（空白込み） */
  charCountWithSpaces: number
  /** 読了目安（分） */
  readingTimeMinutes: number
}

// 日本語の平均読字速度: 約400-600文字/分（500で計算）
const CJK_CHARS_PER_MINUTE = 500

// =============================================================================
// Component
// =============================================================================

export function WordCountPlugin({
  onUpdate,
}: {
  onUpdate: (data: WordCountData) => void
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const text = $getRoot().getTextContent()
        const charCountWithSpaces = text.length
        const charCount = text.replace(/\s/g, '').length
        const readingTimeMinutes = Math.max(1, Math.ceil(charCount / CJK_CHARS_PER_MINUTE))

        onUpdate({ charCount, charCountWithSpaces, readingTimeMinutes })
      })
    })
  }, [editor, onUpdate])

  return null
}

// =============================================================================
// Hook
// =============================================================================

export function useWordCount() {
  const [data, setData] = useState<WordCountData>({
    charCount: 0,
    charCountWithSpaces: 0,
    readingTimeMinutes: 0,
  })

  return { wordCountData: data, updateWordCount: setData }
}
