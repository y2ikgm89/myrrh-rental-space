/**
 * CSP-safe dynamic styling via CSS custom properties + Tailwind arbitrary values.
 *
 * React `style=` 属性は CSP strict 下で禁止。動的 CSS は:
 * - サーバー: NonceStyleBlock + buildDataStyleRule
 * - クライアント: useImperativeCssVars / ImperativeCssScope
 */

import type { CSSProperties } from "react";

/** Shared CSS custom property names */
export const CSS_VAR = {
  containerSite: "--container-site",
  sectionTitleColor: "--section-title-color",
  sectionTextColor: "--section-text-color",
  sectionBgColor: "--section-bg-color",
  sectionOverlayOpacity: "--section-overlay-opacity",
  customBg: "--custom-bg",
  customText: "--custom-text",
  announcementBg: "--announcement-bg",
  announcementText: "--announcement-text",
  announcementStripe: "--announcement-stripe",
  heroMinHeight: "--hero-min-height",
  heroSlideOpacity: "--hero-slide-opacity",
  carouselTrackHeight: "--carousel-track-height",
  carouselCardWidth: "--carousel-card-width",
  carouselCardZIndex: "--carousel-card-z-index",
  carouselCardOpacity: "--carousel-card-opacity",
  carouselCardTransform: "--carousel-card-transform",
  readingProgress: "--reading-progress",
  adminZIndex: "--admin-z-index",
  editorHeight: "--editor-height",
  calendarSlotHeight: "--calendar-slot-height",
  calendarGridHeight: "--calendar-grid-height",
  calendarGridTemplate: "--calendar-grid-template",
  calendarOverlayHeight: "--calendar-overlay-height",
  calendarOverlayTop: "--calendar-overlay-top",
  inlineImageWidth: "--inline-image-width",
  colorSwatch: "--color-swatch",
} as const;

/** Tailwind classes that consume the corresponding CSS variables */
export const CSS_VAR_CLASS = {
  sectionTitleColor: "text-[var(--section-title-color)]",
  sectionTextColor: "text-[var(--section-text-color)]",
  sectionBgColor: "bg-[var(--section-bg-color)]",
  sectionOverlayOpacity: "opacity-[calc(var(--section-overlay-opacity)/100)]",
  customBg: "bg-[var(--custom-bg)]",
  customText: "text-[var(--custom-text)]",
  announcementBg: "bg-[var(--announcement-bg)]",
  announcementText: "text-[var(--announcement-text)]",
  heroMinHeight: "min-h-[var(--hero-min-height)]",
  heroSlideOpacity: "opacity-[var(--hero-slide-opacity)]",
  carouselTrackHeight: "h-[var(--carousel-track-height)]",
  carouselCardWidth: "w-[var(--carousel-card-width)]",
  carouselCardZIndex: "z-[var(--carousel-card-z-index)]",
  carouselCardOpacity: "opacity-[var(--carousel-card-opacity)]",
  carouselCardTransform: "[transform:var(--carousel-card-transform)]",
  readingProgress: "origin-left [transform:scaleX(var(--reading-progress))]",
  adminZIndex: "z-[var(--admin-z-index)]",
  editorHeight: "h-[var(--editor-height)]",
  calendarSlotHeight: "h-[var(--calendar-slot-height)]",
  calendarGridHeight: "h-[var(--calendar-grid-height)]",
  calendarGridTemplate: "[grid-template-columns:var(--calendar-grid-template)]",
  calendarOverlayHeight: "h-[var(--calendar-overlay-height)]",
  calendarOverlayTop: "top-[var(--calendar-overlay-top)]",
  inlineImageWidth: "w-[var(--inline-image-width)]",
  colorSwatch: "bg-[var(--color-swatch)]",
} as const;

export type CssVarRecord = Record<string, string | number | undefined | null>;

/** @internal buildDataStyleRule / imperative 用。React style= には使わない。 */
export function cssVarStyle(vars: CssVarRecord): CSSProperties | undefined {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined && value !== null && value !== "") {
      result[key] = String(value);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Merge multiple css-var style objects into one. */
export function mergeCssVarStyles(
  ...styles: Array<CSSProperties | undefined>
): CSSProperties | undefined {
  const merged: Record<string, string> = {};
  for (const style of styles) {
    if (!style) continue;
    for (const [key, value] of Object.entries(style)) {
      if (value !== undefined && value !== null && value !== "") {
        merged[key] = String(value);
      }
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}
