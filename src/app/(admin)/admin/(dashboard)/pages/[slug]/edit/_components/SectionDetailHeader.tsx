'use client'

/**
 * 右パネルのヘッダー（セクション名 + タイプバッジ）
 */

import { Badge } from '@/admin/components/ui'
import { sectionTypeLabels } from '@/shared/lib/validations/section'
import type { PageSectionData } from '@/admin/actions/page-section'
import { SectionTypeIcon } from '../../sections/_components/SectionTypeIcon'

interface SectionDetailHeaderProps {
  section: PageSectionData
}

export function SectionDetailHeader({ section }: SectionDetailHeaderProps) {
  const label = sectionTypeLabels[section.type]

  return (
    <div className="flex items-center gap-3 pb-4 border-b">
      <div className="p-2 rounded-md bg-primary/10">
        <SectionTypeIcon type={section.type} className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold truncate">
          {section.title || label}
        </h2>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <Badge variant={section.isActive ? 'default' : 'secondary'}>
        {section.isActive ? '表示中' : '非表示'}
      </Badge>
    </div>
  )
}
