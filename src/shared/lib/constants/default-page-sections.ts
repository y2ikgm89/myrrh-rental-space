/**
 * デフォルトセクション定義
 *
 * システムページ作成時に自動生成されるデフォルトのSection構成。
 * 各ページに適したセクションタイプとconfigを定義。
 */

import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";

export type DefaultSectionDef = {
  type: string;
  title: string | null;
  config: Prisma.InputJsonValue;
  design?: Prisma.InputJsonValue;
  content: string | null;
  order: number;
  isActive: boolean;
};

/**
 * システムページごとのデフォルトセクション定義
 */
const homeEditorialSpacing = {
  paddingTop: "md",
  paddingBottom: "md",
  maxWidth: "xl",
  textAlign: "center",
} as const satisfies Prisma.InputJsonValue;

export const DEFAULT_PAGE_SECTIONS: Record<string, DefaultSectionDef[]> = {
  home: [
    {
      type: "homepage-how-it-works",
      title: null,
      design: homeEditorialSpacing,
      config: {
        label: "How to Reserve",
        title: "ご利用の流れ",
        steps: [
          {
            title: "スペースを選ぶ",
            description: "用途や人数に合った空間を見つける",
          },
          {
            title: "日時を決める",
            description: "カレンダーから空き状況を確認",
          },
          {
            title: "オンラインで予約",
            description: "最短1分で予約完了",
          },
        ],
        valueProps: [
          { title: "最短1時間から" },
          { title: "当日予約OK" },
          { title: "Wi-Fi完備" },
          { title: "オンライン決済" },
        ],
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "homepage-spaces",
      title: null,
      design: homeEditorialSpacing,
      config: {
        label: "Selected Spaces",
        title: "厳選スペース",
        count: 6,
      },
      content: null,
      order: 1,
      isActive: true,
    },
    {
      type: "homepage-features",
      title: null,
      design: {
        paddingTop: "md",
        paddingBottom: "md",
        maxWidth: "editorial",
        textAlign: "center",
      },
      config: {
        label: "Why Myrrh",
        title: "選ばれる理由",
        items: [
          {
            title: "自然光設計",
            description:
              "全室に大きな窓を配置。時間帯で変化する光が、空間に深みを与えます。",
          },
          {
            title: "遮音性能",
            description:
              "プロフェッショナル水準の遮音設計。外部の喧騒を遮断し、深い集中を可能にします。",
          },
          {
            title: "即日予約",
            description:
              "オンラインで空き状況確認から決済まで完結。当日予約にも対応しています。",
          },
          {
            title: "柔軟なレイアウト",
            description:
              "可動式の家具と設備で、会議・撮影・イベントなど用途に合わせた配置変更が可能です。",
          },
        ],
      },
      content: null,
      order: 2,
      isActive: true,
    },
    {
      type: "homepage-cta",
      title: null,
      design: homeEditorialSpacing,
      config: {
        label: "Reservation",
        title: "あなたに最適な空間を",
        description:
          "空き状況の確認から予約まで、オンラインで完結。まずは空間をご覧ください。",
        buttonText: "View All Spaces",
        buttonUrl: "/spaces",
      },
      content: null,
      order: 3,
      isActive: true,
    },
  ],

  about: [
    {
      type: "hero",
      title: null,
      config: {
        title: "About",
        subtitle:
          "ビジネスからプライベートまで、あらゆるシーンに対応するレンタルスペース。",
        variant: "minimal",
      },
      design: { titleSize: "3xl" },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "custom",
      title: "ミッション",
      config: {},
      content:
        "<p>私たちは、すべての人が自分らしい活動ができる「場」を提供することを目指しています。</p><p>会議、セミナー、ワークショップ、撮影、パーティーなど、様々なシーンで活用できるレンタルスペースを通じて、お客様の可能性を広げるお手伝いをいたします。</p><p>快適で使いやすい空間と、きめ細やかなサポートで、あなたの大切なひとときを演出します。</p>",
      order: 1,
      isActive: true,
    },
    {
      type: "cta",
      title: null,
      config: {
        title: "お問い合わせ",
        description:
          "ご質問やご相談がございましたら、お気軽にお問い合わせください。",
        ctaPrimary: { text: "お問い合わせ", url: "/contact" },
        ctaSecondary: { text: "スペースを見る", url: "/spaces" },
      },
      content: null,
      order: 2,
      isActive: true,
    },
  ],

  faq: [
    {
      type: "hero",
      title: null,
      config: {
        title: "FAQ",
        subtitle: "ご不明点がございましたら、まずはこちらをご確認ください。",
        variant: "minimal",
      },
      design: { titleSize: "3xl" },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "faq-list",
      title: "よくあるご質問",
      config: {
        maxItems: 20,
        showCategories: true,
      },
      content: null,
      order: 1,
      isActive: true,
    },
    {
      type: "cta",
      title: null,
      config: {
        title: "お探しの答えが見つかりませんか？",
        description: "ご不明点がございましたら、お気軽にお問い合わせください。",
        ctaPrimary: { text: "お問い合わせ", url: "/contact" },
      },
      content: null,
      order: 2,
      isActive: true,
    },
  ],

  contact: [
    {
      type: "hero",
      title: null,
      config: {
        title: "Contact",
        subtitle:
          "ご質問やご要望がございましたら、お気軽にお問い合わせください。",
        variant: "minimal",
      },
      design: { titleSize: "3xl" },
      content: null,
      order: 0,
      isActive: true,
    },
  ],

  access: [
    {
      type: "hero",
      title: null,
      config: {
        title: "Access",
        subtitle: "最寄り駅・駐車場・営業時間をご案内します。",
        variant: "minimal",
      },
      design: { titleSize: "3xl" },
      content: null,
      order: 0,
      isActive: true,
    },
  ],

  news: [
    {
      type: "hero",
      title: null,
      config: {
        title: "News",
        subtitle: "お知らせ・最新情報をお届けします。",
        variant: "minimal",
      },
      design: { titleSize: "3xl" },
      content: null,
      order: 0,
      isActive: true,
    },
  ],

  posts: [
    {
      type: "hero",
      title: null,
      config: {
        title: "Blog",
        subtitle: "最新のお知らせやお役立ち情報をお届けします。",
        variant: "minimal",
      },
      design: { titleSize: "3xl" },
      content: null,
      order: 0,
      isActive: true,
    },
  ],

  reservation: [
    {
      type: "hero",
      title: null,
      config: {
        title: "Reserve",
        subtitle:
          "3ステップで簡単予約。お好みのスペースと日時をお選びください。",
        variant: "minimal",
      },
      design: { titleSize: "3xl" },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "space-list",
      title: "予約可能なスペース",
      config: {
        maxItems: 12,
        showOnlyPublished: true,
      },
      content: null,
      order: 1,
      isActive: true,
    },
  ],

  events: [
    {
      type: "hero",
      title: null,
      config: {
        title: "Events",
        subtitle: "開催予定のイベント・ワークショップ情報",
        variant: "minimal",
      },
      design: { titleSize: "3xl" },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "event-calendar",
      title: "イベントカレンダー",
      config: {},
      content: null,
      order: 1,
      isActive: true,
    },
  ],

  spaces: [
    {
      type: "hero",
      title: null,
      config: {
        title: "Spaces",
        subtitle: "ご利用可能なレンタルスペースをお探しください。",
        variant: "minimal",
      },
      design: { titleSize: "3xl" },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "space-list",
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
};
