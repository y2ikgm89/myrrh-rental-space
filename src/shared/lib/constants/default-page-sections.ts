/**
 * デフォルトセクション定義
 *
 * システムページ作成時に自動生成されるデフォルトのSection構成。
 * 各ページに適したセクションタイプとconfigを定義。
 */

import type { Prisma } from "@/shared/db/prisma";

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
export const DEFAULT_PAGE_SECTIONS: Record<string, DefaultSectionDef[]> = {
  home: [
    {
      type: "hero-parallax",
      title: null,
      config: {
        title: "Myrrh Rental Space",
        subtitle: "特別な空間で、特別な時間を",
        backgroundImageUrl: "/images/hero-default.jpg",
        parallaxSpeed: 0.3,
        overlayGradient: true,
        scrollIndicator: true,
      },
      design: {},
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "concept",
      title: null,
      config: {
        heading: "私たちの想い",
        body: "Myrrh Rental Space は、撮影、会議、イベント、ワークショップなど、あらゆるシーンに対応する上質なレンタルスペースです。洗練された空間と柔軟なプランで、特別な瞬間をサポートします。",
        imageUrl: "/images/concept-default.jpg",
        imagePosition: "right",
      },
      content: null,
      order: 1,
      isActive: true,
    },
    {
      type: "space-showcase",
      title: null,
      config: {
        title: "厳選されたスペース",
        maxItems: 3,
        showOnlyPublished: true,
      },
      content: null,
      order: 2,
      isActive: true,
    },
    {
      type: "features",
      title: null,
      config: {
        title: "選ばれる理由",
        items: [
          {
            icon: "clock",
            title: "柔軟な利用プラン",
            description:
              "1時間単位でご利用いただけます。当日予約にも対応し、急なご要望にもお応えします。",
          },
          {
            icon: "shield",
            title: "安心のサポート体制",
            description:
              "専任スタッフが常駐し、設備の使い方からレイアウト変更まで丁寧にサポートいたします。",
          },
          {
            icon: "sparkles",
            title: "上質な空間デザイン",
            description:
              "プロのデザイナーが手がけた内装で、どの角度から撮影しても美しい空間をご提供します。",
          },
        ],
        columns: 3,
      },
      content: null,
      order: 3,
      isActive: true,
    },
    {
      type: "cta",
      title: null,
      config: {
        title: "ご予約・お問い合わせ",
        description: "お気軽にご相談ください。見学のご予約も承っております。",
        ctaPrimary: { text: "予約する", url: "/reservation" },
        ctaSecondary: { text: "お問い合わせ", url: "/contact" },
      },
      content: null,
      order: 4,
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

  journal: [
    {
      type: "hero",
      title: null,
      config: {
        title: "Journal",
        subtitle: "ニュースやコラムなど、最新の情報をお届けします。",
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

  privacy: [
    {
      type: "hero",
      title: null,
      config: {
        title: "Privacy",
        subtitle: "個人情報の取り扱いについてご確認ください。",
        variant: "minimal",
      },
      design: { titleSize: "3xl" },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "custom",
      title: "プライバシーポリシー",
      config: {},
      content:
        "<p>プライバシーポリシーの内容は管理画面から編集してください。</p>",
      order: 1,
      isActive: true,
    },
  ],

  terms: [
    {
      type: "hero",
      title: null,
      config: {
        title: "Terms",
        subtitle: "ご利用にあたっての規約をご確認ください。",
        variant: "minimal",
      },
      design: { titleSize: "3xl" },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "custom",
      title: "利用規約",
      config: {},
      content: "<p>利用規約の内容は管理画面から編集してください。</p>",
      order: 1,
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
