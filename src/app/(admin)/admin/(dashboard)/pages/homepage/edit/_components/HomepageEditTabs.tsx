'use client'

/**
 * ホームページ編集タブ切替コンポーネント
 *
 * nuqs でURL状態管理（?tab=sections / ?tab=seo）
 * PageEditTabs と同構造。sections タブは HomepageTab、seo タブは PageSeoForm。
 */

import { useQueryState, parseAsStringLiteral } from 'nuqs'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/admin/components/ui/tabs'
import { HomepageTab } from '@/app/(admin)/admin/(dashboard)/settings/_components/homepage/HomepageTab'
import { PageSeoForm } from '../../../[slug]/seo/_components/PageSeoForm'

// =============================================================================
// Types
// =============================================================================

const tabValues = ['sections', 'seo'] satisfies [string, ...string[]]

interface PageSeoData {
  slug: string
  title: string
  metaDescription: string | null
  metaKeywords: string | null
  ogpTitle: string | null
  ogpDescription: string | null
  ogpImageUrl: string | null
}

interface HomepageEditTabsProps {
  isInstagramConnected: boolean
  page: PageSeoData
}

// =============================================================================
// Component
// =============================================================================

export function HomepageEditTabs({ isInstagramConnected, page }: HomepageEditTabsProps) {
  const [activeTab, setActiveTab] = useQueryState(
    'tab',
    parseAsStringLiteral(tabValues).withDefault('sections')
  )

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="mb-2">
        <TabsTrigger value="sections">セクション</TabsTrigger>
        <TabsTrigger value="seo">SEO</TabsTrigger>
      </TabsList>
      <TabsContent value="sections">
        <HomepageTab isInstagramConnected={isInstagramConnected} />
      </TabsContent>
      <TabsContent value="seo">
        <PageSeoForm page={page} />
      </TabsContent>
    </Tabs>
  )
}
