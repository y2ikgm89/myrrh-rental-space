import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getTermsById, getTermsVersionById } from '@/admin/actions/terms'
import { TermsVersionForm } from '../../../../_components/TermsVersionForm'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'バージョン編集 | Myrrh Rental Space',
}

interface EditVersionPageProps {
  params: Promise<{ id: string; versionId: string }>
}

export default async function EditVersionPage({ params }: EditVersionPageProps) {
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            バージョン {version.version} を編集
          </h1>
          <p className="text-muted-foreground">
            {termsResult.data.title}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/admin/terms/${id}`}>戻る</Link>
        </Button>
      </div>

      <TermsVersionForm
        termsId={id}
        version={version}
        onSuccess={() => {
          // Client-side redirect will be handled by the form
        }}
      />
    </div>
  )
}
