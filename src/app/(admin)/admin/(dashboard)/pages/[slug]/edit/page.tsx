/**
 * ページ編集画面
 *
 * 統一ContentEditorでページを編集
 */

import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { getPageBySlug } from '@/admin/actions/page'
import { PageEditor } from '../../_components/PageEditor'
import type { Metadata } from 'next'
import type { ReactElement } from 'react'


type PageParams = Promise<{ slug: string }>

type PageProps = {
  params: PageParams
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { slug } = await params
  const page = await getPageBySlug(slug)

  return {
    title: page ? `${page.title}を編集` : 'ページ編集',
  }
}

export default async function EditPagePage({ params }: PageProps): Promise<ReactElement> {
  await connection()
  const { slug } = await params
  const page = await getPageBySlug(slug)

  if (!page) {
    notFound()
  }

  return <PageEditor page={page} />
}
