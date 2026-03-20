import { z } from "zod";
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
  iconUrl: string | null;
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
  iconUrl: z.string().nullable(),
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

// =============================================================================
// Utility Types
// =============================================================================

export type FlatNavigationItem = NavigationItemData & {
  isChild: boolean;
  depth: 0 | 1;
};

// =============================================================================
// Re-exports
// =============================================================================

export type { NavigationItemData, SocialLinkData };
