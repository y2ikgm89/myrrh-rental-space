/**
 * ページ編集画面（マスターディテール レイアウト）
 *
 * 左: セクション一覧（DnD） + SEOリンク
 * 右: コンテンツ/デザイン設定パネル
 *
 * システムページ（about, faq, contact等）の場合、
 * Pageモデルが存在しなければ自動作成します。
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { ensureSystemPage } from '@/admin/actions/page'
import { getPageForEdit, getPageWithSections } from '@/admin/actions/page-section'
import { isSystemPageSlug } from '@/shared/lib/validations/page'
import { Button, Badge, Breadcrumb } from '@/admin/components/ui'
import { SectionMasterDetail } from './_components/SectionMasterDetail'
import { PublishToggle } from './_components/PublishToggle'
import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { headers } from "next/headers";


type PageParams = Promise<{ slug: string }>

type PageProps = {
  params: PageParams
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { slug } = await params
  const page = await getPageWithSections(slug)

  return {
    title: page ? `${page.title}を編集` : 'ページ編集',
  }
}

export default async function EditPagePage({ params }: PageProps): Promise<ReactElement> {
  await headers();
  await connection()
  const { slug } = await params

  // システムページの場合、存在しなければ自動作成（セクションも保証）
  if (isSystemPageSlug(slug)) {
    await ensureSystemPage(slug)
  }

  const page = await getPageForEdit(slug)

  if (!page) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'ページ管理', href: '/admin/pages' },
          { label: page.title },
        ]}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link href="/admin/pages">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{page.title}</h1>
              <Badge variant={page.isSystem ? 'secondary' : 'outline'}>
                {page.isSystem ? 'システム' : 'カスタム'}
              </Badge>
            </div>
            <p className="text-muted-foreground">/{slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!page.isSystem && (
            <PublishToggle slug={slug} isPublished={page.isPublished} />
          )}
          <Button asChild variant="outline" size="sm">
            <a href={`/${slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" />
              プレビュー
            </a>
          </Button>
        </div>
      </div>

      <SectionMasterDetail page={page} />
    </div>
  )
}
