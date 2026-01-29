'use client'

/**
 * Posts Inspector Panel
 *
 * ブログ投稿セクションの設定編集パネル
 */

import type { HomepageSectionData } from '@/public/actions/homepage'
import { getPostsConfig } from '@/shared/lib/validations/homepage-section'
import { ListSectionInspectorPanel } from './ListSectionInspectorPanel'

type PostsInspectorPanelProps = {
  section: HomepageSectionData
}

export function PostsInspectorPanel({ section }: PostsInspectorPanelProps) {
  const config = getPostsConfig(section.config)

  return (
    <ListSectionInspectorPanel
      section={section}
      config={config}
      idPrefix="posts"
      maxItemsLimit={10}
    />
  )
}
