"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  markAsReadCommand,
  markAllAsReadCommand,
  deleteNotificationCommand,
} from "@/shared/domain/notifications/commands";
import type { MutationResult } from "@/shared/lib/mutation-result";

export async function markNotificationAsRead(
  id: string,
): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "notification",
    action: "update",
    resourceId: id,
    execute: async () => {
      await markAsReadCommand(id);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.NOTIFICATIONS);
    },
  });
}

export async function markAllNotificationsAsRead(): Promise<
  MutationResult<null>
> {
  return executeAdminMutationResult({
    resource: "notification",
    action: "update",
    execute: async () => {
      await markAllAsReadCommand();
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.NOTIFICATIONS);
    },
  });
}

export async function deleteNotification(
  id: string,
): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "notification",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteNotificationCommand(id);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.NOTIFICATIONS);
    },
  });
}
