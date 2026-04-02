import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import type { NavigationType } from "@generated/prisma/enums";
import type { Serialized } from "@/shared/lib/serialize";
import type {
  FlatNavigationItem,
  NavigationItemData,
  SocialLinkData,
} from "./types";
import { getProjectedDepth } from "./types";

// =============================================================================
// Nesting Computation
// =============================================================================

/**
 * After reorder, walk through items top-to-bottom and assign parentId
 * based on the projected depth of the dragged item.
 * Non-dragged items keep their existing depth (isChild).
 */
export function computeOrderWithNesting(
  reordered: FlatNavigationItem[],
  draggedId: string,
  offsetX: number,
  draggedOriginalDepth: 0 | 1,
): { id: string; order: number; parentId: string | null }[] {
  const projectedDepth = getProjectedDepth(offsetX, draggedOriginalDepth);

  // Build depth map: dragged item gets projected depth, others keep existing
  const depths = reordered.map((item) => ({
    item,
    depth: item.id === draggedId ? projectedDepth : item.depth,
  }));

  // Walk top-to-bottom, track the last root-level item
  let lastRootId: string | null = null;
  const updates: { id: string; order: number; parentId: string | null }[] = [];

  for (let i = 0; i < depths.length; i++) {
    const entry = depths[i];
    if (!entry) continue;

    const { item, depth } = entry;

    if (depth === 1 && lastRootId !== null) {
      // Child: parent is the last root item above
      updates.push({ id: item.id, order: i, parentId: lastRootId });
    } else {
      // Root item (or forced root because no parent above)
      updates.push({ id: item.id, order: i, parentId: null });
      lastRootId = item.id;
    }
  }

  return updates;
}

/**
 * Compute nesting from flat items without a drag offset (for indent/outdent buttons).
 */
export function computeOrderFromFlat(
  flatItems: FlatNavigationItem[],
): { id: string; order: number; parentId: string | null }[] {
  let lastRootId: string | null = null;
  const updates: { id: string; order: number; parentId: string | null }[] = [];

  for (let i = 0; i < flatItems.length; i++) {
    const item = flatItems[i];
    if (!item) continue;

    if (item.depth === 1 && lastRootId !== null) {
      updates.push({ id: item.id, order: i, parentId: lastRootId });
    } else {
      updates.push({ id: item.id, order: i, parentId: null });
      lastRootId = item.id;
    }
  }

  return updates;
}

// =============================================================================
// API Fetchers
// =============================================================================

export async function fetchNavigationItems(
  type: NavigationType,
): Promise<NavigationItemData[]> {
  const searchParams = new URLSearchParams({ type });
  return fetchAdminJson(`/admin/api/navigation?${searchParams.toString()}`);
}

export async function fetchSocialLinks(): Promise<
  Serialized<SocialLinkData>[]
> {
  return fetchAdminJson("/admin/api/navigation/social-links");
}
