import Link from 'next/link'
import { connection } from 'next/server'
import { SpaceForm } from '../_components/SpaceForm'
import { Button } from '@/admin/components/ui'
import { getActiveTermsForSelect } from '@/admin/actions/terms'
import { getPublishedLocations } from '@/admin/actions/location'
import { getActiveSpaceCategories } from '@/admin/actions/space-category'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'スペース新規作成 | Myrrh Rental Space',
}

export default async function NewSpacePage() {
  await connection()
  const [availableTerms, locationsResult, categoriesResult] = await Promise.all([
    getActiveTermsForSelect(),
    getPublishedLocations(),
    getActiveSpaceCategories(),
  ])

  const availableLocations = locationsResult.success ? locationsResult.data : []
  const availableCategories = categoriesResult.success ? categoriesResult.data : []

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/spaces">← 戻る</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">スペース新規作成</h1>
          <p className="text-muted-foreground">
            新しいスペースを作成します
          </p>
        </div>
      </div>

      {/* フォーム */}
      <SpaceForm
        mode="create"
        availableTerms={availableTerms}
        availableLocations={availableLocations}
        availableCategories={availableCategories}
      />
    </div>
  )
}
