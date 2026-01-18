import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getFaqItemById, getFaqCategories } from '@/admin/actions/faq'
import { FaqItemForm } from '../../../_components/FaqItemForm'

export const metadata: Metadata = {
  title: '質問編集 | FAQ管理 | Myrrh Rental Space',
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function EditFaqItemPage({ params }: PageProps) {
  const { id } = await params
  const [item, { categories }] = await Promise.all([
    getFaqItemById(id),
    getFaqCategories(),
  ])

  if (!item) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">質問編集</h1>
        <p className="text-muted-foreground">FAQの質問を編集します</p>
      </div>

      <FaqItemForm
        item={item}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        mode="edit"
      />
    </div>
  )
}
