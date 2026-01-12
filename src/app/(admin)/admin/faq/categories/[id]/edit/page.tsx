import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getFaqCategoryById } from '@/actions/admin/faq'
import { FaqCategoryForm } from '../../../_components/FaqCategoryForm'

export const metadata: Metadata = {
  title: 'カテゴリ編集 | FAQ管理 | Myrrh Rental Space',
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function EditFaqCategoryPage({ params }: PageProps) {
  const { id } = await params
  const category = await getFaqCategoryById(id)

  if (!category) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">カテゴリ編集</h1>
        <p className="text-muted-foreground">
          「{category.name}」を編集します
        </p>
      </div>

      <FaqCategoryForm category={category} mode="edit" />
    </div>
  )
}
