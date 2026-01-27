import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ja } from 'date-fns/locale'
import { getTermsById, getTermsVersionById } from '@/admin/actions/terms'
import { SanitizedHtml } from '@/shared/components/SanitizedHtml'
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
} from '@/admin/components/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'バージョンプレビュー | Myrrh Rental Space',
}

interface VersionPreviewPageProps {
  params: Promise<{ id: string; versionId: string }>
}

export default async function VersionPreviewPage({
  params,
}: VersionPreviewPageProps) {
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
      return <Badge className="bg-green-600">現在のバージョン</Badge>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            バージョン {version.version} プレビュー
          </h1>
          <p className="text-muted-foreground">{terms.title}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/terms/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            戻る
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
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
            </div>
            {version.status === 'DRAFT' && (
              <Button variant="outline" asChild>
                <Link
                  href={`/admin/terms/${id}/versions/${versionId}/edit`}
                >
                  編集
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-6 bg-white">
            <SanitizedHtml
              html={version.content}
              className={cn(PROSE_CLASSES, 'prose-sm max-w-none')}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
