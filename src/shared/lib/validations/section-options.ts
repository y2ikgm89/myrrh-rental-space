/**
 * セクション共通オプション定数
 *
 * セクション横断で使用する値の定義。
 * Zodスキーマ・Tailwindクラスマップ・管理画面UIで共有。
 */

// =============================================================================
// 共通オプション値
// =============================================================================

/** 画像アスペクト比 */
export const imageAspectValues = [
  "original",
  "16:9",
  "4:3",
  "3:2",
  "1:1",
  "4:5",
] as const;
export type ImageAspect = (typeof imageAspectValues)[number];

/** カードスタイル */
export const cardStyleValues = ["bordered", "shadow", "minimal"] as const;
export type CardStyle = (typeof cardStyleValues)[number];

/** 角丸 */
export const borderRadiusValues = ["none", "sm", "lg"] as const;
export type BorderRadius = (typeof borderRadiusValues)[number];

/** コンテナ幅 */
export const containerWidthValues = ["sm", "md", "lg", "full"] as const;
export type ContainerWidth = (typeof containerWidthValues)[number];

/** ギャップサイズ */
export const gapSizeValues = ["sm", "md", "lg"] as const;
export type GapSize = (typeof gapSizeValues)[number];

/** コンテンツ配置 */
export const contentPositionValues = ["center", "left", "bottom-left"] as const;
export type ContentPosition = (typeof contentPositionValues)[number];

/** オーバーレイスタイル */
export const overlayStyleValues = ["gradient", "solid", "none"] as const;
export type OverlayStyle = (typeof overlayStyleValues)[number];

/** セクション高さ (HeroParallax) */
export const heroParallaxHeightValues = ["full", "80vh", "60vh"] as const;
export type HeroParallaxHeight = (typeof heroParallaxHeightValues)[number];

/** Features レイアウト */
export const featuresLayoutValues = [
  "hero-first",
  "equal-grid",
  "icon-left",
] as const;
export type FeaturesLayout = (typeof featuresLayoutValues)[number];

/** FAQ 初期開閉 */
export const faqInitialOpenValues = ["first", "none", "all"] as const;
export type FaqInitialOpen = (typeof faqInitialOpenValues)[number];

/** ギャラリー ホバーエフェクト */
export const galleryHoverEffectValues = ["zoom", "overlay", "none"] as const;
export type GalleryHoverEffect = (typeof galleryHoverEffectValues)[number];

/** Concept レイアウト */
export const conceptLayoutValues = ["side-by-side", "stacked"] as const;
export type ConceptLayout = (typeof conceptLayoutValues)[number];

/** ヒーロー高さ */
export const heroHeightValues = ["sm", "md", "lg", "full"] as const;
export type HeroHeight = (typeof heroHeightValues)[number];

/** ヒーローバリエーション */
export const heroVariantValues = [
  "default",
  "minimal",
  "split",
  "video",
  "parallax",
] as const;
export type HeroVariant = (typeof heroVariantValues)[number];

/** カスタムパディング */
export const paddingValues = ["none", "sm", "md", "lg"] as const;
export type Padding = (typeof paddingValues)[number];

/** 画像位置 */
export const imagePositionValues = ["left", "right"] as const;
export type ImagePosition = (typeof imagePositionValues)[number];

/** テキスト配置 */
export const textAlignValues = ["left", "center", "right"] as const;
export type TextAlign = (typeof textAlignValues)[number];

/** スペースリスト レイアウト */
export const spaceLayoutValues = ["grid", "list", "carousel"] as const;
export type SpaceLayout = (typeof spaceLayoutValues)[number];

/** ニュースリスト レイアウト */
export const newsLayoutValues = ["list", "card"] as const;
export type NewsLayout = (typeof newsLayoutValues)[number];

/** 投稿リスト レイアウト */
export const postLayoutValues = ["grid", "list"] as const;
export type PostLayout = (typeof postLayoutValues)[number];

/** CTA バリエーション */
export const ctaVariantValues = ["default", "centered", "split"] as const;
export type CtaVariant = (typeof ctaVariantValues)[number];

/** お客様の声 レイアウト */
export const testimonialLayoutValues = ["grid", "carousel", "list"] as const;
export type TestimonialLayout = (typeof testimonialLayoutValues)[number];

