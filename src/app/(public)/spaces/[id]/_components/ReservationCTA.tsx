/**
 * 予約CTAコンポーネント
 *
 * @description 料金表示と予約ボタンを含むサイドバー
 */

import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { buttonVariants, Card, CardContent, CardHeader, CardTitle } from '@/public/components/ui'
import { cn, formatPrice } from '@/shared/lib/utils'
import type { ReactElement } from 'react'

const styles = tv({
  slots: {
    container: 'sticky top-24',
    priceSection: 'space-y-4',
    priceItem: 'flex items-baseline justify-between',
    priceLabel: 'text-muted-foreground',
    priceValue: 'text-2xl font-bold text-foreground',
    priceUnit: 'text-sm font-normal text-muted-foreground',
    divider: 'border-t border-border',
    noteText: 'text-sm text-muted-foreground',
    contactLink: 'text-primary hover:underline',
  },
})()

interface ReservationCTAProps {
  spaceId: string
  spaceName: string
  hourlyPrice: number
  dailyPrice: number | null
}

export function ReservationCTA({
  spaceId,
  spaceName,
  hourlyPrice,
  dailyPrice,
}: ReservationCTAProps): ReactElement {
  return (
    <div className={styles.container()}>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">料金・予約</CardTitle>
        </CardHeader>
        <CardContent className={styles.priceSection()}>
          {/* 時間料金 */}
          <div className={styles.priceItem()}>
            <span className={styles.priceLabel()}>時間料金</span>
            <span className={styles.priceValue()}>
              {formatPrice(hourlyPrice)}
              <span className={styles.priceUnit()}>/時間</span>
            </span>
          </div>

          {/* 日額料金（設定されている場合） */}
          {dailyPrice && (
            <div className={styles.priceItem()}>
              <span className={styles.priceLabel()}>日額料金</span>
              <span className={styles.priceValue()}>
                {formatPrice(dailyPrice)}
                <span className={styles.priceUnit()}>/日</span>
              </span>
            </div>
          )}

          <div className={styles.divider()} />

          {/* 予約ボタン */}
          <Link
            href={`/reservation?spaceId=${spaceId}&spaceName=${encodeURIComponent(spaceName)}`}
            className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}
          >
            予約する
          </Link>

          {/* 補足 */}
          <p className={styles.noteText()}>
            ※ 料金は税込みです。
            <br />※ キャンセルポリシーは
            <Link href="/terms" className={styles.contactLink()}>
              利用規約
            </Link>
            をご確認ください。
          </p>

          <div className={styles.divider()} />

          {/* お問い合わせリンク */}
          <p className={styles.noteText()}>
            ご不明な点がございましたら、
            <Link href="/contact" className={styles.contactLink()}>
              お問い合わせ
            </Link>
            ください。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
