import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { getSpaceById } from '@/admin/actions/space'
import { getActiveTermsForSelect } from '@/admin/actions/terms'
import { getPublishedLocations } from '@/admin/actions/location'
import { getActiveSpaceCategories } from '@/admin/actions/space-category'
import { getTaxSettings } from '@/admin/actions/settings'
import { SpaceInlineEditor } from '../../_components/SpaceInlineEditor'
import type { Metadata } from 'next'


type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
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
  const [space, availableTerms, locationsResult, categoriesResult, taxSettings] = await Promise.all([
    getSpaceById(id),
    getActiveTermsForSelect(),
    getPublishedLocations(),
    getActiveSpaceCategories(),
    getTaxSettings(),
  ])

  if (!space) {
    notFound()
  }

  const availableLocations = locationsResult.success ? locationsResult.data : []
  const availableCategories = categoriesResult.success ? categoriesResult.data : []

  return (
    <SpaceInlineEditor
      space={space}
      mode="edit"
      availableTerms={availableTerms}
      availableLocations={availableLocations}
      availableCategories={availableCategories}
      taxSettings={taxSettings}
    />
  )
}
