import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getTermsById, getTermsVersionById } from '@/admin/actions/terms'
import { AdminDetailLayout } from '@/admin/components/AdminDetailLayout'
import { TermsVersionForm } from '../../../../_components/TermsVersionForm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'バージョン編集 | Myrrh Rental Space',
}

type PageProps = {
  params: Promise<{ id: string; versionId: string }>
}

export default async function EditVersionPage({ params }: PageProps) {
  await connection()
  const { id, versionId } = await params

  const [termsResult, versionResult] = await Promise.all([
    getTermsById(id),
    getTermsVersionById(versionId),
  ])

  if (!termsResult.success || !termsResult.data) {
    notFound()
  }

  if (!versionResult.success || !versionResult.data) {
    notFound()
  }

  const version = versionResult.data

  // 公開済みバージョンは編集不可
  if (version.status !== 'DRAFT') {
    redirect(`/admin/terms/${id}`)
  }

  return (
    <AdminDetailLayout
      backHref={`/admin/terms/${id}/versions/${versionId}`}
      backLabel="詳細に戻る"
      title={`バージョン ${version.version} を編集`}
      subtitle={termsResult.data.title}
    >
      <TermsVersionForm
        termsId={id}
        termsType={termsResult.data.type}
        version={version}
        redirectTo={`/admin/terms/${id}/versions/${versionId}`}
      />
    </AdminDetailLayout>
  )
}
