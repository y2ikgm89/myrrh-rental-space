import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSpaceById } from '@/admin/actions/space'
import { SpaceDetail } from './_components/SpaceDetail'
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
    title: `${space.name} | Myrrh Rental Space`,
  }
}

export default async function SpaceDetailPage({ params }: PageProps) {
  const { id } = await params
  const space = await getSpaceById(id)

  if (!space) {
    notFound()
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/spaces">← 戻る</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{space.name}</h1>
            <p className="text-muted-foreground">スペース詳細</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/spaces/${space.id}`} target="_blank">
              公開ページを見る
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/admin/spaces/${space.id}/edit`}>編集</Link>
          </Button>
        </div>
      </div>

      {/* 詳細 */}
      <SpaceDetail space={space} />
    </div>
  )
}
