/**
 * Section Style cascade resolver — Phase B.P3.
 *
 * Implements the 4-tier cascade defined in ADR 0017 §D2:
 *
 *   1. Hardcoded fallback  (DEFAULT_SECTION_STYLE)
 *   2. Global default      (settings.globalSectionStyle)
 *   3. Page-level          (page.pageStyle)
 *   4. Section preset      (section.style)
 *   5. Section instance override (section.styleOverride)
 *
 * Specificity increases from 1 → 5. Higher tiers win on a per-group basis
 * (spacing / background / container / typography / animation).
 */

import type {
  Page,
  Section,
  Settings,
  SectionStyle,
} from "@generated/prisma/client";
import { isRecord } from "@/shared/lib/serialize";
import type { SectionStyleLayer, SectionStylePayload } from "./types";
import { mergeStyleLayers } from "./style-merger";

// ---------------------------------------------------------------------------
// Public-compatible shape types (mirror of domain/sections/queries.ts)
// Used by section-renderer which cannot import Prisma types directly.
// ---------------------------------------------------------------------------

/**
 * Minimal shape for a style record — compatible with both SectionStyle (Prisma)
 * and PublicSectionStyle (from domain/sections/queries.ts).
 */
type StyleRecord = {
  readonly spacing: unknown;
  readonly background: unknown;
  readonly container: unknown;
  readonly typography: unknown;
  readonly animation: unknown;
  readonly customClass: string | null;
};

type SectionForStyle = {
  readonly style: StyleRecord | null;
  readonly styleOverride: unknown;
};

type PageForStyle = {
  readonly pageStyle: StyleRecord | null;
};

type SettingsForStyle = {
  readonly globalSectionStyle: StyleRecord | null;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the effective SectionStylePayload for a section by merging all
 * cascade layers from lowest to highest specificity.
 *
 * Accepts both Prisma model types and the lightweight public-facing shape types
 * (PublicSection / PublicPageForStyle / PublicSettingsForStyle from
 * domain/sections/queries.ts). Relation arguments may be null — in that case
 * the DEFAULT_SECTION_STYLE fallback is the effective style.
 */
export function resolveSectionStyle(
  section: (Section & { style: SectionStyle | null }) | SectionForStyle,
  page: (Page & { pageStyle: SectionStyle | null }) | PageForStyle,
  settings:
    | (Settings & { globalSectionStyle: SectionStyle | null })
    | SettingsForStyle,
): SectionStylePayload {
  const layers: (SectionStyleLayer | null)[] = [
    extractStylePayload(settings.globalSectionStyle),
    extractStylePayload(page.pageStyle),
    extractStylePayload(section.style),
    parseStyleOverride(section.styleOverride),
  ];
  return mergeStyleLayers(layers);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract a SectionStyleLayer from a SectionStyle DB record or a lightweight
 * StyleRecord shape (used by section-renderer via PublicSectionStyle).
 * Each JSON column (spacing / background / container / typography / animation)
 * is individually validated with isRecord() before inclusion.
 */
function extractStylePayload(
  style: SectionStyle | StyleRecord | null | undefined,
): SectionStyleLayer | null {
  if (!style) return null;

  const layer: Record<string, unknown> = {};

  if (isRecord(style.spacing)) layer["spacing"] = style.spacing;
  if (isRecord(style.background)) layer["background"] = style.background;
  if (isRecord(style.container)) layer["container"] = style.container;
  if (isRecord(style.typography)) layer["typography"] = style.typography;
  if (isRecord(style.animation)) layer["animation"] = style.animation;
  if (typeof style.customClass === "string")
    layer["customClass"] = style.customClass;

  // Safe: every key we set is a valid SectionStyleLayer field with the correct shape.
  // The cast is necessary because Prisma JSON fields return `JsonValue` (unknown).
  // We rely on isRecord() runtime checks to ensure type-safety.
  return layer as unknown as SectionStyleLayer;
}

/**
 * Parse a raw `styleOverride` JSON value (from Section.styleOverride) into a
 * SectionStyleLayer. Returns null when the value is not a non-null object.
 */
function parseStyleOverride(override: unknown): SectionStyleLayer | null {
  if (!isRecord(override)) return null;

  const layer: Record<string, unknown> = {};

  if (isRecord(override["spacing"])) layer["spacing"] = override["spacing"];
  if (isRecord(override["background"]))
    layer["background"] = override["background"];
  if (isRecord(override["container"]))
    layer["container"] = override["container"];
  if (isRecord(override["typography"]))
    layer["typography"] = override["typography"];
  if (isRecord(override["animation"]))
    layer["animation"] = override["animation"];
  if (typeof override["customClass"] === "string")
    layer["customClass"] = override["customClass"];

  return layer as unknown as SectionStyleLayer;
}
