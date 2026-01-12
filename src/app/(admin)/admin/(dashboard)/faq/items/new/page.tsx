import type { Metadata } from 'next'
import { getFaqCategories } from '@/actions/admin/faq'
import { FaqItemForm } from '../../_components/FaqItemForm'

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
  const params = await searchParams
  const { categories } = await getFaqCategories()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">質問作成</h1>
        <p className="text-muted-foreground">新しいFAQ質問を作成します</p>
      </div>

      <FaqItemForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        mode="create"
        defaultCategoryId={params.categoryId}
      />
    </div>
  )
}
