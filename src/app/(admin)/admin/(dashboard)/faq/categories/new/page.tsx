import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { FaqCategoryForm } from '../../_components/FaqCategoryForm'
import { Button } from '@/admin/components/ui'

export const metadata: Metadata = {
  title: 'カテゴリ作成 | FAQ管理 | Myrrh Rental Space',
}

export default function NewFaqCategoryPage() {
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
          <h1 className="text-2xl font-bold">カテゴリ作成</h1>
          <p className="text-muted-foreground">
            新しいFAQカテゴリを作成します
          </p>
        </div>
      </div>

      <FaqCategoryForm mode="create" />
    </div>
  )
}
