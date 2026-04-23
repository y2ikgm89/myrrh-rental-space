/**
 * Section Style Cascade — Zod validation schema (Phase B.C1)
 *
 * Mirrors the domain types defined in:
 *   `src/shared/domain/section-styles/types.ts`
 *
 * Domain types are the SSoT; this file only provides Zod parsing/validation
 * so we do NOT re-define literals here — we import them as arrays below to
 * keep both sides in sync.
 *
 * ADR 0017: `docs/architecture/decisions/0017-section-style-cascade.md`
 * Spec: `docs/superpowers/specs/section-style-cascade-design.md`
 */

import { z } from "zod";
import {
  DEFAULT_SECTION_STYLE,
  type SectionStylePayload,
} from "@/shared/domain/section-styles/types";

// ---------------------------------------------------------------------------
// Re-used URL / CTA / HEX helpers — kept for backwards-compat consumers
// ---------------------------------------------------------------------------

export {
  createSafeUrlSchema,
  createCtaSchemas,
  createCtaButtonItemSchema,
  ctaButtonVariants,
  ctaButtonSizes,
  transformLegacyCtaToButtons,
  transformCtaFields,
  optionalHexColorSchema,
  isValidHexColor,
} from "./cta-and-url";

export type {
  CTAButtonVariant,
  CTAButtonSize,
  CTAButtonItem,
} from "./cta-and-url";

// ---------------------------------------------------------------------------
// Group-level schemas
// ---------------------------------------------------------------------------

const spacingStepValues = ["none", "sm", "md", "lg", "xl"] as const;

export const sectionStyleSpacingSchema = z.object({
  paddingTop: z.enum(spacingStepValues, {
    error: "paddingTop は none/sm/md/lg/xl のいずれかです",
  }),
  paddingBottom: z.enum(spacingStepValues, {
    error: "paddingBottom は none/sm/md/lg/xl のいずれかです",
  }),
});

const backgroundTypeValues = [
  "default",
  "surface",
  "muted",
  "image",
  "gradient",
] as const;

export const sectionStyleBackgroundSchema = z.object({
  type: z.enum(backgroundTypeValues, {
    error: "background.type が無効です",
  }),
  value: z.string().optional(),
  overlayOpacity: z.number().min(0).max(100, {
    error: "overlayOpacity は 0〜100 です",
  }),
  imageUrl: z.string().optional(),
});

const maxWidthValues = ["sm", "md", "editorial", "lg", "xl", "full"] as const;

export const sectionStyleContainerSchema = z.object({
  maxWidth: z.enum(maxWidthValues, {
    error: "container.maxWidth が無効です",
  }),
});

const titleSizeValues = ["sm", "md", "lg", "xl"] as const;
const textAlignValues = ["left", "center", "right"] as const;

export const sectionStyleTypographySchema = z.object({
  titleSize: z.enum(titleSizeValues, {
    error: "typography.titleSize は sm/md/lg/xl のいずれかです",
  }),
  titleColor: z.string().optional(),
  textColor: z.string().optional(),
  textAlign: z.enum(textAlignValues, {
    error: "typography.textAlign は left/center/right のいずれかです",
  }),
});

const animationPresetValues = ["none", "fade", "slide-up", "scale"] as const;

export const sectionStyleAnimationSchema = z.object({
  preset: z.enum(animationPresetValues, {
    error: "animation.preset が無効です",
  }),
});

// ---------------------------------------------------------------------------
// Top-level payload schema
// ---------------------------------------------------------------------------

export const sectionStylePayloadSchema = z.object({
  spacing: sectionStyleSpacingSchema,
  background: sectionStyleBackgroundSchema,
  container: sectionStyleContainerSchema,
  typography: sectionStyleTypographySchema,
  animation: sectionStyleAnimationSchema,
  customClass: z.string().max(200).optional(),
});

/**
 * Parse an unknown value as SectionStylePayload.
 * Falls back to DEFAULT_SECTION_STYLE on parse failure.
 */
export function parseSectionStylePayload(value: unknown): SectionStylePayload {
  const result = sectionStylePayloadSchema.safeParse(value);
  if (!result.success) return DEFAULT_SECTION_STYLE;
  const d = result.data;
  // Explicit mapping to satisfy exactOptionalPropertyTypes:
  // Zod optional fields produce `string | undefined` but SectionStylePayload
  // uses `readonly field?: string` which requires omission of undefined values.
  const payload: SectionStylePayload = {
    spacing: {
      paddingTop: d.spacing.paddingTop,
      paddingBottom: d.spacing.paddingBottom,
    },
    background: {
      type: d.background.type,
      overlayOpacity: d.background.overlayOpacity,
      ...(d.background.value !== undefined && { value: d.background.value }),
      ...(d.background.imageUrl !== undefined && {
        imageUrl: d.background.imageUrl,
      }),
    },
    container: { maxWidth: d.container.maxWidth },
    typography: {
      titleSize: d.typography.titleSize,
      textAlign: d.typography.textAlign,
      ...(d.typography.titleColor !== undefined && {
        titleColor: d.typography.titleColor,
      }),
      ...(d.typography.textColor !== undefined && {
        textColor: d.typography.textColor,
      }),
    },
    animation: { preset: d.animation.preset },
    ...(d.customClass !== undefined && { customClass: d.customClass }),
  };
  return payload;
}

