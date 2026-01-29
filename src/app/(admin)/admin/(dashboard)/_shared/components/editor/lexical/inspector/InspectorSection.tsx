/**
 * Inspector Section
 *
 * @description 折りたたみ可能なセクション（Gutenberg PanelBody相当）
 */

'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

type InspectorSectionProps = {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export function InspectorSection({
  title,
  defaultOpen = true,
  children,
}: InspectorSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={toggleOpen}
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
      {isOpen && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  )
}
