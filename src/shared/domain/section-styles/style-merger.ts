/**
 * Section Style deep merge — Phase B.P3.
 *
 * Combines an ordered list of SectionStyleLayer objects (lowest to highest
 * specificity) into a final SectionStylePayload. Each group is merged with
 * shallow spread; `customClass` is only forwarded when the layer explicitly
 * provides it (undefined means "no opinion", not "clear").
 */

import {
  DEFAULT_SECTION_STYLE,
  type SectionStyleLayer,
  type SectionStylePayload,
} from "./types";

/**
 * Merge an ordered list of style layers into a resolved SectionStylePayload.
 *
 * @param layers - Array of layers ordered from lowest to highest specificity.
 *   Null/undefined entries are skipped.
 * @returns A fully resolved, non-optional SectionStylePayload.
 */
export function mergeStyleLayers(
  layers: readonly (SectionStyleLayer | null | undefined)[],
): SectionStylePayload {
  return layers.reduce<SectionStylePayload>((acc, layer) => {
    if (!layer) return acc;
    const next: SectionStylePayload = {
      spacing: { ...acc.spacing, ...layer.spacing },
      background: { ...acc.background, ...layer.background },
      container: { ...acc.container, ...layer.container },
      typography: { ...acc.typography, ...layer.typography },
      animation: { ...acc.animation, ...layer.animation },
    };
    // customClass: only override when the layer explicitly sets it (including "")
    if (layer.customClass !== undefined) {
      return { ...next, customClass: layer.customClass };
    }
    // preserve acc.customClass (if any) when layer doesn't specify one
    if (acc.customClass !== undefined) {
      return { ...next, customClass: acc.customClass };
    }
    return next;
  }, DEFAULT_SECTION_STYLE);
}
