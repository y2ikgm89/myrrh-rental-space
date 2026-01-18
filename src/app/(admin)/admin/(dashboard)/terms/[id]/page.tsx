import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTermsById } from '@/admin/actions/terms'
import { TermsDetailView } from '../_components/TermsDetailView'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '規約詳細 | Myrrh Rental Space',
}

interface TermsDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function TermsDetailPage({ params }: TermsDetailPageProps) {
  const { id } = await params
  const result = await getTermsById(id)

  if (!result.success || !result.data) {
    notFound()
  }

  const terms = result.data

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{terms.title}</h1>
          <p className="text-muted-foreground">
            規約の編集とバージョン管理
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/terms">一覧に戻る</Link>
        </Button>
      </div>

      <TermsDetailView terms={terms} />
    </div>
  )
}
