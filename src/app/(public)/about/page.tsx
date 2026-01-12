/**
 * Aboutページ
 *
 * 企業・サービス紹介ページ
 *
 * Next.js 16 PPR対応:
 * - unstable_cache でキャッシュされた公開設定を使用
 */

import type { Metadata } from 'next'
import { Container, Section, SectionTitle } from '@/components/site/ui'
import { LocalBusinessJsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import { getPublicBusinessSettings } from '@/lib/settings'
import type { ReactElement } from 'react'

export const metadata: Metadata = {
  title: '私たちについて',
  description:
    'Myrrh Rental Spaceは、ビジネスからプライベートまで、様々な用途に対応したレンタルスペースを提供しています。',
}

export default async function AboutPage(): Promise<ReactElement> {
  const settings = await getPublicBusinessSettings()

  // 設定が取得できなかった場合はデフォルト値を使用
  const safeSettings = settings ?? {
    siteName: 'Myrrh Rental Space',
    siteDescription: null,
    businessName: null,
    businessNameKana: null,
    businessDescription: null,
    businessType: null,
    representativeName: null,
    establishedDate: null,
    registrationNumber: null,
    invoiceNumber: null,
    email: null,
    phoneNumber: null,
    address: null,
    postalCode: null,
    prefecture: null,
    city: null,
    streetAddress: null,
  }

  return (
    <>
      {/* JSON-LD構造化データ */}
      <LocalBusinessJsonLd
        name={safeSettings.businessName || safeSettings.siteName || 'Myrrh Rental Space'}
        description={safeSettings.businessDescription || safeSettings.siteDescription || undefined}
        telephone={safeSettings.phoneNumber || undefined}
        email={safeSettings.email || undefined}
        address={
          safeSettings.address
            ? {
                streetAddress: safeSettings.streetAddress || undefined,
                addressLocality: safeSettings.city || undefined,
                addressRegion: safeSettings.prefecture || undefined,
                postalCode: safeSettings.postalCode || undefined,
              }
            : undefined
        }
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: '私たちについて', url: '/about' },
        ]}
      />

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-20">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-4xl font-bold text-gray-900 md:text-5xl">
              私たちについて
            </h1>
            <p className="text-lg text-gray-600">
              {safeSettings.businessDescription ||
                'あなたの「やりたい」を実現する、理想のスペースを。'}
            </p>
          </div>
        </Container>
      </section>

      {/* Mission Section */}
      <Section>
        <Container>
          <div className="mx-auto max-w-3xl">
            <SectionTitle
              title="ミッション"
              subtitle="私たちが目指すもの"
              align="center"
            />
            <div className="mt-8 space-y-6 text-gray-600">
              <p>
                私たちは、すべての人が自分らしい活動ができる「場」を提供することを目指しています。
              </p>
              <p>
                会議、セミナー、ワークショップ、撮影、パーティーなど、
                様々なシーンで活用できるレンタルスペースを通じて、
                お客様の可能性を広げるお手伝いをいたします。
              </p>
              <p>
                快適で使いやすい空間と、きめ細やかなサポートで、
                あなたの大切なひとときを演出します。
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* Features Section */}
      <Section className="bg-gray-50">
        <Container>
          <SectionTitle
            title="サービスの特徴"
            subtitle="選ばれる理由"
            align="center"
          />
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <FeatureCard
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
              title="多様なスペース"
              description="用途やシーンに合わせて選べる、バリエーション豊かなスペースをご用意しています。"
            />
            <FeatureCard
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              title="柔軟な予約"
              description="1時間単位での予約が可能。短時間利用から1日利用まで、ニーズに合わせてご利用いただけます。"
            />
            <FeatureCard
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              }
              title="充実のサポート"
              description="ご利用前後のご質問やトラブルにも迅速に対応。安心してご利用いただけます。"
            />
          </div>
        </Container>
      </Section>

      {/* Company Info Section */}
      {(safeSettings.businessName || safeSettings.representativeName) && (
        <Section>
          <Container>
            <SectionTitle
              title="会社概要"
              subtitle="Company Information"
              align="center"
            />
            <div className="mx-auto mt-8 max-w-2xl">
              <dl className="divide-y divide-gray-200">
                {safeSettings.businessName && (
                  <InfoRow label="会社名" value={safeSettings.businessName} />
                )}
                {safeSettings.businessNameKana && (
                  <InfoRow label="フリガナ" value={safeSettings.businessNameKana} />
                )}
                {safeSettings.representativeName && (
                  <InfoRow label="代表者" value={safeSettings.representativeName} />
                )}
                {safeSettings.businessType && (
                  <InfoRow label="事業形態" value={safeSettings.businessType} />
                )}
                {safeSettings.establishedDate && (
                  <InfoRow
                    label="設立"
                    value={new Date(safeSettings.establishedDate).toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: 'long',
                    })}
                  />
                )}
                {safeSettings.address && (
                  <InfoRow label="所在地" value={safeSettings.address} />
                )}
                {safeSettings.phoneNumber && (
                  <InfoRow label="電話番号" value={safeSettings.phoneNumber} />
                )}
                {safeSettings.email && (
                  <InfoRow label="メールアドレス" value={safeSettings.email} />
                )}
                {safeSettings.registrationNumber && (
                  <InfoRow label="登録番号" value={safeSettings.registrationNumber} />
                )}
                {safeSettings.invoiceNumber && (
                  <InfoRow label="インボイス番号" value={safeSettings.invoiceNumber} />
                )}
              </dl>
            </div>
          </Container>
        </Section>
      )}
    </>
  )
}

interface FeatureCardProps {
  icon: ReactElement
  title: string
  description: string
}

function FeatureCard({ icon, title, description }: FeatureCardProps): ReactElement {
  return (
    <div className="rounded-lg bg-white p-6 shadow-sm">
      <div className="mb-4 inline-flex rounded-lg bg-primary-100 p-3 text-primary-600">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  )
}

interface InfoRowProps {
  label: string
  value: string
}

function InfoRow({ label, value }: InfoRowProps): ReactElement {
  return (
    <div className="flex py-4">
      <dt className="w-32 flex-shrink-0 font-medium text-gray-900">{label}</dt>
      <dd className="text-gray-600">{value}</dd>
    </div>
  )
}
