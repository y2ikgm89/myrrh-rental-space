/**
 * セクション config パーサー（Zod 不使用）
 *
 * 公開ページの Client Components で使用。
 * Zod の safeParse を Set.has に置換することで
 * Zod ライブラリをクライアントバンドルから除去。
 *
 * admin 側は section.ts の re-export 経由で同じ関数を使用するため
 * インターフェースに変更なし。
 */

import {
  cardStyleValues,
  borderRadiusValues,
  containerWidthValues,
  gapSizeValues,
  contentPositionValues,
  overlayStyleValues,
  heroParallaxHeightValues,
  featuresLayoutValues,
  faqInitialOpenValues,
  galleryHoverEffectValues,
  conceptLayoutValues,
  heroHeightValues,
  heroVariantValues,
  paddingValues,
  imagePositionValues,
  textAlignValues,
  spaceLayoutValues,
  newsLayoutValues,
  postLayoutValues,
  ctaVariantValues,
  testimonialLayoutValues,
  testimonialVariantValues,
  galleryLayoutValues,
  galleryGapValues,
  contactFormVariantValues,
  faqVariantValues,
  mapHeightValues,
  embedAspectRatioValues,
  imageAspectValues,
  spaceImageAspectValues,
  showcaseImageAspectValues,
  postImageAspectValues,
  galleryImageAspectValues,
  maxWidthValues,
  type ImageAspect,
  type CardStyle,
  type BorderRadius,
  type ContainerWidth,
  type GapSize,
  type ContentPosition,
  type OverlayStyle,
  type HeroParallaxHeight,
  type FeaturesLayout,
  type FaqInitialOpen,
  type GalleryHoverEffect,
  type ConceptLayout,
  type HeroHeight,
  type HeroVariant,
  type Padding,
  type ImagePosition,
  type TextAlign,
  type SpaceLayout,
  type NewsLayout,
  type PostLayout,
  type CtaVariant,
  type TestimonialLayout,
  type TestimonialVariant,
  type GalleryLayout,
  type GalleryGap,
  type ContactFormVariant,
  type FaqVariant,
  type MapHeight,
  type EmbedAspectRatio,
  type SpaceImageAspect,
  type ShowcaseImageAspect,
  type PostImageAspect,
  type GalleryImageAspect,
  type MaxWidth,
} from "./section-options";

// =============================================================================
// Generic parser factory
// =============================================================================

/**
 * 指定された値配列に含まれるかチェックし、含まれなければデフォルト値を返す。
 * Zod の safeParse と同じ振る舞いを Set.has で実現。
 */
function createParser<T extends string>(
  values: readonly T[],
  defaultValue: NoInfer<T>,
): (value: string) => T {
  const set = new Set<string>(values);
  const isValid = (v: string): v is T => set.has(v);
  return (value: string): T => (isValid(value) ? value : defaultValue);
}

// =============================================================================
// Parse functions
// =============================================================================

export const parseHeroHeight: (value: string) => HeroHeight = createParser(
  heroHeightValues,
  "md",
);

export const parseMaxWidth: (value: string) => MaxWidth = createParser(
  maxWidthValues,
  "lg",
);

export const parsePadding: (value: string) => Padding = createParser(
  paddingValues,
  "md",
);

export const parseSpaceLayout: (value: string) => SpaceLayout = createParser(
  spaceLayoutValues,
  "grid",
);

export const parseNewsLayout: (value: string) => NewsLayout = createParser(
  newsLayoutValues,
  "list",
);

export const parsePostLayout: (value: string) => PostLayout = createParser(
  postLayoutValues,
  "grid",
);

export const parseCtaVariant: (value: string) => CtaVariant = createParser(
  ctaVariantValues,
  "default",
);

export const parseGalleryLayout: (value: string) => GalleryLayout =
  createParser(galleryLayoutValues, "grid");

export const parseGalleryGap: (value: string) => GalleryGap = createParser(
  galleryGapValues,
  "md",
);

export const parseTestimonialLayout: (value: string) => TestimonialLayout =
  createParser(testimonialLayoutValues, "carousel");

export const parseTestimonialVariant: (value: string) => TestimonialVariant =
  createParser(testimonialVariantValues, "default");

export const parseMapHeight: (value: string) => MapHeight = createParser(
  mapHeightValues,
  "md",
);

export const parseEmbedAspectRatio: (value: string) => EmbedAspectRatio =
  createParser(embedAspectRatioValues, "16:9");

export const parseCardStyle: (value: string) => CardStyle = createParser(
  cardStyleValues,
  "bordered",
);

export const parseBorderRadius: (value: string) => BorderRadius = createParser(
  borderRadiusValues,
  "sm",
);

export const parseContainerWidth: (value: string) => ContainerWidth =
  createParser(containerWidthValues, "md");

export const parseGapSize: (value: string) => GapSize = createParser(
  gapSizeValues,
  "md",
);

export const parseContentPosition: (value: string) => ContentPosition =
  createParser(contentPositionValues, "center");

export const parseOverlayStyle: (value: string) => OverlayStyle = createParser(
  overlayStyleValues,
  "gradient",
);

export const parseHeroParallaxHeight: (value: string) => HeroParallaxHeight =
  createParser(heroParallaxHeightValues, "full");

export const parseFeaturesLayout: (value: string) => FeaturesLayout =
  createParser(featuresLayoutValues, "hero-first");

export const parseFaqInitialOpen: (value: string) => FaqInitialOpen =
  createParser(faqInitialOpenValues, "none");

export const parseGalleryHoverEffect: (value: string) => GalleryHoverEffect =
  createParser(galleryHoverEffectValues, "zoom");

export const parseConceptLayout: (value: string) => ConceptLayout =
  createParser(conceptLayoutValues, "side-by-side");

export const parseImageAspect: (value: string) => ImageAspect = createParser(
  imageAspectValues,
  "original",
);

export const parseSpaceImageAspect: (value: string) => SpaceImageAspect =
  createParser(spaceImageAspectValues, "4:3");

export const parsePostImageAspect: (value: string) => PostImageAspect =
  createParser(postImageAspectValues, "16:9");

export const parseGalleryImageAspect: (value: string) => GalleryImageAspect =
  createParser(galleryImageAspectValues, "original");

export const parseShowcaseImageAspect: (value: string) => ShowcaseImageAspect =
  createParser(showcaseImageAspectValues, "4:3");

export const parseHeroVariant: (value: string) => HeroVariant = createParser(
  heroVariantValues,
  "default",
);

export const parseContactFormVariant: (value: string) => ContactFormVariant =
  createParser(contactFormVariantValues, "default");

export const parseFaqVariant: (value: string) => FaqVariant = createParser(
  faqVariantValues,
  "default",
);

export const parseImagePosition: (value: string) => ImagePosition =
  createParser(imagePositionValues, "right");

export const parseTextAlign: (value: string) => TextAlign = createParser(
  textAlignValues,
  "left",
);
