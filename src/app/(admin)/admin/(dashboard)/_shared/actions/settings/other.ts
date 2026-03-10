"use server";

/**
 * その他の設定 Server Actions
 * - メンテナンス設定
 * - Cookie同意設定
 * - 規約同意設定
 * - 予約設定
 * - サイドバー設定
 * - お知らせバーカルーセル設定
 *
 * @module admin/actions/settings/other
 */

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { updateAnnouncementBarCarouselSettings as updateAnnouncementBarCarouselSettingsCommand } from "@/shared/domain/settings/announcement-bar";
import {
  updateCookieConsentSettings as updateCookieConsentSettingsCommand,
  updateHeaderSettings as updateHeaderSettingsCommand,
  updateMaintenanceSettings as updateMaintenanceSettingsCommand,
  updatePermalinkSettings as updatePermalinkSettingsCommand,
  updateReservationSettings as updateReservationSettingsCommand,
  updateSidebarSettings as updateSidebarSettingsCommand,
  updateTermsAgreementSettings as updateTermsAgreementSettingsCommand,
} from "@/shared/domain/settings/commands";

import { sidebarSettingsSchema } from "@/shared/lib/validations/sidebar";
import {
  maintenanceSettingsSchema,
  cookieConsentSettingsSchema,
  termsAgreementSettingsSchema,
  reservationSettingsSchema,
  announcementBarCarouselSettingsSchema,
  permalinkSettingsSchema,
  headerSettingsSchema,
  type MaintenanceSettingsInput,
  type CookieConsentSettingsInput,
  type TermsAgreementSettingsInput,
  type ReservationSettingsInput,
  type AnnouncementBarCarouselSettingsInput,
  type PermalinkSettingsInput,
  type HeaderSettingsInput,
  type SidebarSettingsInput,
} from "./schemas";

function invalidateSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

function invalidateReservationSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
  updateTag(CACHE_TAGS.RESERVATIONS);
}

function invalidateSidebarSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
  updateTag(CACHE_TAGS.POSTS);
}

function invalidatePermalinkCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
  updateTag(CACHE_TAGS.POSTS);
}

function invalidateLayoutCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
  updateTag(CACHE_TAGS.LAYOUT_SETTINGS);
}

export async function updateMaintenanceSettings(
  data: MaintenanceSettingsInput,
): Promise<MutationResult> {
  const parsed = maintenanceSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateMaintenanceSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateCookieConsentSettings(
  data: CookieConsentSettingsInput,
): Promise<MutationResult> {
  const parsed = cookieConsentSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateCookieConsentSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateTermsAgreementSettings(
  data: TermsAgreementSettingsInput,
): Promise<MutationResult> {
  const parsed = termsAgreementSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateTermsAgreementSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateReservationSettingsCache,
  });
}

export async function updateReservationSettings(
  data: ReservationSettingsInput,
): Promise<MutationResult> {
  const parsed = reservationSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateReservationSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      invalidateSettingsCache();
      updateTag(CACHE_TAGS.TERMS);
    },
  });
}

export async function updateSidebarSettings(
  data: SidebarSettingsInput,
): Promise<MutationResult> {
  const parsed = sidebarSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateSidebarSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSidebarSettingsCache,
  });
}

export async function updateAnnouncementBarCarouselSettings(
  data: AnnouncementBarCarouselSettingsInput,
): Promise<MutationResult> {
  const parsed = announcementBarCarouselSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateAnnouncementBarCarouselSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updatePermalinkSettings(
  data: PermalinkSettingsInput,
): Promise<MutationResult> {
  const parsed = permalinkSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updatePermalinkSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidatePermalinkCache,
  });
}

export async function updateHeaderSettings(
  data: HeaderSettingsInput,
): Promise<MutationResult> {
  const parsed = headerSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateHeaderSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateLayoutCache,
  });
}
