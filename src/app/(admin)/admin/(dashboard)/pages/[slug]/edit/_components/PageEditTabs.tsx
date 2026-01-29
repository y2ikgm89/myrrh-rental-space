'use client'

/**
 * ページ編集コンポーネント
 *
 * セクション編集専用（レガシーコンテンツ編集は廃止）
 */

import Link from 'next/link'
import { ArrowLeft, Eye } from 'lucide-react'
import { Button } from '@/admin/components/ui'
import { PageSectionsManager } from '../../sections/_components/PageSectionsManager'
import type { PageSectionData } from '@/admin/actions/page-section'

// =============================================================================
// Types
// =============================================================================

interface PageWithSections {
  id: string
  slug: string
  title: string
  sections: PageSectionData[]
}

interface PageEditTabsProps {
  pageWithSections: PageWithSections
}

// =============================================================================
// Component
// =============================================================================

export function PageEditTabs({
  pageWithSections,
}: PageEditTabsProps) {
  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/pages">
              <ArrowLeft className="h-4 w-4 mr-2" />
              戻る
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{pageWithSections.title}</h1>
            <p className="text-sm text-muted-foreground">/{pageWithSections.slug}</p>
          </div>
        </div>

        {/* プレビューボタン */}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/${pageWithSections.slug}`} target="_blank">
            <Eye className="h-4 w-4 mr-2" />
            プレビュー
          </Link>
        </Button>
      </header>

      {/* セクション管理 */}
      <div className="flex-1 overflow-auto p-6">
        <PageSectionsManager
          pageId={pageWithSections.id}
          pageSlug={pageWithSections.slug}
        />
      </div>
    </div>
  )
}
