import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { CouponForm } from '../_components/CouponForm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '新規クーポン作成 | Myrrh Rental Space',
}

export default function NewCouponPage() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <Link
          href="/admin/coupons"
          className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          クーポン一覧に戻る
        </Link>
        <h1 className="text-2xl font-bold">新規クーポン作成</h1>
        <p className="text-muted-foreground">
          新しいクーポンを作成します
        </p>
      </div>

      {/* フォーム */}
      <CouponForm />
    </div>
  )
}
