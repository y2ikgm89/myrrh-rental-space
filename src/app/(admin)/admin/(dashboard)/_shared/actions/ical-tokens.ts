"use server";

/**
 * iCal トークン Server Actions
 */

import { updateTag } from "next/cache";
import { z } from "zod";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createICalToken as createICalTokenCommand,
  deleteICalToken as deleteICalTokenCommand,
  updateICalFeedSettings as updateICalFeedSettingsCommand,
} from "@/shared/domain/settings/commands";
import type { ICalFeedSettingsData } from "@/shared/domain/settings/types";

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

function invalidateSettingsCache(): void {
  updateTag(CACHE_TAGS.INTEGRATION_SETTINGS);
}

export async function createICalToken(
  data: z.infer<typeof createTokenSchema>,
): Promise<MutationResult<{ id: string; token: string }>> {
  const parsed = createTokenSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async (user) =>
      createICalTokenCommand({
        ...parsed.data,
        createdBy: user.id,
      }),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function deleteICalToken(id: string): Promise<MutationResult> {
  const parsed = deleteTokenSchema.safeParse({ id });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await deleteICalTokenCommand(parsed.data.id);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateICalFeedSettings(
  data: ICalFeedSettingsData,
): Promise<MutationResult> {
  const parsed = icalFeedSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateICalFeedSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}
