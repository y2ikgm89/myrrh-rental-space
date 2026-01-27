/**
 * 予約CTAコンポーネント
 *
 * @description 料金表示と予約ボタンを含むサイドバー
 */

import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { buttonVariants, Card, CardContent, CardHeader, CardTitle } from '@/public/components/ui'
import { cn, formatPrice } from '@/shared/lib/utils'
import {
  type TaxSettings,
  type TaxDisplayMode,
  getTaxRate,
  calculateTaxIncludedPrice,
  DEFAULT_TAX_SETTINGS,
} from '@/shared/lib/pricing'
import type { ReactElement } from 'react'

const styles = tv({
  slots: {
    container: 'sticky top-24',
    priceSection: 'space-y-4',
    priceItem: 'flex items-baseline justify-between',
    priceLabel: 'text-muted-foreground',
    priceValue: 'text-2xl font-bold text-foreground',
    priceUnit: 'text-sm font-normal text-muted-foreground',
    priceSubText: 'text-sm text-muted-foreground',
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
  taxSettings?: TaxSettings
  taxRateType?: 'standard' | 'reduced'
}

/**
 * 価格表示をフォーマット
 */
function formatPriceDisplay(
  price: number,
  taxRate: number,
  displayMode: TaxDisplayMode
): { main: string; sub?: string } {
  const taxIncluded = calculateTaxIncludedPrice(price, taxRate)

  switch (displayMode) {
    case 'tax_included':
      return { main: formatPrice(taxIncluded) }
    case 'tax_excluded':
      return { main: formatPrice(price), sub: '税抜' }
    case 'both':
    default:
      return {
        main: formatPrice(taxIncluded),
        sub: `税抜 ${formatPrice(price)}`,
      }
  }
}

export function ReservationCTA({
  spaceId,
  spaceName,
  hourlyPrice,
  dailyPrice,
  taxSettings = DEFAULT_TAX_SETTINGS,
  taxRateType = 'standard',
}: ReservationCTAProps): ReactElement {
  const displayMode = taxSettings.displayModePublic
  const taxRate = getTaxRate(taxRateType, taxSettings)
  const hourlyDisplay = formatPriceDisplay(hourlyPrice, taxRate, displayMode)
  const dailyDisplay = dailyPrice ? formatPriceDisplay(dailyPrice, taxRate, displayMode) : null

  // 表示モードに応じた注釈テキスト
  const taxNoteText =
    displayMode === 'tax_excluded'
      ? '※ 表示価格は税抜きです。'
      : displayMode === 'tax_included'
        ? '※ 表示価格は税込みです。'
        : '※ 価格は税込み表示です。括弧内は税抜き価格です。'

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
            <div className="text-right">
              <span className={styles.priceValue()}>
                {hourlyDisplay.main}
                <span className={styles.priceUnit()}>/時間</span>
              </span>
              {hourlyDisplay.sub && (
                <div className={styles.priceSubText()}>({hourlyDisplay.sub})</div>
              )}
            </div>
          </div>

          {/* 日額料金（設定されている場合） */}
          {dailyDisplay && (
            <div className={styles.priceItem()}>
              <span className={styles.priceLabel()}>日額料金</span>
              <div className="text-right">
                <span className={styles.priceValue()}>
                  {dailyDisplay.main}
                  <span className={styles.priceUnit()}>/日</span>
                </span>
                {dailyDisplay.sub && (
                  <div className={styles.priceSubText()}>({dailyDisplay.sub})</div>
                )}
              </div>
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
            {taxNoteText}
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
