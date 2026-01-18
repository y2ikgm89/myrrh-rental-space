'use client'

/**
 * スペース管理タブコンポーネント
 *
 * スペース・場所・カテゴリーを1ページに統合
 * nuqs でURL状態管理（?tab=spaces|locations|categories）
 */

import { useQueryState } from 'nuqs'
import { parseAsStringLiteral } from 'nuqs'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/admin/components/ui/tabs'
import type { ReactNode } from 'react'

// =============================================================================
// 型定義
// =============================================================================

type TabValue = 'spaces' | 'locations' | 'categories'

const TAB_VALUES: [TabValue, ...TabValue[]] = ['spaces', 'locations', 'categories']

interface SpaceManagementTabsProps {
  spacesContent: ReactNode
  locationsContent: ReactNode
  categoriesContent: ReactNode
}

// =============================================================================
// コンポーネント
// =============================================================================

export function SpaceManagementTabs({
  spacesContent,
  locationsContent,
  categoriesContent,
}: SpaceManagementTabsProps) {
  const [activeTab, setActiveTab] = useQueryState(
    'tab',
    parseAsStringLiteral(TAB_VALUES).withDefault('spaces')
  )

  const handleTabChange = (value: string) => {
    if (TAB_VALUES.includes(value as TabValue)) {
      setActiveTab(value as TabValue)
    }
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="mb-6">
        <TabsTrigger value="spaces">スペース</TabsTrigger>
        <TabsTrigger value="locations">場所</TabsTrigger>
        <TabsTrigger value="categories">カテゴリー</TabsTrigger>
      </TabsList>

      <TabsContent value="spaces">{spacesContent}</TabsContent>
      <TabsContent value="locations">{locationsContent}</TabsContent>
      <TabsContent value="categories">{categoriesContent}</TabsContent>
    </Tabs>
  )
}
