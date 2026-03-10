"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import {
  executeAdminMutationResult,
} from "@/admin/lib/admin-action";
import { purgeHomeCache } from "@/shared/lib/cloudflare";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result"
import {
  announcementBarInputSchema,
  createAnnouncementBar as createAnnouncementBarCommand,
  deleteAnnouncementBar as deleteAnnouncementBarCommand,
  type AnnouncementBarInput,
  toggleAnnouncementBarActive as toggleAnnouncementBarActiveCommand,
  updateAnnouncementBar as updateAnnouncementBarCommand,
} from "@/shared/domain/settings/announcement-bar";

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
  const parsed = announcementBarInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "announcementBar",
    action: "update",
    resourceId: id,
    execute: async () => {
      await updateAnnouncementBarCommand(id, parsed.data);
      return null;
    },
    afterSuccess: invalidateAnnouncementBarCache,
  });
}

export async function deleteAnnouncementBar(
  id: string,
): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "announcementBar",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteAnnouncementBarCommand(id);
      return null;
    },
    afterSuccess: invalidateAnnouncementBarCache,
  });
}

export async function toggleAnnouncementBarActive(
  id: string,
): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "announcementBar",
    action: "update",
    resourceId: id,
    execute: async () => {
      await toggleAnnouncementBarActiveCommand(id);
      return null;
    },
    afterSuccess: invalidateAnnouncementBarCache,
  });
}
