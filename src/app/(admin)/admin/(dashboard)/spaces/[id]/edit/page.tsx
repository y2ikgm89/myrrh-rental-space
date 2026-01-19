import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { connection } from 'next/server'
import { getSpaceById } from '@/admin/actions/space'
import { getActiveTermsForSelect } from '@/admin/actions/terms'
import { getPublishedLocations } from '@/admin/actions/location'
import { getActiveSpaceCategories } from '@/admin/actions/space-category'
import { SpaceForm } from '../../_components/SpaceForm'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'

type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const space = await getSpaceById(id)

  if (!space) {
    return {
      title: 'スペースが見つかりません | Myrrh Rental Space',
    }
  }

  return {
    title: `${space.name} 編集 | Myrrh Rental Space`,
  }
}

export default async function EditSpacePage({ params }: PageProps) {
  await connection()
  const { id } = await params
  const [space, availableTerms, locationsResult, categoriesResult] = await Promise.all([
    getSpaceById(id),
    getActiveTermsForSelect(),
    getPublishedLocations(),
    getActiveSpaceCategories(),
  ])

  if (!space) {
    notFound()
  }

  const availableLocations = locationsResult.success ? locationsResult.data : []
  const availableCategories = categoriesResult.success ? categoriesResult.data : []

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/spaces/${space.id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{space.name} の編集</h1>
          <p className="text-muted-foreground">スペース情報を編集します</p>
        </div>
      </div>

      {/* フォーム */}
      <SpaceForm
        space={space}
        mode="edit"
        availableTerms={availableTerms}
        availableLocations={availableLocations}
        availableCategories={availableCategories}
      />
    </div>
  )
}
