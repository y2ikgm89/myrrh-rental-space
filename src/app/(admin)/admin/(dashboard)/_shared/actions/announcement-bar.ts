"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { purgeHomeCache } from "@/shared/lib/cloudflare";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  announcementBarInputSchema,
  createAnnouncementBar as createAnnouncementBarCommand,
  deleteAnnouncementBar as deleteAnnouncementBarCommand,
  type AnnouncementBarInput,
  toggleAnnouncementBarActive as toggleAnnouncementBarActiveCommand,
  updateAnnouncementBar as updateAnnouncementBarCommand,
} from "@/shared/domain/settings/announcement-bar";

const idSchema = z.string().uuid({ error: "IDが不正です" });

function invalidateAnnouncementBarCache(): void {
  updateTag(CACHE_TAGS.ANNOUNCEMENT_BAR);
  fireAndForget(purgeHomeCache(), {
    operation: "purgeHomeCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
}

export async function createAnnouncementBar(
  data: AnnouncementBarInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = announcementBarInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "announcementBar",
    action: "create",
    execute: async () => createAnnouncementBarCommand(parsed.data),
    afterSuccess: invalidateAnnouncementBarCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateAnnouncementBar(
  id: string,
  data: AnnouncementBarInput,
): Promise<MutationResult> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  const parsed = announcementBarInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "announcementBar",
    action: "update",
    resourceId: parsedId.data,
    execute: async () => {
      await updateAnnouncementBarCommand(parsedId.data, parsed.data);
      return null;
    },
    afterSuccess: invalidateAnnouncementBarCache,
  });
}

export async function deleteAnnouncementBar(
  id: string,
): Promise<MutationResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "announcementBar",
    action: "delete",
    resourceId: parsed.data,
    execute: async () => {
      await deleteAnnouncementBarCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateAnnouncementBarCache,
  });
}

export async function toggleAnnouncementBarActive(
  id: string,
): Promise<MutationResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "announcementBar",
    action: "update",
    resourceId: parsed.data,
    execute: async () => {
      await toggleAnnouncementBarActiveCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateAnnouncementBarCache,
  });
}
