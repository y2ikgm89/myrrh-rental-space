/**
 * デフォルトセクション定義
 *
 * システムページ作成時に自動生成されるデフォルトのSection構成。
 * 各ページに適したセクションタイプとconfigを定義。
 */

import { SectionType } from '@/shared/db/enums'
import type { Prisma } from '@/shared/db/prisma'

export type DefaultSectionDef = {
  type: SectionType
  title: string | null
  config: Prisma.InputJsonValue
  design?: Prisma.InputJsonValue
  content: string | null
  order: number
  isActive: boolean
}

/**
 * システムページごとのデフォルトセクション定義
 */
export const DEFAULT_PAGE_SECTIONS: Record<string, DefaultSectionDef[]> = {
  about: [
    {
      type: SectionType.HERO,
      title: null,
      config: {
        title: 'About',
        subtitle: 'ビジネスからプライベートまで、あらゆるシーンに対応するレンタルスペース。',
        variant: 'minimal',
      },
      design: { titleSize: '3xl' },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: SectionType.CUSTOM,
      title: 'ミッション',
      config: {},
      content: '<p>私たちは、すべての人が自分らしい活動ができる「場」を提供することを目指しています。</p><p>会議、セミナー、ワークショップ、撮影、パーティーなど、様々なシーンで活用できるレンタルスペースを通じて、お客様の可能性を広げるお手伝いをいたします。</p><p>快適で使いやすい空間と、きめ細やかなサポートで、あなたの大切なひとときを演出します。</p>',
      order: 1,
      isActive: true,
    },
    {
      type: SectionType.CTA,
      title: null,
      config: {
        title: 'お問い合わせ',
        description: 'ご質問やご相談がございましたら、お気軽にお問い合わせください。',
        ctaPrimary: { text: 'お問い合わせ', url: '/contact' },
        ctaSecondary: { text: 'スペースを見る', url: '/spaces' },
      },
      content: null,
      order: 2,
      isActive: true,
    },
  ],

  faq: [
    {
      type: SectionType.HERO,
      title: null,
      config: {
        title: 'FAQ',
        subtitle: 'ご不明点がございましたら、まずはこちらをご確認ください。',
        variant: 'minimal',
      },
      design: { titleSize: '3xl' },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: SectionType.FAQ_LIST,
      title: 'よくあるご質問',
      config: {
        maxItems: 20,
        showCategories: true,
      },
      content: null,
      order: 1,
      isActive: true,
    },
    {
      type: SectionType.CTA,
      title: null,
      config: {
        title: 'お探しの答えが見つかりませんか？',
        description: 'ご不明点がございましたら、お気軽にお問い合わせください。',
        ctaPrimary: { text: 'お問い合わせ', url: '/contact' },
      },
      content: null,
      order: 2,
      isActive: true,
    },
  ],

  contact: [
    {
      type: SectionType.HERO,
      title: null,
      config: {
        title: 'Contact',
        subtitle: 'ご質問やご要望がございましたら、お気軽にお問い合わせください。',
        variant: 'minimal',
      },
      design: { titleSize: '3xl' },
      content: null,
      order: 0,
      isActive: true,
    },
  ],

  news: [
    {
      type: SectionType.HERO,
      title: null,
      config: {
        title: 'News',
        subtitle: 'お知らせ・最新情報をお届けします。',
        variant: 'minimal',
      },
      design: { titleSize: '3xl' },
      content: null,
      order: 0,
      isActive: true,
    },
  ],

  posts: [
    {
      type: SectionType.HERO,
      title: null,
      config: {
        title: 'Blog',
        subtitle: '最新のお知らせやお役立ち情報をお届けします。',
        variant: 'minimal',
      },
      design: { titleSize: '3xl' },
      content: null,
      order: 0,
      isActive: true,
    },
  ],

  privacy: [
    {
      type: SectionType.HERO,
      title: null,
      config: {
        title: 'Privacy',
        subtitle: '個人情報の取り扱いについてご確認ください。',
        variant: 'minimal',
      },
      design: { titleSize: '3xl' },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: SectionType.CUSTOM,
      title: 'プライバシーポリシー',
      config: {},
      content: '<p>プライバシーポリシーの内容は管理画面から編集してください。</p>',
      order: 1,
      isActive: true,
    },
  ],

  terms: [
    {
      type: SectionType.HERO,
      title: null,
      config: {
        title: 'Terms',
        subtitle: 'ご利用にあたっての規約をご確認ください。',
        variant: 'minimal',
      },
      design: { titleSize: '3xl' },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: SectionType.CUSTOM,
      title: '利用規約',
      config: {},
      content: '<p>利用規約の内容は管理画面から編集してください。</p>',
      order: 1,
      isActive: true,
    },
  ],

  reservation: [
    {
      type: SectionType.HERO,
      title: null,
      config: {
        title: 'Reserve',
        subtitle: '3ステップで簡単予約。お好みのスペースと日時をお選びください。',
        variant: 'minimal',
      },
      design: { titleSize: '3xl' },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: SectionType.SPACE_LIST,
      title: '予約可能なスペース',
      config: {
        maxItems: 12,
        showOnlyPublished: true,
      },
      content: null,
      order: 1,
      isActive: true,
    },
  ],

  spaces: [
    {
      type: SectionType.HERO,
      title: null,
      config: {
        title: 'Spaces',
        subtitle: 'ご利用可能なレンタルスペースをお探しください。',
        variant: 'minimal',
      },
      design: { titleSize: '3xl' },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: SectionType.SPACE_LIST,
      title: null,
      config: {
        maxItems: 12,
        showOnlyPublished: true,
      },
      content: null,
      order: 1,
      isActive: true,
    },
  ],
}
