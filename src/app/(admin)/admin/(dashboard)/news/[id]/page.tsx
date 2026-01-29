import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { getNewsById } from '@/admin/actions/news'
import { NewsEditor } from '../_components/NewsEditor'
import { getLayoutSettings } from '@/shared/lib/settings/public'
import type { Metadata } from 'next'


type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { id } = await params
  const news = await getNewsById(id)

  if (!news) {
    return {
      title: 'お知らせが見つかりません | Myrrh Rental Space',
    }
  }

  return {
    title: `${news.title} | お知らせ管理 | Myrrh Rental Space`,
  }
}

export default async function EditNewsPage({ params }: PageProps) {
  await connection()
  const { id } = await params

  const [news, layoutSettings] = await Promise.all([
    getNewsById(id),
    getLayoutSettings(),
  ])

  if (!news) {
    notFound()
  }

  return <NewsEditor news={news} mode="edit" layoutSettings={layoutSettings} />
}
