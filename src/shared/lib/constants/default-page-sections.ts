/**
 * デフォルトセクション定義
 *
 * システムページ作成時に自動生成されるデフォルトのSection構成。
 * 各ページに適したセクションタイプとconfigを定義。
 */

import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";
import { createBlock, createSpan } from "@/shared/lib/portable-text";

/**
 * Phase 4: textarea -> block 移行 helper
 * 単一行テキストを PortableTextBlock 配列にラップして defaults に流す。
 */
function block(text: string) {
  return [createBlock([createSpan(text)])];
}

export type DefaultSectionDef = {
  type: string;
  title: string | null;
  config: Prisma.InputJsonValue;
  content: string | null;
  order: number;
  isActive: boolean;
};

export function createDefaultCustomPageSections(
  pageTitle: string,
  description?: string | null,
): DefaultSectionDef[] {
  return [
    {
      type: "hero",
      title: null,
      config: {
        title: pageTitle,
        subtitle: description ?? "",
        variant: "minimal",
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "custom",
      title: "本文",
      config: {
        sectionLabel: "Contents",
        maxWidth: "lg",
        containerClass: "",
        backgroundColor: "",
        padding: "md",
      },
      content: null,
      order: 1,
      isActive: true,
    },
    {
      type: "cta",
      title: null,
      config: {
        title: [
          {
            _key: crypto.randomUUID(),
            _type: "span" as const,
            text: "ご予約・お問い合わせ",
          },
        ],
        description: block("空き状況の確認やご相談はこちらから承ります。"),
        ctaPrimary: { text: "予約する", url: "/reservation" },
        ctaSecondary: { text: "お問い合わせ", url: "/contact" },
      },
      content: null,
      order: 2,
      isActive: true,
    },
  ];
}

/**
 * システムページごとのデフォルトセクション定義
 *
 * Section レベルの visual style はコード所有の固定定義で解決する。
 */
export const DEFAULT_PAGE_SECTIONS: Record<string, DefaultSectionDef[]> = {
  home: [
    {
      type: "features",
      title: "ご利用の流れ",
      config: {
        sectionLabel: "How to Reserve",
        title: [
          {
            _key: crypto.randomUUID(),
            _type: "span" as const,
            text: "ご利用の流れ",
          },
        ],
        displayLayout: "numbered-steps",
        items: [
          {
            icon: "IconSearch",
            title: [
              {
                _key: crypto.randomUUID(),
                _type: "span" as const,
                text: "スペースを選ぶ",
              },
            ],
            description: block("用途や人数に合った空間を見つける"),
          },
          {
            icon: "IconCalendarEvent",
            title: [
              {
                _key: crypto.randomUUID(),
                _type: "span" as const,
                text: "日時を決める",
              },
            ],
            description: block("カレンダーから空き状況を確認"),
          },
          {
            icon: "IconCircleCheck",
            title: [
              {
                _key: crypto.randomUUID(),
                _type: "span" as const,
                text: "オンラインで予約",
              },
            ],
            description: block("最短1分で予約完了"),
          },
        ],
        layout: {
          padding: "lg",
          containerWidth: "lg",
          animateOnScroll: "fade-up",
        },
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "value-props",
      title: null,
      config: {
        items: [
          {
            icon: "IconClock",
            eyebrow: "Speed",
            title: [
              {
                _key: crypto.randomUUID(),
                _type: "span" as const,
                text: "最短1時間から",
              },
            ],
          },
          {
            icon: "IconCalendarCheck",
            eyebrow: "Flexibility",
            title: [
              {
                _key: crypto.randomUUID(),
                _type: "span" as const,
                text: "当日予約OK",
              },
            ],
          },
          {
            icon: "IconWifi",
            eyebrow: "Connectivity",
            title: [
              {
                _key: crypto.randomUUID(),
                _type: "span" as const,
                text: "Wi-Fi完備",
              },
            ],
          },
          {
            icon: "IconCreditCard",
            eyebrow: "Payment",
            title: [
              {
                _key: crypto.randomUUID(),
                _type: "span" as const,
                text: "オンライン決済",
              },
            ],
          },
        ],
        layout: {
          padding: "none",
          containerWidth: "lg",
          animateOnScroll: "fade-up",
        },
      },
      content: null,
      order: 1,
      isActive: true,
    },
    {
      type: "space-showcase",
      title: "厳選スペース",
      config: {
        sectionLabel: "Selected Spaces",
        title: [
          {
            _key: crypto.randomUUID(),
            _type: "span" as const,
            text: "厳選スペース",
          },
        ],
        maxItems: 8,
        showOnlyPublished: true,
        displayLayout: "carousel",
        autoPlayInterval: 5,
        columns: 3,
        cardStyle: "bordered",
        imageAspect: "4:3",
        layout: {
          padding: "lg",
          containerWidth: "full",
          animateOnScroll: "fade-up",
        },
      },
      content: null,
      order: 2,
      isActive: true,
    },
    {
      type: "features",
      title: "選ばれる理由",
      config: {
        sectionLabel: "Why Myrrh",
        title: [
          {
            _key: crypto.randomUUID(),
            _type: "span" as const,
            text: "選ばれる理由",
          },
        ],
        displayLayout: "numbered-editorial",
        items: [
          {
            title: [
              {
                _key: crypto.randomUUID(),
                _type: "span" as const,
                text: "自然光設計",
              },
            ],
            description: block(
              "全室に大きな窓を配置。時間帯で変化する光が、空間に深みを与えます。",
            ),
          },
          {
            title: [
              {
                _key: crypto.randomUUID(),
                _type: "span" as const,
                text: "遮音性能",
              },
            ],
            description: block(
              "プロフェッショナル水準の遮音設計。外部の喧騒を遮断し、深い集中を可能にします。",
            ),
          },
          {
            title: [
              {
                _key: crypto.randomUUID(),
                _type: "span" as const,
                text: "即日予約",
              },
            ],
            description: block(
              "オンラインで空き状況確認から決済まで完結。当日予約にも対応しています。",
            ),
          },
          {
            title: [
              {
                _key: crypto.randomUUID(),
                _type: "span" as const,
                text: "柔軟なレイアウト",
              },
            ],
            description: block(
              "可動式の家具と設備で、会議・撮影・イベントなど用途に合わせた配置変更が可能です。",
            ),
          },
        ],
        layout: {
          padding: "lg",
          containerWidth: "lg",
          animateOnScroll: "fade-up",
        },
      },
      content: null,
      order: 3,
      isActive: true,
    },
    {
      type: "cta",
      title: null,
      config: {
        sectionLabel: "Reservation",
        title: [
          {
            _key: crypto.randomUUID(),
            _type: "span" as const,
            text: "あなたに最適な空間を",
          },
        ],
        description: block(
          "空き状況の確認から予約まで、オンラインで完結。まずは空間をご覧ください。",
        ),
        buttons: [
          {
            text: "スペースを見る",
            url: "/spaces",
            variant: "primary",
          },
        ],
        layout: {
          padding: "xl",
          containerWidth: "md",
          animateOnScroll: "fade-up",
        },
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
        title: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "About" },
        ],
        subtitle: block(
          "ビジネスからプライベートまで、あらゆるシーンに対応するレンタルスペース。",
        ),
        variant: "minimal",
      },
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
        title: [
          {
            _key: crypto.randomUUID(),
            _type: "span" as const,
            text: "お問い合わせ",
          },
        ],
        description: block(
          "ご質問やご相談がございましたら、お気軽にお問い合わせください。",
        ),
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
        title: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "FAQ" },
        ],
        subtitle: block(
          "ご不明点がございましたら、まずはこちらをご確認ください。",
        ),
        variant: "minimal",
      },
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
        title: [
          {
            _key: crypto.randomUUID(),
            _type: "span" as const,
            text: "お探しの答えが見つかりませんか？",
          },
        ],
        description: block(
          "ご不明点がございましたら、お気軽にお問い合わせください。",
        ),
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
        title: [
          {
            _key: crypto.randomUUID(),
            _type: "span" as const,
            text: "Contact",
          },
        ],
        subtitle: block(
          "ご質問やご要望がございましたら、お気軽にお問い合わせください。",
        ),
        variant: "minimal",
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "contact-form",
      title: null,
      config: {
        sectionLabel: "",
        title: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "" },
        ],
        variant: "split",
      },
      content: null,
      order: 1,
      isActive: true,
    },
  ],

  access: [
    {
      type: "hero",
      title: null,
      config: {
        title: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "Access" },
        ],
        subtitle: block("最寄り駅・駐車場・営業時間をご案内します。"),
        variant: "minimal",
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "location-list",
      title: null,
      config: {
        sectionLabel: "Locations",
        title: [
          {
            _key: crypto.randomUUID(),
            _type: "span" as const,
            text: "全拠点のご案内",
          },
        ],
        mode: "all",
        locationSlugs: [],
        overviewNavEnabled: true,
        overviewHeadline: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "" },
        ],
        globalContactEnabled: true,
        globalContactHeadline: [
          {
            _key: crypto.randomUUID(),
            _type: "span" as const,
            text: "代表お問い合わせ",
          },
        ],
        chapterLayout: "alternating",
      },
      content: null,
      order: 1,
      isActive: true,
    },
    {
      type: "cta",
      title: null,
      config: {
        title: [
          {
            _key: crypto.randomUUID(),
            _type: "span" as const,
            text: "ご不明な点はお気軽にどうぞ",
          },
        ],
        buttons: [
          { text: "お問い合わせ", url: "/contact", variant: "primary" },
        ],
      },
      content: null,
      order: 2,
      isActive: true,
    },
  ],

  news: [
    {
      type: "hero",
      title: null,
      config: {
        title: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "News" },
        ],
        subtitle: block("お知らせ・最新情報をお届けします。"),
        variant: "minimal",
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "news-list",
      title: null,
      config: {
        sectionLabel: "",
        title: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "" },
        ],
        displayLayout: "archive",
        showViewAllLink: false,
      },
      content: null,
      order: 1,
      isActive: true,
    },
  ],

  posts: [
    {
      type: "hero",
      title: null,
      config: {
        title: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "Blog" },
        ],
        subtitle: block("最新のお知らせやお役立ち情報をお届けします。"),
        variant: "minimal",
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "post-list",
      title: null,
      config: {
        sectionLabel: "",
        title: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "" },
        ],
        displayLayout: "archive",
        showViewAllLink: false,
      },
      content: null,
      order: 1,
      isActive: true,
    },
  ],

  reservation: [
    {
      type: "hero",
      title: null,
      config: {
        title: [
          {
            _key: crypto.randomUUID(),
            _type: "span" as const,
            text: "Reserve",
          },
        ],
        subtitle: block(
          "3ステップで簡単予約。お好みのスペースと日時をお選びください。",
        ),
        variant: "minimal",
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "reservation-form",
      title: null,
      config: {
        sectionLabel: "",
        title: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "" },
        ],
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
        title: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "Events" },
        ],
        subtitle: block("開催予定のイベント・ワークショップ情報"),
        variant: "minimal",
      },
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
        title: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "Spaces" },
        ],
        subtitle: block("ご利用可能なレンタルスペースをお探しください。"),
        variant: "minimal",
      },
      content: null,
      order: 0,
      isActive: true,
    },
    {
      type: "space-list",
      title: null,
      config: {
        sectionLabel: "",
        title: [
          { _key: crypto.randomUUID(), _type: "span" as const, text: "" },
        ],
        displayLayout: "catalog",
        showOnlyPublished: true,
        showViewAllLink: false,
      },
      content: null,
      order: 1,
      isActive: true,
    },
  ],
};
