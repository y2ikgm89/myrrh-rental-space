import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getLocationById } from '@/admin/actions/location'
import { LocationDetail } from './_components/LocationDetail'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'

type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const result = await getLocationById(id)

  if (!result.success || !result.data) {
    return {
      title: '場所が見つかりません | Myrrh Rental Space',
    }
  }

  return {
    title: `${result.data.name} | Myrrh Rental Space`,
  }
}

export default async function LocationDetailPage({ params }: PageProps) {
  const { id } = await params
  const result = await getLocationById(id)

  if (!result.success || !result.data) {
    notFound()
  }

  const location = result.data

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/locations">
              <ArrowLeft className="mr-2 h-4 w-4" />
              一覧に戻る
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{location.name}</h1>
            <p className="text-muted-foreground">場所詳細</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/admin/locations/${location.id}/edit`}>編集</Link>
          </Button>
        </div>
      </div>

      {/* 詳細 */}
      <LocationDetail location={location} />
    </div>
  )
}
