import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getFaqItemById, getFaqCategories } from '@/admin/actions/faq'
import { FaqItemInlineEditor } from '../../../_components/FaqItemInlineEditor'
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: '質問編集 | FAQ管理 | Myrrh Rental Space',
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function EditFaqItemPage({ params }: PageProps) {
  await headers();
  const { id } = await params
  const [item, { categories }] = await Promise.all([
    getFaqItemById(id),
    getFaqCategories(),
  ])

  if (!item) {
    notFound()
  }

  return (
    <FaqItemInlineEditor
      item={item}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      mode="edit"
    />
  )
}
