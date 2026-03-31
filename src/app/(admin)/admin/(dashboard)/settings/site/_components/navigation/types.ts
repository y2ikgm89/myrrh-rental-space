import { z } from "zod";
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
import type { NavigationType, SocialPlatform } from "@/shared/db/enums";
import type {
  NavigationItemData,
  SocialLinkData,
} from "@/shared/domain/navigation/queries";

// =============================================================================
// Navigation Form Types
// =============================================================================

export type NavFormData = {
  type: NavigationType;
  parentId: string | null;
  label: string;
  url: string;
  isExternal: boolean;
  order: number;
  isActive: boolean;
};

export const navFormSchema = z.object({
  type: z.enum(["HEADER_DESKTOP", "HEADER_MOBILE", "FOOTER"]),
  parentId: z.string().nullable(),
  label: z.string().min(1, { error: "ラベルは必須です" }).max(50),
  url: z.string().min(1, { error: "URLは必須です" }),
  isExternal: z.boolean(),
  order: z.number().int().min(0),
  isActive: z.boolean(),
}) satisfies z.ZodType<NavFormData>;

// =============================================================================
// Social Link Form Types
// =============================================================================

export type SocialFormData = {
  platform: SocialPlatform;
  url: string;
  order: number;
  isActive: boolean;
  showOnDesktop: boolean;
  showOnMobile: boolean;
};

export const socialFormSchema = z.object({
  platform: z.enum([
    "TWITTER",
    "FACEBOOK",
    "INSTAGRAM",
    "YOUTUBE",
    "LINE",
    "TIKTOK",
    "OTHER",
  ]),
  url: z
    .string()
    .min(1, { error: "URLは必須です" })
    .url({ error: "有効なURLを入力してください" }),
  order: z.number().int().min(0),
  isActive: z.boolean(),
  showOnDesktop: z.boolean(),
  showOnMobile: z.boolean(),
}) satisfies z.ZodType<SocialFormData>;

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
// Utility Types
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
