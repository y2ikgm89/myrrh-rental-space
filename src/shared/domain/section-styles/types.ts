/**
 * Section render style types and code-owned defaults.
 *
 * Page content editing is fixed-template + typed content forms. Visual spacing,
 * container width, and typography are owned by React components and section
 * definitions, not by admin-editable database records.
 */

// ---------------------------------------------------------------------------
// Payload schema for code-owned public section rendering styles.
// ---------------------------------------------------------------------------

export type SectionStyleSpacingStep = "none" | "sm" | "md" | "lg" | "xl";

export interface SectionStyleSpacing {
  readonly paddingTop: SectionStyleSpacingStep;
  readonly paddingBottom: SectionStyleSpacingStep;
}

export type SectionStyleBackgroundType =
  | "default"
  | "surface"
  | "muted"
  | "image"
  | "gradient";

export interface SectionStyleBackground {
  readonly type: SectionStyleBackgroundType;
  readonly value?: string;
  readonly overlayOpacity: number;
  readonly imageUrl?: string;
}

export type SectionStyleMaxWidth =
  | "sm"
  | "md"
  | "editorial"
  | "lg"
  | "xl"
  | "full";

export interface SectionStyleContainer {
  readonly maxWidth: SectionStyleMaxWidth;
}

export type SectionStyleTitleSize = "sm" | "md" | "lg" | "xl";
export type SectionStyleTextAlign = "left" | "center" | "right";

export interface SectionStyleTypography {
  readonly titleSize: SectionStyleTitleSize;
  readonly titleColor?: string;
  readonly textColor?: string;
  readonly textAlign: SectionStyleTextAlign;
}

export type SectionStyleAnimationPreset =
  | "none"
  | "fade"
  | "slide-up"
  | "scale";

export interface SectionStyleAnimation {
  readonly preset: SectionStyleAnimationPreset;
}

export interface SectionStylePayload {
  readonly spacing: SectionStyleSpacing;
  readonly background: SectionStyleBackground;
  readonly container: SectionStyleContainer;
  readonly typography: SectionStyleTypography;
  readonly animation: SectionStyleAnimation;
  readonly customClass?: string;
}

export const DEFAULT_SECTION_STYLE: SectionStylePayload = Object.freeze({
  spacing: { paddingTop: "md", paddingBottom: "md" },
  background: { type: "default", overlayOpacity: 0 },
  container: { maxWidth: "xl" },
  typography: { titleSize: "md", textAlign: "left" },
  animation: { preset: "fade" },
} satisfies SectionStylePayload);

const COMPACT_CENTER_STYLE: SectionStylePayload = Object.freeze({
  spacing: { paddingTop: "md", paddingBottom: "md" },
  background: { type: "default", overlayOpacity: 0 },
  container: { maxWidth: "xl" },
  typography: { titleSize: "md", textAlign: "center" },
  animation: { preset: "fade" },
} satisfies SectionStylePayload);

const CTA_SECTION_STYLE: SectionStylePayload = Object.freeze({
  spacing: { paddingTop: "md", paddingBottom: "md" },
  background: { type: "surface", overlayOpacity: 0 },
  container: { maxWidth: "lg" },
  typography: { titleSize: "xl", textAlign: "center" },
  animation: { preset: "fade" },
} satisfies SectionStylePayload);

const HERO_ADJACENT_STYLE: SectionStylePayload = Object.freeze({
  spacing: { paddingTop: "sm", paddingBottom: "lg" },
  background: { type: "default", overlayOpacity: 0 },
  container: { maxWidth: "xl" },
  typography: { titleSize: "lg", textAlign: "left" },
  animation: { preset: "fade" },
} satisfies SectionStylePayload);

const FULL_BLEED_STYLE: SectionStylePayload = Object.freeze({
  spacing: { paddingTop: "none", paddingBottom: "none" },
  background: { type: "default", overlayOpacity: 0 },
  container: { maxWidth: "full" },
  typography: { titleSize: "lg", textAlign: "center" },
  animation: { preset: "none" },
} satisfies SectionStylePayload);

const SECTION_TYPE_STYLES: Readonly<Record<string, SectionStylePayload>> =
  Object.freeze({
    cta: CTA_SECTION_STYLE,
    "contact-form": HERO_ADJACENT_STYLE,
    "event-calendar": HERO_ADJACENT_STYLE,
    "faq-list": HERO_ADJACENT_STYLE,
    gallery: FULL_BLEED_STYLE,
    "homepage-cta": CTA_SECTION_STYLE,
    "homepage-features": DEFAULT_SECTION_STYLE,
    "homepage-how-it-works": COMPACT_CENTER_STYLE,
    "homepage-spaces": FULL_BLEED_STYLE,
    instagram: FULL_BLEED_STYLE,
    "location-list": HERO_ADJACENT_STYLE,
    map: HERO_ADJACENT_STYLE,
    "news-list": HERO_ADJACENT_STYLE,
    "post-list": HERO_ADJACENT_STYLE,
    "space-list": HERO_ADJACENT_STYLE,
    "space-showcase": HERO_ADJACENT_STYLE,
  });

export function getDefaultSectionStyle(
  sectionType: string,
): SectionStylePayload {
  return SECTION_TYPE_STYLES[sectionType] ?? DEFAULT_SECTION_STYLE;
}
