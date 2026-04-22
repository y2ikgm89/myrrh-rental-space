/**
 * Section Style applicableTypes helpers — Phase B.P3.
 *
 * A SectionStyle with an empty `applicableTypes` array applies to every
 * section type (global scope). A non-empty array acts as a whitelist.
 */

import type { SectionStyle } from "@generated/prisma/client";

/**
 * Return true when `style` is applicable to the given `sectionType`.
 *
 * - `applicableTypes.length === 0` → applies to **all** types
 * - `applicableTypes.length > 0`  → applies only when `sectionType` is in the list
 */
export function isStyleApplicableToType(
  style: Pick<SectionStyle, "applicableTypes">,
  sectionType: string,
): boolean {
  if (style.applicableTypes.length === 0) return true;
  return style.applicableTypes.includes(sectionType);
}

/**
 * Filter a list of SectionStyle objects to those applicable to `sectionType`.
 */
export function filterStylesByType<
  T extends Pick<SectionStyle, "applicableTypes">,
>(styles: readonly T[], sectionType: string): T[] {
  return styles.filter((s) => isStyleApplicableToType(s, sectionType));
}
