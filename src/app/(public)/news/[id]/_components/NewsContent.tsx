'use client'

/**
 * ニュースコンテンツ表示コンポーネント
 *
 * @description DOMPurify でサニタイズした HTML を安全に表示
 * @security DOMPurify でサニタイズ済みのコンテンツのみ挿入
 */

import { useMemo, type ReactElement } from 'react'
import DOMPurify from 'dompurify'

interface NewsContentProps {
  content: string
}

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'a',
  'blockquote',
  'code',
  'pre',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'div',
  'span',
]

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'class', 'target', 'rel']

export function NewsContent({ content }: NewsContentProps): ReactElement {
  // useMemo を使用してサニタイズ処理を最適化
  const sanitizedContent = useMemo(() => {
    if (typeof window === 'undefined') {
      return '' // サーバーサイドでは空文字を返す
    }
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
    })
  }, [content])

  // DOMPurify によりサニタイズ済みのコンテンツを安全に表示
  return (
    <div
      className="prose prose-slate max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  )
}
