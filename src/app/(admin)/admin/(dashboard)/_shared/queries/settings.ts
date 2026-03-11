import "server-only";

import { getAnnouncementBarCarouselSettings as getAnnouncementBarCarouselSettingsQuery } from "@/shared/domain/settings/announcement-bar";
import {
  getAdminPermalinkSettings as getAdminPermalinkSettingsQuery,
  getAdminSettings as getAdminSettingsQuery,
  getCancellationPolicies as getCancellationPoliciesQuery,
  getDiscountSettings as getDiscountSettingsQuery,
  getGoogleCalendarSettings as getGoogleCalendarSettingsQuery,
  getPublicSettings as getPublicSettingsQuery,
  getPublicTaxSettings as getPublicTaxSettingsQuery,
  getRobotsTxtSettings as getRobotsTxtSettingsQuery,
  getTaxSettings as getTaxSettingsQuery,
  getTermsAgreementSettings as getTermsAgreementSettingsQuery,
} from "@/shared/domain/settings/admin-queries";
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
  return getPublicSettingsQuery();
}

export async function getSettings(): Promise<Serialized<SettingsData>> {
  await requireAdminPermission("settings", "read");
  return getAdminSettingsQuery();
}

export async function getDiscountSettings(): Promise<DiscountSettingsData> {
  await requireAdminPermission("settings", "read");
  return getDiscountSettingsQuery();
}

export async function getTaxSettings(): Promise<TaxSettingsData> {
  await requireAdminPermission("settings", "read");
  return getTaxSettingsQuery();
}

export async function getPublicTaxSettings(): Promise<TaxSettingsData> {
  return getPublicTaxSettingsQuery();
}

export async function getTermsAgreementSettings(): Promise<TermsAgreementSettingsData | null> {
  await requireAdminPermission("settings", "read");
  return getTermsAgreementSettingsQuery();
}

export async function getCancellationPolicies(): Promise<
  Serialized<CancellationPolicyOption>[]
> {
  await requireAdminPermission("settings", "read");
  return getCancellationPoliciesQuery();
}

export async function getAnnouncementBarCarouselSettings(): Promise<AnnouncementBarCarouselSettingsInput> {
  await requireAdminPermission("settings", "read");
  return getAnnouncementBarCarouselSettingsQuery();
}

export async function getPermalinkSettings(): Promise<{
  postPermalinkStructure: string;
}> {
  await requireAdminPermission("settings", "read");
  return getAdminPermalinkSettingsQuery();
}

export async function getGoogleCalendarSettings(): Promise<GoogleCalendarSettingsData | null> {
  await requireAdminPermission("settings", "read");
  return getGoogleCalendarSettingsQuery();
}

export async function getRobotsTxtSettings(): Promise<RobotsTxtData> {
  await requireAdminPermission("settings", "read");
  return getRobotsTxtSettingsQuery();
}
