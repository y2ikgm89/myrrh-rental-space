/**
 * Lexical EditorState JSON バリデーション
 *
 * @description JSON primary storage 用の Zod スキーマ
 */

import { z } from 'zod'

/**
 * Lexical EditorState JSON 文字列のバリデーション
 *
 * JSON.parse 可能で、root プロパティを持つことを検証
 */
export const lexicalJsonSchema = z.string().refine(
  (val) => {
    try {
      const parsed: unknown = JSON.parse(val)
      return (
        typeof parsed === 'object' &&
        parsed !== null &&
        'root' in parsed
      )
    } catch {
      return false
    }
  },
  { error: '有効なLexical EditorState JSONではありません' }
)
