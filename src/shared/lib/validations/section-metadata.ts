/**
 * セクション表示メタデータ
 *
 * ラベル・説明・アイコン・カテゴリ分類・デフォルト順序。
 * SectionType enum のみに依存し、Zod スキーマとは独立。
 */

import { SectionType } from "@/shared/db/enums";

// =============================================================================
// 表示名・説明・アイコン
// =============================================================================

export const sectionTypeLabels: Record<SectionType, string> = {
  [SectionType.HERO]: "ヒーロー",
  [SectionType.HERO_PARALLAX]: "パララックスヒーロー",
  [SectionType.CUSTOM]: "カスタム",
  [SectionType.CONCEPT]: "コンセプト",
  [SectionType.SPACE_LIST]: "スペース一覧",
  [SectionType.SPACE_SHOWCASE]: "スペースショーケース",
  [SectionType.NEWS_LIST]: "お知らせ一覧",
  [SectionType.POST_LIST]: "記事一覧",
  [SectionType.FAQ_LIST]: "よくあるご質問",
  [SectionType.FEATURES]: "特徴",
  [SectionType.TESTIMONIAL]: "体験談・レビュー",
  [SectionType.GALLERY]: "ギャラリー",
  [SectionType.CTA]: "CTA（行動喚起）",
  [SectionType.CONTACT_FORM]: "お問い合わせフォーム",
  [SectionType.MAP]: "地図",
  [SectionType.EMBED]: "埋め込み",
  [SectionType.INSTAGRAM]: "Instagram",
};

export const sectionTypeDescriptions: Record<SectionType, string> = {
  [SectionType.HERO]:
    "ページ上部に表示する大きなバナー。背景画像とCTAボタンを配置できます。",
  [SectionType.HERO_PARALLAX]:
    "パララックス効果付きヒーロー。スクロールに連動した奥行きのある表現。",
  [SectionType.CUSTOM]: "Lexicalエディタで自由にコンテンツを作成できます。",
  [SectionType.CONCEPT]:
    "見出し・本文・画像の2カラム構成。ブランドストーリーの表現に最適。",
  [SectionType.SPACE_LIST]: "スペース一覧をグリッド形式で表示します。",
  [SectionType.SPACE_SHOWCASE]: "スペースを大きなカードで魅力的に紹介します。",
  [SectionType.NEWS_LIST]: "お知らせ一覧を表示します。",
  [SectionType.POST_LIST]: "ブログ記事一覧を表示します。",
  [SectionType.FAQ_LIST]:
    "よくある質問と回答をアコーディオン形式で表示します。",
  [SectionType.FEATURES]: "特徴をアイコン付きカードで表示します。",
  [SectionType.TESTIMONIAL]: "お客様の声やレビューを表示します。",
  [SectionType.GALLERY]: "画像ギャラリーを表示します。",
  [SectionType.CTA]:
    "行動喚起セクション。予約やお問い合わせへの導線を配置します。",
  [SectionType.CONTACT_FORM]: "お問い合わせフォームを表示します。",
  [SectionType.MAP]: "Google Mapsで位置情報を表示します。",
  [SectionType.EMBED]:
    "YouTubeやGoogleフォームなどの外部コンテンツを埋め込みます。",
  [SectionType.INSTAGRAM]: "Instagramフィードを表示します。",
};

export const sectionTypeIcons: Record<SectionType, string> = {
  [SectionType.HERO]: "Image",
  [SectionType.HERO_PARALLAX]: "Layers",
  [SectionType.CUSTOM]: "FileText",
  [SectionType.CONCEPT]: "Sparkles",
  [SectionType.SPACE_LIST]: "LayoutGrid",
  [SectionType.SPACE_SHOWCASE]: "GalleryVerticalEnd",
  [SectionType.NEWS_LIST]: "Newspaper",
  [SectionType.POST_LIST]: "FilePen",
  [SectionType.FAQ_LIST]: "CircleHelp",
  [SectionType.FEATURES]: "Zap",
  [SectionType.TESTIMONIAL]: "Quote",
  [SectionType.GALLERY]: "Images",
  [SectionType.CTA]: "MousePointerClick",
  [SectionType.CONTACT_FORM]: "Mail",
  [SectionType.MAP]: "MapPin",
  [SectionType.EMBED]: "Code",
  [SectionType.INSTAGRAM]: "Aperture",
};

// =============================================================================
// セクションカテゴリ分類
// =============================================================================

export type SectionCategory = "hero" | "content" | "list" | "cta" | "media";

export const sectionCategoryLabels: Record<SectionCategory, string> = {
  hero: "ヒーロー",
  content: "コンテンツ",
  list: "一覧表示",
  cta: "CTA・フォーム",
  media: "メディア・埋め込み",
};

export const sectionTypeCategories: Record<SectionType, SectionCategory> = {
  [SectionType.HERO]: "hero",
  [SectionType.HERO_PARALLAX]: "hero",
  [SectionType.CUSTOM]: "content",
  [SectionType.CONCEPT]: "content",
  [SectionType.FEATURES]: "content",
  [SectionType.SPACE_LIST]: "list",
  [SectionType.SPACE_SHOWCASE]: "list",
  [SectionType.NEWS_LIST]: "list",
  [SectionType.POST_LIST]: "list",
  [SectionType.FAQ_LIST]: "list",
  [SectionType.CTA]: "cta",
  [SectionType.CONTACT_FORM]: "cta",
  [SectionType.GALLERY]: "media",
  [SectionType.TESTIMONIAL]: "media",
  [SectionType.MAP]: "media",
  [SectionType.EMBED]: "media",
  [SectionType.INSTAGRAM]: "media",
};

/** カテゴリ順にセクションタイプをグループ化 */
export const sectionTypesByCategory: {
  category: SectionCategory;
  label: string;
  types: SectionType[];
}[] = (
  ["hero", "content", "list", "cta", "media"] satisfies SectionCategory[]
).map((category) => ({
  category,
  label: sectionCategoryLabels[category],
  types: Object.values(SectionType).filter(
    (type) => sectionTypeCategories[type] === category,
  ),
}));

/** ホームページセクションのデフォルト順序 */
export const defaultHomepageSectionOrder: SectionType[] = [
  SectionType.HERO_PARALLAX,
  SectionType.CONCEPT,
  SectionType.SPACE_SHOWCASE,
  SectionType.FEATURES,
  SectionType.CTA,
];
