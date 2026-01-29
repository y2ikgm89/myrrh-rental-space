'use client'

/**
 * News Inspector Panel
 *
 * ニュースセクションの設定編集パネル
 */

import type { HomepageSectionData } from '@/public/actions/homepage'
import { getNewsConfig } from '@/shared/lib/validations/homepage-section'
import { ListSectionInspectorPanel } from './ListSectionInspectorPanel'

type NewsInspectorPanelProps = {
  section: HomepageSectionData
}

export function NewsInspectorPanel({ section }: NewsInspectorPanelProps) {
  const config = getNewsConfig(section.config)

  return (
    <ListSectionInspectorPanel
      section={section}
      config={config}
      idPrefix="news"
      maxItemsLimit={10}
    />
  )
}
