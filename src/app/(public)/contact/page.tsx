import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { Container } from '@/components/site/ui/Container'
import { ContactForm } from './_components/ContactForm'
import { getSettings } from '@/actions/admin/settings'

export const metadata: Metadata = {
  title: 'お問い合わせ | Myrrh Rental Space',
  description:
    'レンタルスペースに関するお問い合わせはこちらから。ご質問・ご予約のご相談など、お気軽にお問い合わせください。',
}

const DAYS_OF_WEEK = [
  { key: 'monday', label: '月曜日' },
  { key: 'tuesday', label: '火曜日' },
  { key: 'wednesday', label: '水曜日' },
  { key: 'thursday', label: '木曜日' },
  { key: 'friday', label: '金曜日' },
  { key: 'saturday', label: '土曜日' },
  { key: 'sunday', label: '日曜日' },
] as const

export default async function ContactPage(): Promise<ReactElement> {
  const settings = await getSettings()

  // 住所の組み立て
  const addressParts = [
    settings.postalCode ? `〒${settings.postalCode}` : null,
    settings.prefecture,
    settings.city,
    settings.streetAddress,
    settings.buildingName,
  ].filter(Boolean)
  const fullAddress = addressParts.length > 0 ? addressParts.join(' ') : settings.address

  // 営業時間のフォーマット
  const formatBusinessHours = (): ReactElement[] | null => {
    if (!settings.businessHours) return null

    const hours = settings.businessHours
    const lines: ReactElement[] = []

    for (const { key, label } of DAYS_OF_WEEK) {
      const day = hours[key]
      if (day) {
        if (day.isOpen && day.openTime && day.closeTime) {
          lines.push(
            <div key={key} className="flex justify-between">
              <span>{label}</span>
              <span>{day.openTime} - {day.closeTime}</span>
            </div>
          )
        } else {
          lines.push(
            <div key={key} className="flex justify-between">
              <span>{label}</span>
              <span className="text-muted-foreground">休業</span>
            </div>
          )
        }
      }
    }

    return lines.length > 0 ? lines : null
  }

  const businessHoursDisplay = formatBusinessHours()

  return (
    <section className="py-12 md:py-16 lg:py-20">
      <Container size="sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            お問い合わせ
          </h1>
          <p className="mt-4 text-muted-foreground">
            ご質問やご予約のご相談など、お気軽にお問い合わせください。
            <br />
            通常、2営業日以内にご返信いたします。
          </p>
        </div>

        <ContactForm />

        <div className="mt-12 rounded-lg border bg-muted/50 p-6">
          <h2 className="mb-4 text-lg font-semibold">その他のお問い合わせ方法</h2>
          <dl className="space-y-4 text-sm">
            {/* 営業時間 */}
            {businessHoursDisplay && (
              <div>
                <dt className="font-medium mb-2">営業時間</dt>
                <dd className="text-muted-foreground space-y-1">
                  {businessHoursDisplay}
                </dd>
              </div>
            )}

            {/* 休業日のお知らせ */}
            {settings.holidayNotice && (
              <div>
                <dt className="font-medium">お知らせ</dt>
                <dd className="text-muted-foreground whitespace-pre-wrap">
                  {settings.holidayNotice}
                </dd>
              </div>
            )}

            {/* 電話番号 */}
            {settings.phoneNumber && (
              <div>
                <dt className="font-medium">電話番号</dt>
                <dd className="text-muted-foreground">
                  <a
                    href={`tel:${settings.phoneNumber}`}
                    className="text-primary hover:underline"
                  >
                    {settings.phoneNumber}
                  </a>
                </dd>
              </div>
            )}

            {/* FAX */}
            {settings.faxNumber && (
              <div>
                <dt className="font-medium">FAX</dt>
                <dd className="text-muted-foreground">
                  {settings.faxNumber}
                </dd>
              </div>
            )}

            {/* メールアドレス */}
            {settings.email && (
              <div>
                <dt className="font-medium">メールアドレス</dt>
                <dd className="text-muted-foreground">
                  <a
                    href={`mailto:${settings.email}`}
                    className="text-primary hover:underline"
                  >
                    {settings.email}
                  </a>
                </dd>
              </div>
            )}

            {/* 住所 */}
            {fullAddress && (
              <div>
                <dt className="font-medium">所在地</dt>
                <dd className="text-muted-foreground">
                  {fullAddress}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </Container>
    </section>
  )
}
