/**
 * 安全なHTML表示コンポーネント（Server Component）
 *
 * isomorphic-dompurifyでSSR/クライアント両方でサニタイズ
 * XSS攻撃を完全に防止
 */

import DOMPurify from 'isomorphic-dompurify'
import { cn } from '@/lib/utils'

// =============================================================================
// Types
// =============================================================================

interface SafeHtmlProps {
  html: string
  className?: string
}

// =============================================================================
// DOMPurify Configuration
// =============================================================================

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'blockquote',
  'pre',
  'code',
  'strong',
  'em',
  'del',
  's',
  'hr',
  'br',
  'span',
]

const ALLOWED_ATTR = ['href', 'src', 'alt', 'class', 'target', 'rel', 'title']

// =============================================================================
// Main Component
// =============================================================================

export function SafeHtml({ html, className }: SafeHtmlProps) {
  // isomorphic-dompurifyはSSR/クライアント両方で動作
  const sanitizedHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target', 'rel'],
  })

  return (
    <div
      className={cn(
        'prose prose-sm sm:prose-base lg:prose-lg max-w-none',
        'prose-headings:font-bold prose-headings:tracking-tight',
        'prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl',
        'prose-p:leading-relaxed prose-p:text-muted-foreground',
        'prose-a:text-primary prose-a:underline prose-a:underline-offset-4',
        'prose-blockquote:border-l-4 prose-blockquote:border-muted-foreground/30',
        'prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground',
        'prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5',
        'prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-muted prose-pre:rounded-lg prose-pre:p-4',
        'prose-img:rounded-lg prose-img:shadow-md',
        'prose-hr:border-border',
        'prose-strong:font-semibold',
        'prose-ul:list-disc prose-ol:list-decimal',
        'prose-li:text-muted-foreground',
        className
      )}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}
