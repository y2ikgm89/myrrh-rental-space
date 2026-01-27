import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTermsById } from '@/admin/actions/terms'
import { getSettings } from '@/admin/actions/settings'
import { TermsDetailView } from '../_components/TermsDetailView'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'
import type { BusinessInfo } from '@/shared/lib/terms-templates'

export const metadata: Metadata = {
  title: '規約詳細 | Myrrh Rental Space',
}

interface TermsDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function TermsDetailPage({ params }: TermsDetailPageProps) {
  const { id } = await params
  const [result, settings] = await Promise.all([
    getTermsById(id),
    getSettings(),
  ])

  if (!result.success || !result.data) {
    notFound()
  }

  const terms = result.data

  // 事業者情報を抽出
  const businessInfo: BusinessInfo = settings
    ? {
        businessName: settings.businessName,
        email: settings.email,
        phoneNumber: settings.phoneNumber,
        postalCode: settings.postalCode,
        prefecture: settings.prefecture,
        city: settings.city,
        streetAddress: settings.streetAddress,
        buildingName: settings.buildingName,
      }
    : {
        businessName: null,
        email: null,
        phoneNumber: null,
        postalCode: null,
        prefecture: null,
        city: null,
        streetAddress: null,
        buildingName: null,
      }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/terms">
            <ArrowLeft className="mr-2 h-4 w-4" />
            一覧に戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{terms.title}</h1>
          <p className="text-muted-foreground">
            規約の編集とバージョン管理
          </p>
        </div>
      </div>

      <TermsDetailView terms={terms} businessInfo={businessInfo} />
    </div>
  )
}
