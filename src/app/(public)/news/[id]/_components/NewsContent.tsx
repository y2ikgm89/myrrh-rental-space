'use client'

/**
 * ニュースコンテンツ表示コンポーネント
 *
 * @description DOMPurify でサニタイズした HTML を安全に表示
 * @security DOMPurify でサニタイズ済みのコンテンツのみ挿入
 *           iframe は信頼できるドメイン（YouTube等）のみ許可
 */

import { useEffect, useRef, type ReactElement } from 'react'
import DOMPurify from 'dompurify'
import { ENHANCED_PROSE_CLASSES } from '@/lib/styles/prose'

interface NewsContentProps {
  content: string
}

// 信頼できるiframeホスト（YouTube等）
const TRUSTED_IFRAME_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
]

const ALLOWED_TAGS = [
  // テキスト
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'sub',
  'sup',
  'mark',
  // 見出し
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  // リスト
  'ul',
  'ol',
  'li',
  // リンク・引用
  'a',
  'blockquote',
  // コード
  'code',
  'pre',
  // メディア
  'img',
  'iframe',
  // テーブル
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  // 構造
  'div',
  'span',
  'hr',
  // タスクリスト
  'input',
  'label',
]

const ALLOWED_ATTR = [
  'href',
  'src',
  'alt',
  'title',
  'class',
  'target',
  'rel',
  // iframe用
  'width',
  'height',
  'frameborder',
  'allow',
  'allowfullscreen',
  // テーブル用
  'colspan',
  'rowspan',
  // チェックボックス用
  'type',
  'checked',
  'disabled',
  // スタイル
  'style',
]

export function NewsContent({ content }: NewsContentProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  // クライアントサイドでDOMを直接更新（hydration mismatch回避、React Compiler互換）
  // Security: DOMPurifyでサニタイズ済みのHTMLのみ挿入
  useEffect(() => {
    if (!containerRef.current) return

    // iframeのURLを検証するフック（信頼できるドメインのみ許可）
    DOMPurify.addHook('uponSanitizeElement', (node, data) => {
      if (data.tagName === 'iframe' && node instanceof Element) {
        const src = node.getAttribute('src')
        if (src) {
          try {
            const url = new URL(src)
            if (!TRUSTED_IFRAME_HOSTS.includes(url.host)) {
              node.remove()
            }
          } catch {
            node.remove()
          }
        } else {
          node.remove()
        }
      }
    })

    // DOMPurifyでサニタイズ（XSS対策）
    const sanitized = DOMPurify.sanitize(content, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder'],
    })

    // フックをクリーンアップ
    DOMPurify.removeAllHooks()

    // サニタイズ済みのHTMLを挿入
    containerRef.current.innerHTML = sanitized
  }, [content])

  return (
    <div
      ref={containerRef}
      className={ENHANCED_PROSE_CLASSES}
    />
  )
}
