import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { getTermsById } from '@/admin/actions/terms'
import { getSettings } from '@/admin/actions/settings'
import { AdminDetailLayout } from '@/admin/components/AdminDetailLayout'
import { TermsVersionForm } from '../../../_components/TermsVersionForm'
import type { Metadata } from 'next'
import type { BusinessInfo } from '@/shared/lib/terms-templates'

export const metadata: Metadata = {
  title: '新規バージョン作成 | Myrrh Rental Space',
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function NewTermsVersionPage({ params }: PageProps) {
  await connection()
  const { id } = await params
  const [termsResult, settings] = await Promise.all([getTermsById(id), getSettings()])

  if (!termsResult.success || !termsResult.data) {
    notFound()
  }

  const terms = termsResult.data

  const businessInfo: BusinessInfo = {
    businessName: settings?.businessName ?? null,
    email: settings?.email ?? null,
    phoneNumber: settings?.phoneNumber ?? null,
    postalCode: settings?.postalCode ?? null,
    prefecture: settings?.prefecture ?? null,
    city: settings?.city ?? null,
    streetAddress: settings?.streetAddress ?? null,
    buildingName: settings?.buildingName ?? null,
  }

  return (
    <AdminDetailLayout
      backHref={`/admin/terms/${id}`}
      backLabel="詳細に戻る"
      title="新しいバージョンを作成"
      subtitle={terms.title}
    >
      <TermsVersionForm
        termsId={id}
        termsType={terms.type}
        businessInfo={businessInfo}
        redirectTo={`/admin/terms/${id}`}
      />
    </AdminDetailLayout>
  )
}
