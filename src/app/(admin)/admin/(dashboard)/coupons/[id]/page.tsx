import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { ChevronLeft } from 'lucide-react'
import { getCouponById } from '@/admin/actions/coupon'
import { CouponForm } from '../_components/CouponForm'
import { CouponDeleteButton } from './_components/CouponDeleteButton'
import { Card } from '@/admin/components/ui'
import { formatDateShort, formatPrice } from '@/shared/lib/utils'
import type { Metadata } from 'next'
import { headers } from "next/headers";

// 管理画面の動的ルートはビルド時プリレンダリングをスキップ

type PageProps = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { id } = await params
  const coupon = await getCouponById(id)

  if (!coupon) {
    return { title: 'クーポンが見つかりません | Myrrh Rental Space' }
  }

  return {
    title: `${coupon.code} の編集 | Myrrh Rental Space`,
  }
}

export default async function EditCouponPage({ params }: PageProps) {
  await headers();
  await connection()
  const { id } = await params
  const coupon = await getCouponById(id)

  if (!coupon) {
    notFound()
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/admin/coupons"
            className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            クーポン一覧に戻る
          </Link>
          <h1 className="text-2xl font-bold">
            <span className="font-mono">{coupon.code}</span> の編集
          </h1>
          <p className="text-muted-foreground">{coupon.name}</p>
        </div>

        <CouponDeleteButton couponId={coupon.id} couponCode={coupon.code} />
      </div>

      {/* 利用統計 */}
      <Card className="p-4">
        <h3 className="mb-3 font-medium">利用統計</h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">利用回数</p>
            <p className="text-2xl font-bold">
              {coupon.usageCount}
              {coupon.usageLimit && (
                <span className="text-sm font-normal text-muted-foreground">
                  {' '}/ {coupon.usageLimit}
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">割引タイプ</p>
            <p className="text-lg font-medium">
              {coupon.type === 'PERCENTAGE' ? `${coupon.discountValue}%` : formatPrice(coupon.discountValue)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">開始日</p>
            <p className="text-lg">{formatDateShort(coupon.validFrom)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">終了日</p>
            <p className="text-lg">
              {coupon.validUntil ? formatDateShort(coupon.validUntil) : '無期限'}
            </p>
          </div>
        </div>
      </Card>

      {/* フォーム */}
      <CouponForm coupon={coupon} />
    </div>
  )
}
