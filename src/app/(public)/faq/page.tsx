/**
 * FAQページ
 *
 * よくある質問ページ（アコーディオンUI）
 * DBからFAQデータを取得して表示
 *
 * Next.js 16 PPR対応:
 * - use cache ディレクティブでデータ取得をキャッシュ
 */

import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import { Container, Section, SectionTitle } from '@/public/components/ui'
import { FAQPageJsonLd, BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { FAQAccordion } from './_components/FAQAccordion'
import { prisma } from '@/shared/lib/prisma'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import type { ReactElement } from 'react'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('faq', {
    title: 'よくある質問',
    description: 'Myrrh Rental Spaceのよくある質問をまとめています。ご予約、ご利用方法、キャンセルポリシーなど。',
  })
}

/**
 * FAQデータを取得（キャッシュ付き）
 */
async function getFaqData() {
  'use cache'
  cacheLife('hours')
  cacheTag('faq')

  const categories = await prisma.faqCategory.findMany({
    where: { isActive: true },
    include: {
      items: {
        where: { isActive: true },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { order: 'asc' },
  })

  return categories
}

/**
 * HTMLタグを除去してプレーンテキストを取得
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

/**
 * 動的コンテンツ: FAQリスト
 */
async function FAQContent(): Promise<ReactElement> {
  const categories = await getFaqData()

  // FAQPageJsonLd用にフラット化（HTMLタグを除去）
  const flatFaqItems = categories.flatMap((category) =>
    category.items.map((item) => ({
      question: item.question,
      answer: stripHtmlTags(item.answer),
    }))
  )

  // FAQが空の場合のフォールバック
  if (categories.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>現在、FAQは登録されていません。</p>
      </div>
    )
  }

  return (
    <>
      {/* JSON-LD構造化データ */}
      <FAQPageJsonLd items={flatFaqItems} />

      {/* FAQ Section */}
      <div className="mx-auto max-w-3xl">
        {categories.map((category) => (
          <div key={category.id} className="mb-12 last:mb-0">
            <SectionTitle title={category.name} align="left" />
            <div className="mt-6">
              <FAQAccordion
                items={category.items.map((item) => ({
                  question: item.question,
                  answer: item.answer,
                }))}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * ローディングUI
 */
function FAQLoading(): ReactElement {
  return (
    <div className="mx-auto max-w-3xl animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="mb-12">
          <div className="h-8 bg-muted rounded w-48 mb-6" />
          <div className="space-y-2">
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-14 bg-muted rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function FAQPage(): ReactElement {
  return (
    <>
      {/* JSON-LD構造化データ (パンくず) */}
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: 'よくある質問', url: '/faq' },
        ]}
      />

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-20">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-4xl font-bold text-gray-900 md:text-5xl">
              よくある質問
            </h1>
            <p className="text-lg text-gray-600">
              ご不明点がございましたら、まずはこちらをご確認ください。
            </p>
          </div>
        </Container>
      </section>

      {/* FAQ Section */}
      <Section>
        <Container>
          <Suspense fallback={<FAQLoading />}>
            <FAQContent />
          </Suspense>
        </Container>
      </Section>

      {/* Contact CTA */}
      <Section className="bg-gray-50">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-2xl font-bold text-gray-900">
              お探しの答えが見つかりませんか？
            </h2>
            <p className="mb-8 text-gray-600">
              ご不明点がございましたら、お気軽にお問い合わせください。
            </p>
            <a
              href="/contact"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 font-medium text-white transition-colors hover:bg-primary-700"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              お問い合わせはこちら
            </a>
          </div>
        </Container>
      </Section>
    </>
  )
}
