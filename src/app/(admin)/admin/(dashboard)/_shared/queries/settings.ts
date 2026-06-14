import "server-only";

import * as adminQueries from "@/shared/domain/settings/admin-queries";
import * as announcementBar from "@/shared/domain/settings/announcement-bar";
import type {
  BusinessHours,
  BusinessHoursDay,
  BusinessTimeSlot,
  DiscountSettingsData,
  GoogleCalendarSettingsData,
  RobotsTxtData,
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
  RobotsTxtData,
  TaxSettings,
};

export async function getPublicSettings(): Promise<Serialized<SettingsData>> {
  return adminQueries.getPublicSettings();
}

export async function getSettings(): Promise<Serialized<SettingsData>> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getAdminSettings();
}

export async function getDiscountSettings(): Promise<DiscountSettingsData> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getDiscountSettings();
}

export async function getTaxSettings(): Promise<TaxSettings> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getTaxSettings();
}

export async function getPublicTaxSettings(): Promise<TaxSettings> {
  return adminQueries.getPublicTaxSettings();
}

export async function getAnnouncementBarCarouselSettings(): Promise<AnnouncementBarCarouselSettingsInput> {
  await requireAdminPermission("settings", "read");
  return announcementBar.getAnnouncementBarCarouselSettings();
}

export async function getGoogleCalendarSettings(): Promise<GoogleCalendarSettingsData | null> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getGoogleCalendarSettings();
}

export async function getRobotsTxtSettings(): Promise<RobotsTxtData> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getRobotsTxtSettings();
}
