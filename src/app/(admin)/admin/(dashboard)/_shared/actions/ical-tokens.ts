"use server";

/**
 * iCal トークン Server Actions
 */

import { updateTag } from "next/cache";
import { z } from "zod";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationError } from "@/shared/lib/action-helpers";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  getICalFeedSettings as getICalFeedSettingsQuery,
  getICalTokens as getICalTokensQuery,
} from "@/shared/domain/settings/admin-queries";
import {
  createICalToken as createICalTokenCommand,
  deleteICalToken as deleteICalTokenCommand,
  updateICalFeedSettings as updateICalFeedSettingsCommand,
} from "@/shared/domain/settings/commands";
import type {
  ICalFeedSettingsData,
  ICalTokenWithRelations,
} from "@/shared/domain/settings/types";

const createTokenSchema = z.object({
  name: z.string().min(1, { error: "トークン名は必須です" }).max(100),
  spaceId: z.string().uuid().nullable(),
  expiresInDays: z.number().int().min(0).nullable(),
});

const icalFeedSettingsSchema = z.object({
  icalFeedEnabled: z.boolean(),
  icalFeedIncludeCustomerInfo: z.boolean(),
});

const deleteTokenSchema = z.object({
  id: z.string().uuid({ error: "トークンIDの形式が不正です" }),
});

const checkReadPermission = checkReadPermissionFor("settings");

function invalidateSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

export async function getICalTokens(): Promise<ICalTokenWithRelations[]> {
  if (!(await checkReadPermission())) {
    return [];
  }

  return getICalTokensQuery();
}

export async function createICalToken(
  data: z.infer<typeof createTokenSchema>,
): Promise<ActionResult<{ id: string; token: string }>> {
  const parsed = createTokenSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async (user) =>
      createICalTokenCommand({
        ...parsed.data,
        createdBy: user.id,
      }),
    success: (result) => createSuccess("トークンを作成しました", result),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function deleteICalToken(id: string): Promise<ActionResult<void>> {
  const parsed = deleteTokenSchema.safeParse({ id });
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await deleteICalTokenCommand(parsed.data.id);
    },
    success: () => createSuccess("トークンを削除しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateICalFeedSettings(
  data: ICalFeedSettingsData,
): Promise<ActionResult<void>> {
  const parsed = icalFeedSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateICalFeedSettingsCommand(parsed.data);
    },
    success: () => createSuccess("設定を保存しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function getICalFeedSettings(): Promise<ICalFeedSettingsData> {
  if (!(await checkReadPermission())) {
    return { icalFeedEnabled: false, icalFeedIncludeCustomerInfo: false };
  }

  return getICalFeedSettingsQuery();
}

export type { ICalTokenWithRelations };
