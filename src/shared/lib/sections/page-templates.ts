import type { DefaultSectionDef } from "@/shared/lib/constants/default-page-sections";
import { DEFAULT_PAGE_SECTIONS } from "@/shared/lib/constants/default-page-sections";
import { keysOf } from "@/shared/lib/serialize";

/**
 * テンプレート定義（内部 SSoT）。
 *
 * `additionalSectionTypes` には **universal でない** page-specific セクションのみを列挙する。
 * universal セクション（hero / cta / gallery 等のプレゼンテーション系）は
 * `UNIVERSAL_SECTION_TYPES` から全テンプレートに自動付与されるため、ここには書かない。
 */
interface PageTemplateDef {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** universal に追加で許可する page-specific セクション（listing / form / calendar 等） */
  readonly additionalSectionTypes: readonly string[];
  readonly defaultSections: readonly DefaultSectionDef[];
  readonly requiredSectionTypes?: readonly string[];
}

/** 公開 API 型（`allowedSectionTypes` は universal + additional の computed 値） */
export interface PageTemplate extends PageTemplateDef {
  readonly allowedSectionTypes: readonly string[];
}

/**
 * Universal セクション — 全テンプレートで追加可能。
 *
 * データ結合・ページ文脈依存・二重表示リスクの無い純プレゼンテーション系。
 * これらは hero zone（page-hero / hero / hero-parallax）と content / media 系で構成され、
 * どのページに置いても意味的・機能的に破綻しない。
 *
 * 逆に listing（space-list / news-list 等）・form（contact-form / reservation-form）・
 * calendar（event-calendar）・location-list は **page-specific** とし、
 * 各テンプレートが `additionalSectionTypes` で明示的に opt-in した時のみ追加可能にする。
 * これにより「予約ページに space-list を足して二重表示」のような silent UX bug を
 * AddSectionDialog の段階で構造的に防ぐ（registry / SectionRenderer は全 22 型対応のまま）。
 */
const UNIVERSAL_SECTION_TYPES = [
  // hero zone
  "page-hero",
  "hero",
  "hero-parallax",
  // content
  "custom",
  "concept",
  "features",
  "testimonial",
  "value-props",
  "cta",
  // media
  "gallery",
  "embed",
  "instagram",
  "map",
] as const;

/**
 * マーケティング系 page-specific セクション。
 *
 * listing だが「最新◯◯」「厳選◯◯」として自由構成ページ（home / content / custom）の
 * 装飾ブロックにも使える。アーカイブページの core listing とは区別し、
 * 自由構成テンプレートにのみ opt-in 付与する。
 */
const MARKETING_SECTION_TYPES = [
  "space-showcase",
  "post-list",
  "news-list",
] as const;

const TEMPLATE_DEFS = {
  home: {
    id: "home",
    label: "ホーム",
    description: "トップページ — Hero + 特集セクション",
    additionalSectionTypes: MARKETING_SECTION_TYPES,
    defaultSections: DEFAULT_PAGE_SECTIONS["home"] ?? [],
    requiredSectionTypes: ["page-hero"],
  },
  content: {
    id: "content",
    label: "コンテンツページ",
    description: "/about のような自由構成",
    additionalSectionTypes: MARKETING_SECTION_TYPES,
    defaultSections: DEFAULT_PAGE_SECTIONS["about"] ?? [],
  },
  access: {
    id: "access",
    label: "アクセス",
    description: "拠点情報",
    additionalSectionTypes: ["location-list"],
    defaultSections: DEFAULT_PAGE_SECTIONS["access"] ?? [],
    requiredSectionTypes: ["location-list"],
  },
  contact: {
    id: "contact",
    label: "お問い合わせ",
    description: "問い合わせフォーム + 補足",
    additionalSectionTypes: ["contact-form"],
    defaultSections: DEFAULT_PAGE_SECTIONS["contact"] ?? [],
    requiredSectionTypes: ["contact-form"],
  },
  faq: {
    id: "faq",
    label: "FAQ",
    description: "よくあるご質問",
    additionalSectionTypes: ["faq-list"],
    defaultSections: DEFAULT_PAGE_SECTIONS["faq"] ?? [],
    requiredSectionTypes: ["faq-list"],
  },
  "news-archive": {
    id: "news-archive",
    label: "ニュース一覧",
    description: "お知らせ一覧",
    additionalSectionTypes: ["news-list"],
    defaultSections: DEFAULT_PAGE_SECTIONS["news"] ?? [],
    requiredSectionTypes: ["news-list"],
  },
  "blog-archive": {
    id: "blog-archive",
    label: "ブログ一覧",
    description: "ブログ記事一覧",
    additionalSectionTypes: ["post-list"],
    defaultSections: DEFAULT_PAGE_SECTIONS["posts"] ?? [],
    requiredSectionTypes: ["post-list"],
  },
  "events-archive": {
    id: "events-archive",
    label: "イベント一覧",
    description: "イベントカレンダー + 一覧",
    additionalSectionTypes: ["event-calendar"],
    defaultSections: DEFAULT_PAGE_SECTIONS["events"] ?? [],
    requiredSectionTypes: ["event-calendar"],
  },
  "spaces-archive": {
    id: "spaces-archive",
    label: "スペース一覧",
    description: "スペース一覧",
    additionalSectionTypes: ["space-list"],
    defaultSections: DEFAULT_PAGE_SECTIONS["spaces"] ?? [],
    requiredSectionTypes: ["space-list"],
  },
  reservation: {
    id: "reservation",
    label: "予約",
    description: "予約フォーム",
    // space-list / space-showcase は除外: reservation-form の Step 1 でスペース選択を
    // 内包するため二重表示になる (公開ページに同一スペース一覧が並ぶ silent UX bug 防止)。
    // page-specific は opt-in 制のため reservation-form のみ追加すれば自動的に達成される。
    additionalSectionTypes: ["reservation-form"],
    defaultSections: DEFAULT_PAGE_SECTIONS["reservation"] ?? [],
    requiredSectionTypes: ["reservation-form"],
  },
  custom: {
    id: "custom",
    label: "カスタム",
    description: "自由構成（管理者が任意に組む）",
    additionalSectionTypes: MARKETING_SECTION_TYPES,
    defaultSections: [
      // 最小構成: hero + custom + cta
      ...(DEFAULT_PAGE_SECTIONS["about"] ?? []).slice(0, 3),
    ],
  },
} satisfies Record<string, PageTemplateDef>;

function buildTemplate(def: PageTemplateDef): PageTemplate {
  return {
    ...def,
    allowedSectionTypes: [
      ...UNIVERSAL_SECTION_TYPES,
      ...def.additionalSectionTypes,
    ],
  };
}

export const PAGE_TEMPLATES: Record<string, PageTemplate> = Object.fromEntries(
  keysOf(TEMPLATE_DEFS).map((id) => [id, buildTemplate(TEMPLATE_DEFS[id])]),
);

/** universal セクション一覧（テスト / introspection 用に公開）。 */
export const UNIVERSAL_PAGE_SECTION_TYPES: readonly string[] =
  UNIVERSAL_SECTION_TYPES;

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
