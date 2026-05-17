import type { TablerIcon } from "@tabler/icons-react";
import {
  IconBrandX,
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandYoutube,
  IconBrandLine,
  IconBrandTiktok,
  IconExternalLink,
} from "@tabler/icons-react";
import type { SocialPlatform } from "@/shared/lib/validations/enums/prisma-types";
import type {
  NavigationItemData,
  SocialLinkData,
} from "@/shared/domain/navigation/queries";

// =============================================================================
// Constants
// =============================================================================

export const platformLabels: Record<SocialPlatform, string> = {
  TWITTER: "X (Twitter)",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  LINE: "LINE",
  TIKTOK: "TikTok",
  OTHER: "その他",
};

export const platformIcons: Record<SocialPlatform, TablerIcon> = {
  TWITTER: IconBrandX,
  FACEBOOK: IconBrandFacebook,
  INSTAGRAM: IconBrandInstagram,
  YOUTUBE: IconBrandYoutube,
  LINE: IconBrandLine,
  TIKTOK: IconBrandTiktok,
  OTHER: IconExternalLink,
};

// =============================================================================
// Form Defaults (SocialLinkFormDialog の platform state 型)
// =============================================================================

export type SocialFormDefaults = {
  platform: SocialPlatform;
};

// =============================================================================
// Utility Types (D&D)
// =============================================================================

export type FlatNavigationItem = NavigationItemData & {
  isChild: boolean;
  depth: 0 | 1;
};

// =============================================================================
// D&D Indentation Constants & Helpers
// =============================================================================

export const INDENT_WIDTH = 50;

export function getProjectedDepth(offsetX: number, currentDepth: 0 | 1): 0 | 1 {
  const projectedPixels = currentDepth * INDENT_WIDTH + offsetX;
  const raw = Math.round(projectedPixels / INDENT_WIDTH);
  return Math.max(0, Math.min(1, raw)) === 1 ? 1 : 0;
}

/**
 * Flatten hierarchical NavigationItemData[] into a flat list with depth annotations.
 */
export function flattenNavItems(
  items: NavigationItemData[],
): FlatNavigationItem[] {
  const result: FlatNavigationItem[] = [];
  for (const item of items) {
    result.push({ ...item, isChild: false, depth: 0 });
    for (const child of item.children) {
      result.push({ ...child, isChild: true, depth: 1 });
    }
  }
  return result;
}

/**
 * Rebuild hierarchical NavigationItemData[] from flat items with parentId assignments.
 */
export function rebuildHierarchy(
  updates: { id: string; order: number; parentId: string | null }[],
  flatItems: FlatNavigationItem[],
): NavigationItemData[] {
  // Build a lookup from flat items for full data
  const itemMap = new Map<string, FlatNavigationItem>();
  for (const item of flatItems) {
    itemMap.set(item.id, item);
  }

  // Sort by order
  const sorted = [...updates].sort((a, b) => a.order - b.order);

  // Group: roots first, then attach children
  const roots: NavigationItemData[] = [];
  const childrenByParent = new Map<string, NavigationItemData[]>();

  for (const update of sorted) {
    const original = itemMap.get(update.id);
    if (!original) continue;

    const item: NavigationItemData = {
      id: original.id,
      type: original.type,
      label: original.label,
      url: original.url,
      isExternal: original.isExternal,
      order: update.order,
      isActive: original.isActive,
      parentId: update.parentId,
      createdAt: original.createdAt,
      updatedAt: original.updatedAt,
      children: [],
    };

    if (update.parentId === null) {
      roots.push(item);
    } else {
      const siblings = childrenByParent.get(update.parentId) ?? [];
      siblings.push(item);
      childrenByParent.set(update.parentId, siblings);
    }
  }

  // Attach children to their parents
  for (const root of roots) {
    root.children = childrenByParent.get(root.id) ?? [];
  }

  return roots;
}

// =============================================================================
// Re-exports
// =============================================================================

export type { NavigationItemData, SocialLinkData };