/** お客様の声 バリエーション */
export const testimonialVariantValues = ["default", "card", "minimal"] as const;
export type TestimonialVariant = (typeof testimonialVariantValues)[number];

/** ギャラリー レイアウト */
export const galleryLayoutValues = ["grid", "masonry", "carousel"] as const;
export type GalleryLayout = (typeof galleryLayoutValues)[number];

/** ギャラリーギャップ */
export const galleryGapValues = ["none", "sm", "md", "lg"] as const;
export type GalleryGap = (typeof galleryGapValues)[number];

/** お問い合わせ バリエーション */
export const contactFormVariantValues = [
  "default",
  "minimal",
  "split",
] as const;
export type ContactFormVariant = (typeof contactFormVariantValues)[number];

/** FAQ バリエーション */
export const faqVariantValues = ["default", "bordered", "minimal"] as const;
export type FaqVariant = (typeof faqVariantValues)[number];

/** 地図高さ */
export const mapHeightValues = ["sm", "md", "lg"] as const;
export type MapHeight = (typeof mapHeightValues)[number];

/** 埋め込みアスペクト比 */
export const embedAspectRatioValues = ["16:9", "4:3", "1:1", "auto"] as const;
export type EmbedAspectRatio = (typeof embedAspectRatioValues)[number];

/** スペースリスト 画像アスペクト比 (サブセット) */
export const spaceImageAspectValues = ["4:3", "3:2", "16:9"] as const;
export type SpaceImageAspect = (typeof spaceImageAspectValues)[number];

/** スペースショーケース 画像アスペクト比 (サブセット) */
export const showcaseImageAspectValues = ["4:3", "3:2", "16:9", "1:1"] as const;
export type ShowcaseImageAspect = (typeof showcaseImageAspectValues)[number];

/** 投稿リスト 画像アスペクト比 (サブセット) */
export const postImageAspectValues = ["16:9", "4:3", "1:1"] as const;
export type PostImageAspect = (typeof postImageAspectValues)[number];

/** ギャラリー 画像アスペクト比 (サブセット) */
export const galleryImageAspectValues = [
  "original",
  "4:3",
  "1:1",
  "16:9",
] as const;
export type GalleryImageAspect = (typeof galleryImageAspectValues)[number];

/** 最大幅 */
export const maxWidthValues = ["sm", "md", "lg", "xl", "full"] as const;
export type MaxWidth = (typeof maxWidthValues)[number];

// =============================================================================
// 管理画面 Select 用ラベル
// =============================================================================

export const imageAspectLabels: Record<ImageAspect, string> = {
  original: "オリジナル",
  "16:9": "16:9（ワイド）",
  "4:3": "4:3（スタンダード）",
  "3:2": "3:2",
  "1:1": "1:1（正方形）",
  "4:5": "4:5（ポートレート）",
};

export const cardStyleLabels: Record<CardStyle, string> = {
  bordered: "ボーダー",
  shadow: "シャドウ",
  minimal: "ミニマル",
};

export const borderRadiusLabels: Record<BorderRadius, string> = {
  none: "なし",
  sm: "小（rounded-lg）",
  lg: "大（rounded-2xl）",
};

export const containerWidthLabels: Record<ContainerWidth, string> = {
  sm: "S（max-w-xl）",
  md: "M（max-w-3xl）",
  lg: "L（max-w-5xl）",
  full: "全幅",
};

export const gapSizeLabels: Record<GapSize, string> = {
  sm: "小",
  md: "中",
  lg: "大",
};

export const contentPositionLabels: Record<ContentPosition, string> = {
  center: "中央",
  left: "左寄せ",
  "bottom-left": "左下",
};

export const overlayStyleLabels: Record<OverlayStyle, string> = {
  gradient: "グラデーション",
  solid: "単色",
  none: "なし",
};

export const heroParallaxHeightLabels: Record<HeroParallaxHeight, string> = {
  full: "全画面",
  "80vh": "80%",
  "60vh": "60%",
};

export const featuresLayoutLabels: Record<FeaturesLayout, string> = {
  "hero-first": "ヒーロー先頭",
  "equal-grid": "均等グリッド",
  "icon-left": "アイコン左",
};

