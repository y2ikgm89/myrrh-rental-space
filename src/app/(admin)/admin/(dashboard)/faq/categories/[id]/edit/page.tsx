import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { getFaqCategoryById } from '@/admin/actions/faq'
import { FaqCategoryForm } from '../../../_components/FaqCategoryForm'
import { Button } from '@/admin/components/ui'

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
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/faq">
            <ArrowLeft className="mr-2 h-4 w-4" />
            一覧に戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">カテゴリ編集</h1>
          <p className="text-muted-foreground">
            「{category.name}」を編集します
          </p>
        </div>
      </div>

      <FaqCategoryForm category={category} mode="edit" />
    </div>
  )
}
