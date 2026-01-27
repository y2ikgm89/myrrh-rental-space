/**
 * お問い合わせページ
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ページヘッダー（ビルド時にプリレンダリング）
 * - 動的コンテンツ: フォーム、ページコンテンツ、営業時間・連絡先（Suspenseでストリーミング）
 *
 * connection() を Suspense 内のコンポーネントで呼び出すことで、
 * 静的シェルを維持しながら動的データをリクエスト時にフェッチします。
 */

import { Suspense } from 'react'
import { connection } from 'next/server'
import type { Metadata } from 'next'
import { Container } from '@/public/components/ui/Container'
import { ContentRenderer } from '@/public/components/ContentRenderer'
import { ContactForm } from './_components/ContactForm'
import {
  getPublicSettings,
  getPageContent,
  getTurnstileSiteKey,
} from '@/public/actions/settings'
import { generatePageMetadata } from '@/public/lib/page-metadata'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('contact', {
    title: 'お問い合わせ',
    description:
      'レンタルスペースに関するお問い合わせはこちらから。ご質問・ご予約のご相談など、お気軽にお問い合わせください。',
  })
}

export default function ContactPage() {
  return (
    <section className="py-12 md:py-16 lg:py-20">
      <Container size="sm">
        {/* 静的シェル: ヘッダー */}
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

        {/* 動的コンテンツ: ページコンテンツ（Lexicalエディタ） */}
        <Suspense fallback={null}>
          <PageContent />
        </Suspense>

        {/* 動的コンテンツ: フォーム（Turnstile Site Key取得が必要） */}
        <Suspense fallback={<FormSkeleton />}>
          <ContactFormWrapper />
        </Suspense>

        {/* 動的コンテンツ: 連絡先情報 */}
        <Suspense fallback={<ContactInfoSkeleton />}>
          <ContactInfo />
        </Suspense>
      </Container>
    </section>
  )
}

async function PageContent() {
  // PPR: リクエスト時に実行されることを示す
  await connection()

  const pageContent = await getPageContent('contact')

  if (!pageContent?.content) {
    return null
  }

  return (
    <div className="mb-8">
      <ContentRenderer html={pageContent.content} />
    </div>
  )
}

/**
 * ContactFormのWrapper（Site Keyを取得してpropsで渡す）
 */
async function ContactFormWrapper() {
  // PPR: リクエスト時に実行されることを示す
  await connection()

  const turnstileSiteKey = await getTurnstileSiteKey()

  return <ContactForm turnstileSiteKey={turnstileSiteKey} />
}

function FormSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border bg-card p-6">
      <div className="mb-4 h-6 w-48 rounded bg-muted" />
      <div className="space-y-4">
        <div className="h-10 w-full rounded bg-muted" />
        <div className="h-10 w-full rounded bg-muted" />
        <div className="h-10 w-full rounded bg-muted" />
        <div className="h-32 w-full rounded bg-muted" />
        <div className="h-10 w-full rounded bg-muted" />
      </div>
    </div>
  )
}

type DayOfWeekKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

const DAYS_OF_WEEK: ReadonlyArray<{ key: DayOfWeekKey; label: string }> = [
  { key: 'monday', label: '月曜日' },
  { key: 'tuesday', label: '火曜日' },
  { key: 'wednesday', label: '水曜日' },
  { key: 'thursday', label: '木曜日' },
  { key: 'friday', label: '金曜日' },
  { key: 'saturday', label: '土曜日' },
  { key: 'sunday', label: '日曜日' },
]

async function ContactInfo() {
  // PPR: リクエスト時に実行されることを示す
  await connection()

  const settings = await getPublicSettings()

  const addressParts = [
    settings.postalCode ? `〒${settings.postalCode}` : null,
    settings.prefecture,
    settings.city,
    settings.streetAddress,
    settings.buildingName,
  ].filter(Boolean)
  const fullAddress =
    addressParts.length > 0 ? addressParts.join(' ') : settings.address

  const businessHoursDisplay = settings.businessHours
    ? DAYS_OF_WEEK.map(({ key, label }) => {
        const day = settings.businessHours?.[key]
        if (!day) return null

        const content =
          day.isOpen && day.slots.length > 0 ? (
            day.slots.map((slot) => `${slot.openTime} - ${slot.closeTime}`).join(' / ')
          ) : (
            <span className="text-muted-foreground">休業</span>
          )

        return (
          <div key={key} className="flex justify-between">
            <span>{label}</span>
            <span>{content}</span>
          </div>
        )
      }).filter(Boolean)
    : null

  const hasContactInfo =
    businessHoursDisplay ||
    settings.holidayNotice ||
    settings.phoneNumber ||
    settings.faxNumber ||
    settings.email ||
    fullAddress

  if (!hasContactInfo) {
    return null
  }

  return (
    <div className="mt-12 rounded-lg border bg-muted/50 p-6">
      <h2 className="mb-4 text-lg font-semibold">その他のお問い合わせ方法</h2>
      <dl className="space-y-4 text-sm">
        {businessHoursDisplay && (
          <div>
            <dt className="mb-2 font-medium">営業時間</dt>
            <dd className="space-y-1 text-muted-foreground">
              {businessHoursDisplay}
            </dd>
          </div>
        )}

        {settings.holidayNotice && (
          <div>
            <dt className="font-medium">お知らせ</dt>
            <dd className="whitespace-pre-wrap text-muted-foreground">
              {settings.holidayNotice}
            </dd>
          </div>
        )}

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

        {settings.faxNumber && (
          <div>
            <dt className="font-medium">FAX</dt>
            <dd className="text-muted-foreground">{settings.faxNumber}</dd>
          </div>
        )}

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

        {fullAddress && (
          <div>
            <dt className="font-medium">所在地</dt>
            <dd className="text-muted-foreground">{fullAddress}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function ContactInfoSkeleton() {
  return (
    <div className="mt-12 animate-pulse rounded-lg border bg-muted/50 p-6">
      <div className="mb-4 h-6 w-48 rounded bg-muted" />
      <div className="space-y-4">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-4 w-1/2 rounded bg-muted" />
      </div>
    </div>
  )
}
