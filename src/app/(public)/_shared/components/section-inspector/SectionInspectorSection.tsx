'use client'

/**
 * Inspector Section
 *
 * 折りたたみ可能なセクション（Gutenberg PanelBody相当）
 * Lexicalインスペクターから流用
 */

import { useCallback, useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

type SectionInspectorSectionProps = {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export function SectionInspectorSection({
  title,
  defaultOpen = true,
  children,
}: SectionInspectorSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const contentId = useId()

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <span>{title}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      {isOpen && (
        <div id={contentId} className="px-4 pb-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}
