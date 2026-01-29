'use client'

/**
 * Section List
 *
 * ホームページセクションの選択リスト
 */

import { useCallback, useMemo, type MouseEvent } from 'react'
import {
  Sparkles,
  LayoutGrid,
  Newspaper,
  FileText,
  HelpCircle,
  MousePointerClick,
  Code,
  Instagram,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { HomepageSectionType, sectionTypeLabels } from '@/shared/lib/validations/homepage-section'
import type { HomepageSectionData } from '@/public/actions/homepage'

// =============================================================================
// Types
// =============================================================================

type SectionListProps = {
  sections: HomepageSectionData[]
  selectedSectionId: string | null
  onSelectSection: (section: HomepageSectionData) => void
}

// =============================================================================
// Icon Mapping
// =============================================================================

const sectionIcons: Record<HomepageSectionType, LucideIcon> = {
  [HomepageSectionType.HERO]: Sparkles,
  [HomepageSectionType.SPACE_LIST]: LayoutGrid,
  [HomepageSectionType.NEWS]: Newspaper,
  [HomepageSectionType.POST]: FileText,
  [HomepageSectionType.FAQ]: HelpCircle,
  [HomepageSectionType.CTA]: MousePointerClick,
  [HomepageSectionType.CUSTOM]: Code,
  [HomepageSectionType.INSTAGRAM]: Instagram,
}

// =============================================================================
// Component
// =============================================================================

export function SectionList({
  sections,
  selectedSectionId,
  onSelectSection,
}: SectionListProps) {
  // セクションIDからセクションへのマップを作成（O(1)ルックアップ）
  const sectionMap = useMemo(
    () => new Map(sections.map((s) => [s.id, s])),
    [sections]
  )

  // data-section-id属性を使用してクロージャーを回避
  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      const sectionId = e.currentTarget.dataset.sectionId
      if (sectionId) {
        const section = sectionMap.get(sectionId)
        if (section) {
          onSelectSection(section)
        }
      }
    },
    [sectionMap, onSelectSection]
  )

  return (
    <nav className="p-2">
      <ul className="space-y-1">
        {sections.map((section) => {
          const Icon = sectionIcons[section.type]
          const label = section.title ?? sectionTypeLabels[section.type]
          const isSelected = selectedSectionId === section.id

          return (
            <li key={section.id}>
              <button
                type="button"
                data-section-id={section.id}
                onClick={handleClick}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
                  'hover:bg-muted/50',
                  isSelected && 'bg-primary/10 text-primary font-medium'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
