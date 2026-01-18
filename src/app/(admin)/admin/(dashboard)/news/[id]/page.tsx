import { notFound } from 'next/navigation'
import { getNewsById } from '@/admin/actions/news'
import { NewsInlineEditor } from '../_components/NewsInlineEditor'
import type { Metadata } from 'next'

type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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
  const { id } = await params
  const news = await getNewsById(id)

  if (!news) {
    notFound()
  }

  return <NewsInlineEditor news={news} />
}
