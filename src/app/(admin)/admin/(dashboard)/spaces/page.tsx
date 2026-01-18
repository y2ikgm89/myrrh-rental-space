import type { Metadata } from 'next'
import { SpaceManagementTabs } from './_components/SpaceManagementTabs'
import { SpaceTabContent } from './_components/SpaceTabContent'
import { LocationTabContent } from './_components/LocationTabContent'
import { CategoryTabContent } from './_components/CategoryTabContent'

export const metadata: Metadata = {
  title: 'スペース管理 | Myrrh Rental Space',
}

type SearchParams = Promise<{
  published?: string
  search?: string
  page?: string
  includeInactive?: string
  tab?: string
}>

type PageProps = {
  searchParams: SearchParams
}

export default async function SpacesPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div>
        <h1 className="text-2xl font-bold">スペース管理</h1>
        <p className="text-muted-foreground">
          スペース・場所・カテゴリーを一元管理します
        </p>
      </div>

      {/* タブコンテンツ */}
      <SpaceManagementTabs
        spacesContent={<SpaceTabContent searchParams={searchParams} />}
        locationsContent={<LocationTabContent searchParams={searchParams} />}
        categoriesContent={<CategoryTabContent searchParams={searchParams} />}
      />
    </div>
  )
}
