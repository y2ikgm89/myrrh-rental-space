import "server-only";

import * as adminQueries from "@/shared/domain/settings/admin-queries";
import * as announcementBar from "@/shared/domain/settings/announcement-bar";
import { getNotificationStaffCandidates as getNotificationStaffCandidatesQuery } from "@/shared/domain/users/queries";
import type { NotificationStaffCandidate } from "@/shared/domain/users/types";
import type {
  BusinessHours,
  BusinessHoursDay,
  BusinessTimeSlot,
  DiscountSettingsData,
  GoogleCalendarSettingsData,
  SettingsData,
  TaxSettings,
} from "@/shared/domain/settings/types";
import type { AnnouncementBarCarouselSettingsInput } from "@/shared/domain/settings/announcement-bar";
import type { Serialized } from "@/shared/lib/serialize";
import { requireAdminPermission } from "./_helpers";

export type {
  BusinessHours,
  BusinessHoursDay,
  BusinessTimeSlot,
  SettingsData,
  DiscountSettingsData,
  GoogleCalendarSettingsData,
  TaxSettings,
};

export async function getPublicSettings(): Promise<Serialized<SettingsData>> {
  return adminQueries.getPublicSettings();
}

export async function getSettings(): Promise<Serialized<SettingsData>> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getAdminSettings();
}

/** 通知先ピッカー用のスタッフ候補（メール・通知設定で利用）。 */
export async function getNotificationStaffCandidates(): Promise<
  NotificationStaffCandidate[]
> {
  await requireAdminPermission("settings", "read");
  return getNotificationStaffCandidatesQuery();
}

export async function getDiscountSettings(): Promise<DiscountSettingsData> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getDiscountSettings();
}

export async function getTaxSettings(): Promise<TaxSettings> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getTaxSettings();
}

export async function getAnnouncementBarCarouselSettings(): Promise<AnnouncementBarCarouselSettingsInput> {
  await requireAdminPermission("settings", "read");
  return announcementBar.getAnnouncementBarCarouselSettings();
}

export async function getGoogleCalendarSettings(): Promise<GoogleCalendarSettingsData | null> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getGoogleCalendarSettings();
}
