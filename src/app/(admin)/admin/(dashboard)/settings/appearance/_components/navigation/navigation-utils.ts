import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import {
  navigationItemsResponseSchema,
  socialLinksResponseSchema,
} from "@/admin/lib/admin-api-response-schemas";
import type { NavigationType } from "@/shared/lib/validations/enums/prisma-types";
import type { Serialized } from "@/shared/lib/serialize";
import type {
  FlatNavigationItem,
  NavigationItemData,
  SocialLinkData,
} from "./types";
import { getProjectedDepth } from "./types";

// =============================================================================
// Subtree Reorder (D&D)
// =============================================================================

/** Root + contiguous depth-1 children immediately following it. */
export function getSubtreeBlockSize(
  flatItems: FlatNavigationItem[],
  startIndex: number,
): number {
  const item = flatItems[startIndex];
  if (!item) return 0;
  if (item.depth !== 0) return 1;

  let size = 1;
  for (let i = startIndex + 1; i < flatItems.length; i++) {
    const next = flatItems[i];
    if (!next || next.depth === 0) break;
    size++;
  }
  return size;
}

/** Move a root subtree (or single item) like `arrayMove`, keeping children attached. */
export function reorderFlatWithSubtree(
  flatItems: FlatNavigationItem[],
  from: number,
  to: number,
): FlatNavigationItem[] {
  if (from === to) return flatItems;

  const blockSize = getSubtreeBlockSize(flatItems, from);
  const block = flatItems.slice(from, from + blockSize);
  const without = [
    ...flatItems.slice(0, from),
    ...flatItems.slice(from + blockSize),
  ];

  let insertAt = to;
  if (from < to) {
    insertAt = to - blockSize + 1;
  }
  insertAt = Math.max(0, Math.min(insertAt, without.length));

  return [...without.slice(0, insertAt), ...block, ...without.slice(insertAt)];
}

export function flatItemHasChildren(
  flatItems: FlatNavigationItem[],
  index: number,
): boolean {
  return getSubtreeBlockSize(flatItems, index) > 1;
}

function collectSubtreeChildIds(
  reordered: FlatNavigationItem[],
  draggedIndex: number,
): Set<string> {
  const childIds = new Set<string>();
  const dragged = reordered[draggedIndex];
  if (!dragged || dragged.depth !== 0) return childIds;

  for (let i = draggedIndex + 1; i < reordered.length; i++) {
    const next = reordered[i];
    if (!next || next.depth === 0) break;
    childIds.add(next.id);
  }
  return childIds;
}

// =============================================================================
// Nesting Computation
// =============================================================================

/**
 * After reorder, walk through items top-to-bottom and assign parentId
 * based on the projected depth of the dragged item.
 * Dragged root subtrees stay attached; items with children cannot nest.
 */
export function computeOrderWithNesting(
  reordered: FlatNavigationItem[],
  draggedId: string,
  offsetX: number,
  draggedOriginalDepth: 0 | 1,
): { id: string; order: number; parentId: string | null }[] {
  const draggedIndex = reordered.findIndex((item) => item.id === draggedId);
  const draggedSubtreeChildIds =
    draggedIndex === -1
      ? new Set<string>()
      : collectSubtreeChildIds(reordered, draggedIndex);
  const draggedHasChildren = draggedSubtreeChildIds.size > 0;

  let projectedDepth = getProjectedDepth(offsetX, draggedOriginalDepth);
  if (draggedHasChildren && projectedDepth === 1) {
    projectedDepth = 0;
  }

  const depths = reordered.map((item) => {
    if (item.id === draggedId) {
      return { item, depth: projectedDepth };
    }
    if (draggedSubtreeChildIds.has(item.id)) {
      return { item, depth: 1 as const };
    }
    return { item, depth: item.depth };
  });

  let lastRootId: string | null = null;
  const updates: { id: string; order: number; parentId: string | null }[] = [];

  for (let i = 0; i < depths.length; i++) {
    const entry = depths[i];
    if (!entry) continue;

    const { item, depth } = entry;

    if (draggedSubtreeChildIds.has(item.id)) {
      updates.push({ id: item.id, order: i, parentId: draggedId });
      continue;
    }

    if (depth === 1 && lastRootId !== null) {
      updates.push({ id: item.id, order: i, parentId: lastRootId });
    } else {
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
  return fetchAdminJson(
    `/admin/api/navigation?${searchParams.toString()}`,
    navigationItemsResponseSchema,
  );
}

export async function fetchSocialLinks(): Promise<
  Serialized<SocialLinkData>[]
> {
  return fetchAdminJson(
    "/admin/api/navigation/social-links",
    socialLinksResponseSchema,
  );
}
