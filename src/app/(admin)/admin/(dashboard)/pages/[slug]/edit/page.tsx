/**
 * ページ編集画面
 *
 * セクション編集画面を表示します。
 *
 * システムページ（about, faq, contact等）の場合、
 * Pageモデルが存在しなければ自動作成します。
 */

import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { ensureSystemPage } from '@/admin/actions/page'
import { getPageWithSections } from '@/admin/actions/page-section'
import { isSystemPageSlug } from '@/shared/lib/validations/page'
import { PageEditTabs } from './_components/PageEditTabs'
import type { Metadata } from 'next'
import type { ReactElement } from 'react'


type PageParams = Promise<{ slug: string }>

type PageProps = {
  params: PageParams
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { slug } = await params
  const pageWithSections = await getPageWithSections(slug)

  return {
    title: pageWithSections ? `${pageWithSections.title}を編集` : 'ページ編集',
  }
}

export default async function EditPagePage({ params }: PageProps): Promise<ReactElement> {
  await connection()
  const { slug } = await params

  // システムページの場合、存在しなければ自動作成（セクションも保証）
  if (isSystemPageSlug(slug)) {
    await ensureSystemPage(slug)
  }

  const pageWithSections = await getPageWithSections(slug)

  if (!pageWithSections) {
    notFound()
  }

  return <PageEditTabs pageWithSections={pageWithSections} />
}
