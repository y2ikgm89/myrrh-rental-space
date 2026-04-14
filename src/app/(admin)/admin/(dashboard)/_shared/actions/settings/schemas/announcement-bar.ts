/**
 * お知らせバー設定のZodスキーマ
 */

import { z } from "zod";
import {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
} from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// Announcement Bar Schemas
// =============================================================================

export const announcementBarCarouselSettingsSchema = z.object({
  announcementBarAnimation: z.enum(AnnouncementBarAnimation),
  announcementBarDuration: z.number().int().min(1000).max(30000),
  announcementBarAutoPlay: z.boolean(),
  announcementBarPauseOnHover: z.boolean(),
  announcementBarShowArrows: z.boolean(),
  announcementBarShowIndicator: z.boolean(),
  announcementBarDesignStyle: z.enum(AnnouncementBarDesignStyle),
  // Common Color Settings
  announcementBarBgColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  announcementBarTextColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  // Striped Design Settings
  announcementBarStripeColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  announcementBarStripeAnimation: z.boolean(),
  // Gradient Design Settings
  announcementBarGradientAnimation: z.boolean(),
  // Glass Design Settings
  announcementBarGlassAnimation: z.boolean(),
  // Sticky Settings
  announcementBarSticky: z.boolean(),
});

export type AnnouncementBarCarouselSettingsInput = z.infer<
  typeof announcementBarCarouselSettingsSchema
>;
