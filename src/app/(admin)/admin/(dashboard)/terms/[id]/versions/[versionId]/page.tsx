import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { formatDistanceToNow } from 'date-fns'
import { ja } from 'date-fns/locale'
import { getTermsById, getTermsVersionById } from '@/admin/actions/terms'
import { SanitizedHtml } from '@/admin/components/SanitizedHtml'
import { PROSE_CLASSES } from '@/shared/lib/styles/prose'
import { cn } from '@/shared/lib/utils'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Breadcrumb,
} from '@/admin/components/ui'
import Link from 'next/link'
import { AdminDetailLayout } from '@/admin/components/AdminDetailLayout'
import type { Metadata } from 'next'

type PageProps = {
  params: Promise<{ id: string; versionId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { id, versionId } = await params
  const [termsResult, versionResult] = await Promise.all([
    getTermsById(id),
    getTermsVersionById(versionId),
  ])

  if (
    !termsResult.success ||
    !termsResult.data ||
    !versionResult.success ||
    !versionResult.data
  ) {
    return { title: 'バージョンプレビュー | Myrrh Rental Space' }
  }

  return {
    title: `${termsResult.data.title} v${versionResult.data.version} | 規約管理 | Myrrh Rental Space`,
  }
}

export default async function VersionPreviewPage({ params }: PageProps) {
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

  const terms = termsResult.data
  const version = versionResult.data

  const getStatusBadge = () => {
    if (version.isCurrentVersion) {
      return <Badge className="bg-success">現在のバージョン</Badge>
    }

    switch (version.status) {
      case 'DRAFT':
        return <Badge variant="outline">下書き</Badge>
      case 'PUBLISHED':
        return <Badge variant="secondary">公開済み</Badge>
      case 'ARCHIVED':
        return (
          <Badge variant="secondary" className="opacity-60">
            アーカイブ
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <AdminDetailLayout
      backHref={`/admin/terms/${id}`}
      backLabel="詳細に戻る"
      title={`バージョン ${version.version} プレビュー`}
      subtitle={terms.title}
      actions={
        version.status === 'DRAFT' ? (
          <Button variant="outline" asChild>
            <Link href={`/admin/terms/${id}/versions/${versionId}/edit`}>編集</Link>
          </Button>
        ) : undefined
      }
    >
      <Breadcrumb
        items={[
          { label: '利用規約', href: '/admin/terms' },
          { label: terms.title, href: `/admin/terms/${id}` },
          { label: `バージョン ${version.version}` },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            バージョン {version.version}
            {getStatusBadge()}
          </CardTitle>
          <CardDescription>
            作成:{' '}
            {formatDistanceToNow(new Date(version.createdAt), {
              addSuffix: true,
              locale: ja,
            })}
            {version.publishedAt && (
              <>
                {' '}
                · 公開:{' '}
                {formatDistanceToNow(new Date(version.publishedAt), {
                  addSuffix: true,
                  locale: ja,
                })}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-6 bg-card">
            <SanitizedHtml
              html={version.contentHtml}
              className={cn(PROSE_CLASSES, 'prose-sm max-w-none')}
            />
          </div>
        </CardContent>
      </Card>
    </AdminDetailLayout>
  )
}
