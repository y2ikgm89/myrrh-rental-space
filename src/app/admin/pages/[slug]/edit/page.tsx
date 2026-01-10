/**
 * ページ編集画面
 *
 * スラッグで指定されたページをTiptapエディタで編集
 */

import { notFound } from 'next/navigation'
import { getPageBySlug } from '@/actions/admin/page'
import { PageForm } from '../../_components/PageForm'
import type { Metadata } from 'next'
import type { ReactElement } from 'react'

type PageParams = Promise<{ slug: string }>

type PageProps = {
  params: PageParams
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const page = await getPageBySlug(slug)

  return {
    title: page ? `${page.title}を編集` : 'ページ編集',
  }
}

export default async function EditPagePage({ params }: PageProps): Promise<ReactElement> {
  const { slug } = await params
  const page = await getPageBySlug(slug)

  if (!page) {
    notFound()
  }

  return <PageForm page={page} />
}
