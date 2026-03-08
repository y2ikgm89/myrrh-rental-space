"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationError } from "@/shared/lib/action-helpers";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { purgeHomeCache } from "@/shared/lib/cloudflare";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import {
  announcementBarInputSchema,
  createAnnouncementBar as createAnnouncementBarCommand,
  deleteAnnouncementBar as deleteAnnouncementBarCommand,
  getAnnouncementBarById as getAnnouncementBarByIdQuery,
  getAnnouncementBars as getAnnouncementBarsQuery,
  type AnnouncementBarData,
  type AnnouncementBarInput,
  toggleAnnouncementBarActive as toggleAnnouncementBarActiveCommand,
  updateAnnouncementBar as updateAnnouncementBarCommand,
} from "@/shared/domain/settings/announcement-bar";

export type GetAnnouncementBarsResult = {
  items: AnnouncementBarData[];
  total: number;
};

const checkReadPermission = checkReadPermissionFor("announcementBar");

function invalidateAnnouncementBarCache(): void {
  updateTag(CACHE_TAGS.ANNOUNCEMENT_BAR);
  fireAndForget(purgeHomeCache(), {
    operation: "purgeHomeCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
}

export async function getAnnouncementBars(): Promise<GetAnnouncementBarsResult> {
  if (!(await checkReadPermission())) {
    return { items: [], total: 0 };
  }

  const items = await getAnnouncementBarsQuery();

  return {
    items,
    total: items.length,
  };
}

export async function getAnnouncementBarById(
  id: string,
): Promise<AnnouncementBarData | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  return getAnnouncementBarByIdQuery(id);
}

export async function createAnnouncementBar(
  data: AnnouncementBarInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = announcementBarInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "announcementBar",
    action: "create",
    execute: async () => createAnnouncementBarCommand(parsed.data),
    success: (result) =>
      createSuccess("お知らせバーを作成しました", result),
    afterSuccess: invalidateAnnouncementBarCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateAnnouncementBar(
  id: string,
  data: AnnouncementBarInput,
): Promise<ActionResult<void>> {
  const parsed = announcementBarInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "announcementBar",
    action: "update",
    resourceId: id,
    execute: async () => {
      await updateAnnouncementBarCommand(id, parsed.data);
    },
    success: () => createSuccess("お知らせバーを更新しました"),
    afterSuccess: invalidateAnnouncementBarCache,
  });
}

export async function deleteAnnouncementBar(
  id: string,
): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "announcementBar",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteAnnouncementBarCommand(id);
    },
    success: () => createSuccess("お知らせバーを削除しました"),
    afterSuccess: invalidateAnnouncementBarCache,
  });
}

export async function toggleAnnouncementBarActive(
  id: string,
): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "announcementBar",
    action: "update",
    resourceId: id,
    execute: async () => {
      await toggleAnnouncementBarActiveCommand(id);
    },
    success: () => createSuccess("状態を変更しました"),
    afterSuccess: invalidateAnnouncementBarCache,
  });
}
