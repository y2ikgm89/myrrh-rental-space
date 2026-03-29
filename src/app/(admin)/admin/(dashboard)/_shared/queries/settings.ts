import "server-only";

import * as adminQueries from "@/shared/domain/settings/admin-queries";
import * as announcementBar from "@/shared/domain/settings/announcement-bar";
import type {
  BusinessHours,
  BusinessHoursDay,
  BusinessTimeSlot,
  CancellationPolicyOption,
  DiscountSettingsData,
  GoogleCalendarSettingsData,
  RobotsTxtData,
  SettingsData,
  TaxSettingsData,
  TermsAgreementSettingsData,
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
  TaxSettingsData,
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

export async function getTaxSettings(): Promise<TaxSettingsData> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getTaxSettings();
}

export async function getPublicTaxSettings(): Promise<TaxSettingsData> {
  return adminQueries.getPublicTaxSettings();
}

export async function getTermsAgreementSettings(): Promise<TermsAgreementSettingsData | null> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getTermsAgreementSettings();
}

export async function getCancellationPolicies(): Promise<
  Serialized<CancellationPolicyOption>[]
> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getCancellationPolicies();
}

export async function getAnnouncementBarCarouselSettings(): Promise<AnnouncementBarCarouselSettingsInput> {
  await requireAdminPermission("settings", "read");
  return announcementBar.getAnnouncementBarCarouselSettings();
}

export async function getPermalinkSettings(): Promise<{
  postPermalinkStructure: string;
}> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getAdminPermalinkSettings();
}

export async function getGoogleCalendarSettings(): Promise<GoogleCalendarSettingsData | null> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getGoogleCalendarSettings();
}

export async function getRobotsTxtSettings(): Promise<RobotsTxtData> {
  await requireAdminPermission("settings", "read");
  return adminQueries.getRobotsTxtSettings();
}
