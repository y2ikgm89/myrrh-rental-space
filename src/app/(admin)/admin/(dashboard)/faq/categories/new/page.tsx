import type { Metadata } from 'next'
import { FaqCategoryForm } from '../../_components/FaqCategoryForm'

export const metadata: Metadata = {
  title: 'カテゴリ作成 | FAQ管理 | Myrrh Rental Space',
}

export default function NewFaqCategoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">カテゴリ作成</h1>
        <p className="text-muted-foreground">
          新しいFAQカテゴリを作成します
        </p>
      </div>

      <FaqCategoryForm mode="create" />
    </div>
  )
}
