/**
 * Section Style Cascade — Types & Defaults (Phase B.P2 stub)
 *
 * 詳細設計: `docs/superpowers/specs/section-style-cascade-design.md`
 * ADR 0017: `docs/architecture/decisions/0017-section-style-cascade.md`
 *
 * Phase B.P3 で resolver / merger / applicable-types ヘルパーを追加する。
 */

// ---------------------------------------------------------------------------
// Payload schema — domain-side mirror of the Zod schema (single source of truth
// lives in `src/shared/lib/validations/section-style.ts`, added in P3).
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

// ---------------------------------------------------------------------------
// Cascade layer helper — each layer contributes a partial payload (per-group
// partial is enough; sub-field merges happen inside `mergeStyleLayers` in P3).
// ---------------------------------------------------------------------------

export type SectionStyleLayer = {
  readonly spacing?: Partial<SectionStyleSpacing>;
  readonly background?: Partial<SectionStyleBackground>;
  readonly container?: Partial<SectionStyleContainer>;
  readonly typography?: Partial<SectionStyleTypography>;
  readonly animation?: Partial<SectionStyleAnimation>;
  readonly customClass?: string;
};

// ---------------------------------------------------------------------------
// Hardcoded fallback — specificity layer #1 in the 4-tier cascade.
// Mirrors Phase A's SectionWrapper default (paddingTop/Bottom = "md",
// maxWidth = "xl", background = "default", textAlign = "left").
// ---------------------------------------------------------------------------

export const DEFAULT_SECTION_STYLE: SectionStylePayload = Object.freeze({
  spacing: { paddingTop: "md", paddingBottom: "md" },
  background: { type: "default", overlayOpacity: 0 },
  container: { maxWidth: "xl" },
  typography: { titleSize: "md", textAlign: "left" },
  animation: { preset: "fade" },
} satisfies SectionStylePayload);

// ---------------------------------------------------------------------------
// Seed preset identifiers — consumed by `seed-section-styles.ts`, the admin
// Style Library dropdowns (P5), and migrate-section-design-to-style (P3).
// ---------------------------------------------------------------------------

export const SECTION_STYLE_PRESETS = {
  editorialStandard: "Editorial - Standard",
  editorialCompact: "Editorial - Compact",
  editorialCta: "Editorial - CTA",
  editorialHeroAdjacent: "Editorial - Hero Adjacent",
  editorialFullBleed: "Editorial - Full Bleed",
} as const;

export type SectionStylePresetKey = keyof typeof SECTION_STYLE_PRESETS;
