import { CustomerForm } from '../_components/CustomerForm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '新規顧客 | Myrrh Rental Space',
}

export default function NewCustomerPage() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold">新規顧客</h1>
        <p className="text-muted-foreground">
          新しい顧客情報を登録します
        </p>
      </div>

      {/* フォーム */}
      <CustomerForm />
    </div>
  )
}
