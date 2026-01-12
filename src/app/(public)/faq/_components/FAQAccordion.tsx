'use client'

/**
 * FAQアコーディオンコンポーネント
 *
 * クライアントコンポーネントでアコーディオンのインタラクションを実装
 * リッチテキスト（HTML）の回答をサポート
 *
 * Security: DOMPurify を使用してXSS攻撃を防止
 */

import { useState } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import type { ReactElement } from 'react'

interface FAQItem {
  question: string
  answer: string  // HTML string (will be sanitized)
}

interface FAQAccordionProps {
  items: FAQItem[]
}

export function FAQAccordion({ items }: FAQAccordionProps): ReactElement {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
      {items.map((item, index) => {
        // DOMPurify でサニタイズしてXSS攻撃を防止
        const sanitizedAnswer = DOMPurify.sanitize(item.answer, {
          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre'],
          ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
        })

        return (
          <div key={index}>
            <button
              onClick={() => toggleItem(index)}
              className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-gray-50"
              aria-expanded={openIndex === index}
            >
              <span className="font-medium text-gray-900">{item.question}</span>
              <svg
                className={`h-5 w-5 flex-shrink-0 text-gray-500 transition-transform duration-200 ${
                  openIndex === index ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ${
                openIndex === index ? 'max-h-[1000px]' : 'max-h-0'
              }`}
            >
              <div
                className="px-6 pb-4 prose prose-sm max-w-none text-gray-600 prose-p:text-gray-600 prose-a:text-primary-600 prose-strong:text-gray-700"
                dangerouslySetInnerHTML={{ __html: sanitizedAnswer }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
