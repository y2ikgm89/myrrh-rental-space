'use client'

/**
 * ページセクション管理マネージャー
 *
 * セクション一覧とエディタの切り替えを管理
 */

import { useState } from 'react'
import { PageSectionList } from './PageSectionList'
import { PageSectionEditor } from './PageSectionEditor'
import type { PageSectionData } from '@/admin/actions/page-section'

interface PageSectionsManagerProps {
  pageId: string
  pageSlug: string
}

export function PageSectionsManager({
  pageId,
  pageSlug,
}: PageSectionsManagerProps) {
  const [editingSection, setEditingSection] = useState<PageSectionData | null>(null)

  if (editingSection) {
    return (
      <PageSectionEditor
        section={editingSection}
        onBack={() => setEditingSection(null)}
        onSave={() => setEditingSection(null)}
      />
    )
  }

  return (
    <PageSectionList
      pageId={pageId}
      pageSlug={pageSlug}
      onEditSection={setEditingSection}
    />
  )
}
