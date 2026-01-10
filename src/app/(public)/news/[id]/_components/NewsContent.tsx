'use client'

/**
 * ニュースコンテンツ表示コンポーネント
 *
 * @description DOMPurify でサニタイズした HTML を安全に表示
 * @security DOMPurify でサニタイズ済みのコンテンツのみ挿入
 */

import { useEffect, useRef, type ReactElement } from 'react'
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
  const containerRef = useRef<HTMLDivElement>(null)

  // クライアントサイドでDOMを直接更新（hydration mismatch回避、React Compiler互換）
  // Note: innerHTML is safe here because content is sanitized by DOMPurify
  useEffect(() => {
    if (!containerRef.current) return

    const sanitized = DOMPurify.sanitize(content, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
    })
    containerRef.current.innerHTML = sanitized
  }, [content])

  // DOMPurify によりサニタイズ済みのコンテンツを安全に表示
  return (
    <div
      ref={containerRef}
      className="prose prose-slate max-w-none dark:prose-invert"
    />
  )
}
