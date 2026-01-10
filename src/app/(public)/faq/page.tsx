/**
 * FAQページ
 *
 * よくある質問ページ（アコーディオンUI）
 */

import type { Metadata } from 'next'
import { Container, Section, SectionTitle } from '@/components/site/ui'
import { FAQPageJsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import { FAQAccordion } from './_components/FAQAccordion'
import type { ReactElement } from 'react'

export const metadata: Metadata = {
  title: 'よくある質問',
  description:
    'Myrrh Rental Spaceのよくある質問をまとめています。ご予約、ご利用方法、キャンセルポリシーなど。',
}

// FAQデータ
const faqItems = [
  {
    category: 'ご予約について',
    items: [
      {
        question: '予約はどのくらい前から可能ですか？',
        answer:
          '3ヶ月先までのご予約が可能です。人気の日時は早めにご予約いただくことをおすすめします。',
      },
      {
        question: '予約の変更はできますか？',
        answer:
          'ご利用日の3日前までであれば、日時の変更が可能です。お問い合わせフォームまたはお電話にてご連絡ください。',
      },
      {
        question: '当日予約は可能ですか？',
        answer:
          '空きがあれば当日予約も可能です。ただし、準備の都合上、ご利用開始の2時間前までにご予約ください。',
      },
    ],
  },
  {
    category: 'ご利用について',
    items: [
      {
        question: '利用時間には準備・片付けの時間も含まれますか？',
        answer:
          'はい、ご予約いただいた時間内に準備・片付けを含めてご利用ください。延長をご希望の場合は、事前にご相談ください。',
      },
      {
        question: '飲食は可能ですか？',
        answer:
          '軽食・飲み物の持ち込みは可能です。ただし、調理を伴う飲食や、においの強い食べ物はご遠慮いただいております。ケータリングの手配も承りますので、ご相談ください。',
      },
      {
        question: '設備や備品は何がありますか？',
        answer:
          '各スペースにより異なりますが、Wi-Fi、プロジェクター、ホワイトボード、電源タップなどの基本設備をご用意しています。詳しくは各スペースの詳細ページをご確認ください。',
      },
      {
        question: '駐車場はありますか？',
        answer:
          'スペースにより異なります。各スペースの詳細ページにてご確認いただくか、お問い合わせください。近隣のコインパーキングをご案内することも可能です。',
      },
    ],
  },
  {
    category: 'お支払いについて',
    items: [
      {
        question: '支払い方法を教えてください',
        answer:
          'クレジットカード（VISA、Mastercard、JCB、American Express）、銀行振込でのお支払いが可能です。',
      },
      {
        question: '請求書払いは可能ですか？',
        answer:
          '法人のお客様には請求書払いも承っております。事前審査がございますので、お問い合わせください。',
      },
      {
        question: '領収書は発行されますか？',
        answer:
          'はい、ご利用後にメールにて領収書をお送りいたします。宛名のご指定がある場合は、予約時にお知らせください。',
      },
    ],
  },
  {
    category: 'キャンセルについて',
    items: [
      {
        question: 'キャンセル料はかかりますか？',
        answer:
          'キャンセル料は以下の通りです。\n・7日前まで：無料\n・3〜6日前：利用料金の30%\n・前日〜2日前：利用料金の50%\n・当日：利用料金の100%',
      },
      {
        question: 'キャンセルの方法を教えてください',
        answer:
          'お問い合わせフォームまたはお電話にてご連絡ください。キャンセル確定後、確認メールをお送りいたします。',
      },
    ],
  },
  {
    category: 'その他',
    items: [
      {
        question: '下見・内覧はできますか？',
        answer:
          'はい、事前にご予約いただければ無料で内覧いただけます。お問い合わせフォームよりご希望日時をお知らせください。',
      },
      {
        question: '定期利用・長期利用の割引はありますか？',
        answer:
          '月4回以上のご利用や、長期契約の場合は割引がございます。詳しくはお問い合わせください。',
      },
      {
        question: '商用撮影での利用は可能ですか？',
        answer:
          '可能です。ただし、撮影内容により別途審査が必要な場合がございます。事前にご相談ください。',
      },
    ],
  },
]

// FAQPageJsonLd用にフラット化
const flatFaqItems = faqItems.flatMap((category) => category.items)

export default function FAQPage(): ReactElement {
  return (
    <>
      {/* JSON-LD構造化データ */}
      <FAQPageJsonLd items={flatFaqItems} />
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
          <div className="mx-auto max-w-3xl">
            {faqItems.map((category, index) => (
              <div key={index} className="mb-12 last:mb-0">
                <SectionTitle title={category.category} align="left" />
                <div className="mt-6">
                  <FAQAccordion items={category.items} />
                </div>
              </div>
            ))}
          </div>
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
