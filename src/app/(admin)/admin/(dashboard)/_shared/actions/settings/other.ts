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
import { createValidationError } from "@/shared/lib/action-helpers";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  updateAnnouncementBarCarouselSettings as updateAnnouncementBarCarouselSettingsCommand,
} from "@/shared/domain/settings/announcement-bar";
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
): Promise<ActionResult<void>> {
  const parsed = maintenanceSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateMaintenanceSettingsCommand(parsed.data);
    },
    success: () => createSuccess("メンテナンス設定を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateCookieConsentSettings(
  data: CookieConsentSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = cookieConsentSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateCookieConsentSettingsCommand(parsed.data);
    },
    success: () => createSuccess("Cookie同意設定を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateTermsAgreementSettings(
  data: TermsAgreementSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = termsAgreementSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateTermsAgreementSettingsCommand(parsed.data);
    },
    success: () => createSuccess("規約同意設定を更新しました"),
    afterSuccess: invalidateReservationSettingsCache,
  });
}

export async function updateReservationSettings(
  data: ReservationSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = reservationSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateReservationSettingsCommand(parsed.data);
    },
    success: () => createSuccess("予約設定を更新しました"),
    afterSuccess: () => {
      invalidateSettingsCache();
      updateTag(CACHE_TAGS.TERMS);
    },
  });
}

export async function updateSidebarSettings(
  data: SidebarSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = sidebarSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateSidebarSettingsCommand(parsed.data);
    },
    success: () => createSuccess("サイドバー設定を更新しました"),
    afterSuccess: invalidateSidebarSettingsCache,
  });
}

export async function updateAnnouncementBarCarouselSettings(
  data: AnnouncementBarCarouselSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = announcementBarCarouselSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateAnnouncementBarCarouselSettingsCommand(parsed.data);
    },
    success: () => createSuccess("お知らせバーカルーセル設定を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updatePermalinkSettings(
  data: PermalinkSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = permalinkSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updatePermalinkSettingsCommand(parsed.data);
    },
    success: () => createSuccess("パーマリンク設定を更新しました"),
    afterSuccess: invalidatePermalinkCache,
  });
}

export async function updateHeaderSettings(
  data: HeaderSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = headerSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateHeaderSettingsCommand(parsed.data);
    },
    success: () => createSuccess("ヘッダー設定を更新しました"),
    afterSuccess: invalidateLayoutCache,
  });
}