// ---------------------------------------------------------------------------
// Override schema — each group is partial so only changed fields need to be
// provided in styleOverride JSON columns.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Server Action input schemas (Style Library CRUD)
// ---------------------------------------------------------------------------

const sectionStyleScopeValues = ["global", "page", "section"] as const;
export const sectionStyleScopeSchema = z.enum(sectionStyleScopeValues, {
  error: "scope が不正です",
});
export type SectionStyleScope = z.infer<typeof sectionStyleScopeSchema>;

export const sectionStyleListFiltersSchema = z.object({
  scope: sectionStyleScopeSchema.optional(),
  applicableType: z
    .string()
    .max(100, { error: "applicableType は100文字以内です" })
    .optional(),
  search: z.string().max(100, { error: "search は100文字以内です" }).optional(),
});

export const createSectionStyleInputSchema = z.object({
  name: z
    .string()
    .min(1, { error: "名前は必須です" })
    .max(100, { error: "名前は100文字以内です" }),
  scope: sectionStyleScopeSchema,
  applicableTypes: z.array(z.string()),
  payload: sectionStylePayloadSchema,
  parentId: z.string().optional(),
});

export const updateSectionStyleInputSchema = z.object({
  name: z
    .string()
    .min(1, { error: "名前は必須です" })
    .max(100, { error: "名前は100文字以内です" })
    .optional(),
  applicableTypes: z.array(z.string()).optional(),
  payload: sectionStylePayloadSchema.partial().optional(),
});

export const deriveSectionStyleInputSchema = z.object({
  name: z
    .string()
    .min(1, { error: "名前は必須です" })
    .max(100, { error: "名前は100文字以内です" }),
  overrides: sectionStylePayloadSchema.partial().optional(),
});

export type CreateSectionStyleInput = z.infer<
  typeof createSectionStyleInputSchema
>;
export type UpdateSectionStyleInput = z.infer<
  typeof updateSectionStyleInputSchema
>;
export type DeriveSectionStyleInput = z.infer<
  typeof deriveSectionStyleInputSchema
>;

export const sectionStyleOverrideSchema = z.object({
  spacing: sectionStyleSpacingSchema.partial().optional(),
  background: sectionStyleBackgroundSchema.partial().optional(),
  container: sectionStyleContainerSchema.partial().optional(),
  typography: sectionStyleTypographySchema.partial().optional(),
  animation: sectionStyleAnimationSchema.partial().optional(),
  customClass: z.string().max(200).optional(),
});

export type SectionStyleOverride = z.infer<typeof sectionStyleOverrideSchema>;

/**
 * Parse an unknown value as a partial SectionStylePayload override.
 * Returns null when the value is not a parseable object.
 */
export function parseSectionStyleOverride(
  value: unknown,
): Partial<SectionStylePayload> | null {
  const result = sectionStyleOverrideSchema.safeParse(value);
  if (!result.success) return null;
  const d = result.data;
  // Return null when all fields are undefined (empty override)
  if (
    d.spacing === undefined &&
    d.background === undefined &&
    d.container === undefined &&
    d.typography === undefined &&
    d.animation === undefined &&
    d.customClass === undefined
  ) {
    return null;
  }
  // Build partial override using mutable intermediate type, then return as Partial<SectionStylePayload>
  type MutableOverride = {
    spacing?: SectionStylePayload["spacing"];
    background?: SectionStylePayload["background"];
    container?: SectionStylePayload["container"];
    typography?: SectionStylePayload["typography"];
    animation?: SectionStylePayload["animation"];
    customClass?: string;
  };
  const override: MutableOverride = {};
  if (d.spacing !== undefined) {
    // Use DEFAULT_SECTION_STYLE values as fallbacks for partial groups
    const base = DEFAULT_SECTION_STYLE.spacing;
    override.spacing = {
      paddingTop: d.spacing.paddingTop ?? base.paddingTop,
      paddingBottom: d.spacing.paddingBottom ?? base.paddingBottom,
    };
  }
  if (d.background !== undefined) {
    const base = DEFAULT_SECTION_STYLE.background;
    override.background = {
      type: d.background.type ?? base.type,
      overlayOpacity: d.background.overlayOpacity ?? base.overlayOpacity,
      ...(d.background.value !== undefined && { value: d.background.value }),
      ...(d.background.imageUrl !== undefined && {
        imageUrl: d.background.imageUrl,
      }),
    };
  }
  if (d.container !== undefined) {
    const base = DEFAULT_SECTION_STYLE.container;
    override.container = {
      maxWidth: d.container.maxWidth ?? base.maxWidth,
    };
  }
  if (d.typography !== undefined) {
    const base = DEFAULT_SECTION_STYLE.typography;
    override.typography = {
      titleSize: d.typography.titleSize ?? base.titleSize,
      textAlign: d.typography.textAlign ?? base.textAlign,
      ...(d.typography.titleColor !== undefined && {
        titleColor: d.typography.titleColor,
      }),
      ...(d.typography.textColor !== undefined && {
        textColor: d.typography.textColor,
      }),
    };
  }
  if (d.animation !== undefined) {
    const base = DEFAULT_SECTION_STYLE.animation;
    override.animation = {
      preset: d.animation.preset ?? base.preset,
    };
  }
  if (d.customClass !== undefined) {
    override.customClass = d.customClass;
  }
  return override;
}
