import type { Metadata } from 'next'
import { getFaqCategories } from '@/admin/actions/faq'
import { FaqItemInlineEditor } from '../../_components/FaqItemInlineEditor'
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: '質問作成 | FAQ管理 | Myrrh Rental Space',
}

type SearchParams = Promise<{
  categoryId?: string
}>

type PageProps = {
  searchParams: SearchParams
}

export default async function NewFaqItemPage({ searchParams }: PageProps) {
  await headers();
  const params = await searchParams
  const { categories } = await getFaqCategories()

  return (
    <FaqItemInlineEditor
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      mode="create"
      defaultCategoryId={params.categoryId}
    />
  )
}
