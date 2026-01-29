/**
 * デフォルトセクション定義
 *
 * システムページ作成時に自動生成されるデフォルトのPageSection構成。
 * 各ページに適したセクションタイプとconfigを定義。
 */

import { PageSectionType } from '@/shared/generated/prisma/enums'
import type { Prisma } from '@/shared/generated/prisma/client'

export type DefaultSectionDef = {
  type: PageSectionType
  title: string | null
  config: Prisma.InputJsonValue
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
      type: PageSectionType.HERO,
      title: null,
      config: {
        title: '私たちについて',
        subtitle: 'ビジネスからプライベートまで、あらゆるシーンに対応するレンタルスペース',
        height: 'sm',
        overlay: false,
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: PageSectionType.CUSTOM,
      title: 'ミッション',
      config: {},
      content: '<p>私たちは、すべての人が自分らしい活動ができる「場」を提供することを目指しています。</p><p>会議、セミナー、ワークショップ、撮影、パーティーなど、様々なシーンで活用できるレンタルスペースを通じて、お客様の可能性を広げるお手伝いをいたします。</p><p>快適で使いやすい空間と、きめ細やかなサポートで、あなたの大切なひとときを演出します。</p>',
      order: 1,
      isActive: true,
    },
    {
      type: PageSectionType.CTA,
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
      type: PageSectionType.HERO,
      title: null,
      config: {
        title: 'よくある質問',
        subtitle: 'ご不明点がございましたら、まずはこちらをご確認ください。',
        height: 'sm',
        overlay: false,
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: PageSectionType.FAQ_LIST,
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
      type: PageSectionType.CTA,
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
      type: PageSectionType.HERO,
      title: null,
      config: {
        title: 'お問い合わせ',
        subtitle: 'ご質問やご予約のご相談など、お気軽にお問い合わせください。通常、2営業日以内にご返信いたします。',
        height: 'sm',
        overlay: false,
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: PageSectionType.CONTACT_FORM,
      title: 'お問い合わせフォーム',
      config: {},
      content: null,
      order: 1,
      isActive: true,
    },
  ],

  privacy: [
    {
      type: PageSectionType.CUSTOM,
      title: 'プライバシーポリシー',
      config: {},
      content: '<p>プライバシーポリシーの内容は管理画面から編集してください。</p>',
      order: 0,
      isActive: true,
    },
  ],

  terms: [
    {
      type: PageSectionType.CUSTOM,
      title: '利用規約',
      config: {},
      content: '<p>利用規約の内容は管理画面から編集してください。</p>',
      order: 0,
      isActive: true,
    },
  ],

  reservation: [
    {
      type: PageSectionType.HERO,
      title: null,
      config: {
        title: '予約',
        subtitle: '日時を選択して、簡単にご予約いただけます。',
        height: 'sm',
        overlay: false,
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: PageSectionType.SPACE_LIST,
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
      type: PageSectionType.HERO,
      title: null,
      config: {
        title: 'スペース一覧',
        subtitle: 'ご利用可能なレンタルスペースをお探しください',
        height: 'sm',
        overlay: false,
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: PageSectionType.SPACE_LIST,
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
