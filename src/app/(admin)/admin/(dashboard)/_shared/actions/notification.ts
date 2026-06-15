"use server";

import { z } from "zod";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  markAsReadCommand,
  markAllAsReadCommand,
  deleteNotificationCommand,
} from "@/shared/domain/notifications/commands";
import type { MutationResult } from "@/shared/lib/mutation-result";

const idSchema = z.uuid({ error: "IDが不正です" });

export async function markNotificationAsRead(
  id: string,
): Promise<MutationResult<null>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "notification",
    action: "update",
    resourceId: parsed.data,
    execute: async () => {
      await markAsReadCommand(parsed.data);
      return null;
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
  });
}

export async function deleteNotification(
  id: string,
): Promise<MutationResult<null>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "notification",
    action: "delete",
    resourceId: parsed.data,
    execute: async () => {
      await deleteNotificationCommand(parsed.data);
      return null;
    },
  });
}
