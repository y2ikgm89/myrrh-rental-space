/**
 * システムページSEO編集画面
 *
 * コンテンツはコードで実装されているシステムページの
 * SEO/OGP設定を編集するための画面
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getPageBySlug } from '@/admin/actions/page'
import { getSystemPageDefinition } from '@/admin/lib/validations/page'
import { Button } from '@/admin/components/ui'
import { PageSeoForm } from './_components/PageSeoForm'
import type { Metadata } from 'next'
import type { ReactElement } from 'react'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const page = await getPageBySlug(slug)

  return {
    title: page ? `SEO設定: ${page.title}` : 'SEO設定',
  }
}

export default async function PageSeoEditPage({ params }: PageProps): Promise<ReactElement> {
  const { slug } = await params
  const page = await getPageBySlug(slug)

  if (!page) {
    notFound()
  }

  const systemPageDef = getSystemPageDefinition(slug)

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/pages">
              <ArrowLeft className="h-4 w-4 mr-1" />
              戻る
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">SEO設定</h1>
            <p className="text-muted-foreground">
              /{slug} - {page.title}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/${slug}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-1" />
            プレビュー
          </a>
        </Button>
      </div>

      {/* 説明 */}
      {systemPageDef && !systemPageDef.isContentEditable && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          このページはシステムページです。コンテンツはコードで実装されているため、
          SEO/OGP設定のみ編集可能です。
        </div>
      )}

      {/* SEO編集フォーム */}
      <PageSeoForm page={page} />
    </div>
  )
}
