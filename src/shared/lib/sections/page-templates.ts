import type { DefaultSectionDef } from "@/shared/lib/constants/default-page-sections";
import { DEFAULT_PAGE_SECTIONS } from "@/shared/lib/constants/default-page-sections";

export interface PageTemplate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly allowedSectionTypes: readonly string[];
  readonly defaultSections: readonly DefaultSectionDef[];
  readonly requiredSectionTypes?: readonly string[];
}

const STANDARD_CONTENT_TYPES = [
  "page-hero",
  "hero",
  "hero-parallax",
  "custom",
  "concept",
  "features",
  "testimonial",
  "gallery",
  "cta",
  "instagram",
  "embed",
  "map",
] as const;

export const PAGE_TEMPLATES: Record<string, PageTemplate> = {
  home: {
    id: "home",
    label: "ホーム",
    description: "トップページ — Hero + 特集セクション",
    allowedSectionTypes: [
      "page-hero",
      "hero-parallax",
      "features",
      "space-showcase",
      "post-list",
      "news-list",
      "cta",
      "concept",
      "instagram",
      "testimonial",
      "gallery",
    ],
    defaultSections: DEFAULT_PAGE_SECTIONS["home"] ?? [],
    requiredSectionTypes: ["page-hero"],
  },
  content: {
    id: "content",
    label: "コンテンツページ",
    description: "/about のような自由構成",
    allowedSectionTypes: STANDARD_CONTENT_TYPES,
    defaultSections: DEFAULT_PAGE_SECTIONS["about"] ?? [],
  },
  access: {
    id: "access",
    label: "アクセス",
    description: "拠点情報",
    allowedSectionTypes: [
      "page-hero",
      "hero",
      "location-list",
      "map",
      "cta",
      "custom",
    ],
    defaultSections: DEFAULT_PAGE_SECTIONS["access"] ?? [],
    requiredSectionTypes: ["location-list"],
  },
  contact: {
    id: "contact",
    label: "お問い合わせ",
    description: "問い合わせフォーム + 補足",
    // contact-form type は Phase 3 で追加予定。Phase 1 では Section type が無いため使えないが、
    // テンプレート定義としては allowedSectionTypes に含めておく。
    allowedSectionTypes: ["page-hero", "hero", "contact-form", "custom", "map"],
    defaultSections: DEFAULT_PAGE_SECTIONS["contact"] ?? [],
    requiredSectionTypes: ["contact-form"],
  },
  faq: {
    id: "faq",
    label: "FAQ",
    description: "よくあるご質問",
    allowedSectionTypes: ["page-hero", "hero", "faq-list", "cta", "custom"],
    defaultSections: DEFAULT_PAGE_SECTIONS["faq"] ?? [],
    requiredSectionTypes: ["faq-list"],
  },
  "news-archive": {
    id: "news-archive",
    label: "ニュース一覧",
    description: "お知らせ一覧",
    allowedSectionTypes: ["page-hero", "hero", "news-list", "cta", "custom"],
    defaultSections: DEFAULT_PAGE_SECTIONS["news"] ?? [],
    requiredSectionTypes: ["news-list"],
  },
  "blog-archive": {
    id: "blog-archive",
    label: "ブログ一覧",
    description: "ブログ記事一覧",
    allowedSectionTypes: ["page-hero", "hero", "post-list", "cta", "custom"],
    defaultSections: DEFAULT_PAGE_SECTIONS["posts"] ?? [],
    requiredSectionTypes: ["post-list"],
  },
  "events-archive": {
    id: "events-archive",
    label: "イベント一覧",
    description: "イベントカレンダー + 一覧",
    allowedSectionTypes: [
      "page-hero",
      "hero",
      "event-calendar",
      "cta",
      "custom",
    ],
    defaultSections: DEFAULT_PAGE_SECTIONS["events"] ?? [],
    requiredSectionTypes: ["event-calendar"],
  },
  "spaces-archive": {
    id: "spaces-archive",
    label: "スペース一覧",
    description: "スペース一覧",
    allowedSectionTypes: ["page-hero", "hero", "space-list", "cta", "custom"],
    defaultSections: DEFAULT_PAGE_SECTIONS["spaces"] ?? [],
    requiredSectionTypes: ["space-list"],
  },
  reservation: {
    id: "reservation",
    label: "予約",
    description: "予約フォーム",
    allowedSectionTypes: [
      "page-hero",
      "hero",
      "reservation-form",
      "space-list",
      "cta",
    ],
    defaultSections: DEFAULT_PAGE_SECTIONS["reservation"] ?? [],
    requiredSectionTypes: ["reservation-form"],
  },
  custom: {
    id: "custom",
    label: "カスタム",
    description: "自由構成（管理者が任意に組む）",
    allowedSectionTypes: STANDARD_CONTENT_TYPES,
    defaultSections: [
      // 最小構成: hero + custom + cta
      ...(DEFAULT_PAGE_SECTIONS["about"] ?? []).slice(0, 3),
    ],
  },
};

export function getPageTemplate(templateId: string): PageTemplate | undefined {
  return PAGE_TEMPLATES[templateId];
}

export function isAllowedSectionForTemplate(
  templateId: string,
  sectionType: string,
): boolean {
  const template = getPageTemplate(templateId);
  if (!template) return false;
  return template.allowedSectionTypes.includes(sectionType);
}

export function isRequiredSectionForTemplate(
  templateId: string,
  sectionType: string,
): boolean {
  const template = getPageTemplate(templateId);
  if (!template) return false;
  return template.requiredSectionTypes?.includes(sectionType) ?? false;
}

const SLUG_TO_TEMPLATE: Record<string, string> = {
  home: "home",
  about: "content",
  access: "access",
  contact: "contact",
  faq: "faq",
  news: "news-archive",
  posts: "blog-archive",
  events: "events-archive",
  spaces: "spaces-archive",
  reservation: "reservation",
};

export function resolveTemplateForSlug(slug: string): string {
  return SLUG_TO_TEMPLATE[slug] ?? "custom";
}