export const faqInitialOpenLabels: Record<FaqInitialOpen, string> = {
  first: "最初の1件",
  none: "すべて閉じる",
  all: "すべて開く",
};

export const galleryHoverEffectLabels: Record<GalleryHoverEffect, string> = {
  zoom: "ズーム",
  overlay: "オーバーレイ",
  none: "なし",
};

export const conceptLayoutLabels: Record<ConceptLayout, string> = {
  "side-by-side": "横並び",
  stacked: "縦積み",
};

export const heroHeightLabels: Record<HeroHeight, string> = {
  sm: "小",
  md: "中",
  lg: "大",
  full: "全画面",
};

export const heroVariantLabels: Record<HeroVariant, string> = {
  default: "デフォルト",
  minimal: "ミニマル",
  split: "スプリット",
  video: "ビデオ",
  parallax: "パララックス",
};

export const spaceLayoutLabels: Record<SpaceLayout, string> = {
  grid: "グリッド",
  list: "リスト",
  carousel: "カルーセル",
};

export const newsLayoutLabels: Record<NewsLayout, string> = {
  list: "リスト",
  card: "カード",
};

export const postLayoutLabels: Record<PostLayout, string> = {
  grid: "グリッド",
  list: "リスト",
};

export const ctaVariantLabels: Record<CtaVariant, string> = {
  default: "デフォルト",
  centered: "中央",
  split: "スプリット",
};

export const testimonialLayoutLabels: Record<TestimonialLayout, string> = {
  grid: "グリッド",
  carousel: "カルーセル",
  list: "リスト",
};

export const testimonialVariantLabels: Record<TestimonialVariant, string> = {
  default: "デフォルト",
  card: "カード",
  minimal: "ミニマル",
};

export const galleryLayoutLabels: Record<GalleryLayout, string> = {
  grid: "グリッド",
  masonry: "メーソンリー",
  carousel: "カルーセル",
};

export const contactFormVariantLabels: Record<ContactFormVariant, string> = {
  default: "デフォルト",
  minimal: "ミニマル",
  split: "スプリット",
};

export const faqVariantLabels: Record<FaqVariant, string> = {
  default: "デフォルト",
  bordered: "ボーダー",
  minimal: "ミニマル",
};

export const mapHeightLabels: Record<MapHeight, string> = {
  sm: "小",
  md: "中",
  lg: "大",
};

export const embedAspectRatioLabels: Record<EmbedAspectRatio, string> = {
  "16:9": "16:9（ワイド）",
  "4:3": "4:3（スタンダード）",
  "1:1": "1:1（正方形）",
  auto: "自動",
};

export const paddingLabels: Record<Padding, string> = {
  none: "なし",
  sm: "小",
  md: "中",
  lg: "大",
};

export const imagePositionLabels: Record<ImagePosition, string> = {
  left: "左",
  right: "右",
};

export const textAlignLabels: Record<TextAlign, string> = {
  left: "左揃え",
  center: "中央揃え",
  right: "右揃え",
};

export const galleryGapLabels: Record<GalleryGap, string> = {
  none: "なし",
  sm: "小",
  md: "中",
  lg: "大",
};

export const spaceImageAspectLabels: Record<SpaceImageAspect, string> = {
  "4:3": "4:3（スタンダード）",
  "3:2": "3:2",
  "16:9": "16:9（ワイド）",
};

export const showcaseImageAspectLabels: Record<ShowcaseImageAspect, string> = {
  "4:3": "4:3（スタンダード）",
  "3:2": "3:2",
  "16:9": "16:9（ワイド）",
  "1:1": "1:1（正方形）",
};

export const postImageAspectLabels: Record<PostImageAspect, string> = {
  "16:9": "16:9（ワイド）",
  "4:3": "4:3（スタンダード）",
  "1:1": "1:1（正方形）",
};

export const galleryImageAspectLabels: Record<GalleryImageAspect, string> = {
  original: "オリジナル",
  "4:3": "4:3（スタンダード）",
  "1:1": "1:1（正方形）",
  "16:9": "16:9（ワイド）",
};

export const maxWidthLabels: Record<MaxWidth, string> = {
  sm: "S（max-w-2xl）",
  md: "M（max-w-3xl）",
  lg: "L（max-w-4xl）",
  xl: "XL（max-w-6xl）",
  full: "全幅",
};
