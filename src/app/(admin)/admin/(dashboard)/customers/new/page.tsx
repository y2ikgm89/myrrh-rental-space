import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CustomerForm } from '../_components/CustomerForm'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '新規顧客 | Myrrh Rental Space',
}

export default function NewCustomerPage() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/customers">
            <ArrowLeft className="mr-2 h-4 w-4" />
            一覧に戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">新規顧客</h1>
          <p className="text-muted-foreground">
            新しい顧客情報を登録します
          </p>
        </div>
      </div>

      {/* フォーム */}
      <CustomerForm />
    </div>
  )
}
