import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSpaceById } from '@/actions/admin/space'
import { SpaceForm } from '../../_components/SpaceForm'
import { Button } from '@/components/admin/ui'
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
  const { id } = await params
  const space = await getSpaceById(id)

  if (!space) {
    notFound()
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/spaces/${space.id}`}>← 戻る</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{space.name} の編集</h1>
          <p className="text-muted-foreground">スペース情報を編集します</p>
        </div>
      </div>

      {/* フォーム */}
      <SpaceForm space={space} mode="edit" />
    </div>
  )
}
