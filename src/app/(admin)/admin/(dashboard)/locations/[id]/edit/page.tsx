import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { connection } from 'next/server'
import { getLocationById } from '@/admin/actions/location'
import { LocationForm } from '../../_components/LocationForm'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'


type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { id } = await params
  const result = await getLocationById(id)

  if (!result.success || !result.data) {
    return {
      title: '場所が見つかりません | Myrrh Rental Space',
    }
  }

  return {
    title: `${result.data.name} 編集 | Myrrh Rental Space`,
  }
}

export default async function EditLocationPage({ params }: PageProps) {
  await connection();
  await connection()
  const { id } = await params
  const result = await getLocationById(id)

  if (!result.success || !result.data) {
    notFound()
  }

  const location = result.data

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/locations/${location.id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{location.name} の編集</h1>
          <p className="text-muted-foreground">場所情報を編集します</p>
        </div>
      </div>

      {/* フォーム */}
      <LocationForm location={location} mode="edit" />
    </div>
  )
}
