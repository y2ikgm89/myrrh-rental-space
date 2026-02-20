import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { getTermsById } from '@/admin/actions/terms'
import { getSettings } from '@/admin/actions/settings'
import { TermsDetailView } from '../_components/TermsDetailView'
import { AdminDetailLayout } from '@/admin/components/AdminDetailLayout'
import type { Metadata } from 'next'
import type { BusinessInfo } from '@/shared/lib/terms-templates'

type PageProps = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { id } = await params
  const result = await getTermsById(id)
  if (!result.success || !result.data) {
    return { title: '規約詳細 | Myrrh Rental Space' }
  }
  return {
    title: `${result.data.title} | 規約管理 | Myrrh Rental Space`,
  }
}

export default async function TermsDetailPage({ params }: PageProps) {
  await connection()
  const { id } = await params
  const [result, settings] = await Promise.all([getTermsById(id), getSettings()])

  if (!result.success || !result.data) {
    notFound()
  }

  const terms = result.data

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
    <AdminDetailLayout
      backHref="/admin/terms"
      title={terms.title}
      subtitle="規約の編集とバージョン管理"
    >
      <TermsDetailView terms={terms} businessInfo={businessInfo} />
    </AdminDetailLayout>
  )
}
