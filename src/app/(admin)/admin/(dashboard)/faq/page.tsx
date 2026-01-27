import { Suspense } from 'react'
import Link from 'next/link'
import { getFaqCategories } from '@/admin/actions/faq'
import { FaqCategoryList } from './_components/FaqCategoryList'
import { Button } from '@/admin/components/ui'
import { LoadingState } from '@/admin/components/LoadingState'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'FAQ管理 | Myrrh Rental Space',
}

async function FaqContent() {
  const result = await getFaqCategories()

  return <FaqCategoryList categories={result.categories} />
}

export default function FaqPage() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">FAQ管理</h1>
          <p className="text-muted-foreground">
            よくある質問のカテゴリと質問を管理します
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/faq/categories/new">カテゴリ追加</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/faq/items/new">質問追加</Link>
          </Button>
        </div>
      </div>

      {/* FAQ一覧 */}
      <Suspense fallback={<LoadingState />}>
        <FaqContent />
      </Suspense>
    </div>
  )
}
