"use server";

import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkPublishEventsCommand,
  bulkSoftDeleteEventsCommand,
  type BulkPublishEventsResult,
  type BulkSoftDeleteEventsResult,
} from "@/shared/domain/events/bulk-commands";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";

const bulkIdsSchema = z
  .array(z.string().uuid({ error: "イベントIDが不正です" }))
  .min(1, { error: "1件以上選択してください" })
  .max(100, { error: "一度に処理できるのは100件までです" });

export async function bulkPublishEvents(
  ids: string[],
  publish: boolean,
): Promise<MutationResult<BulkPublishEventsResult>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "publish",
    execute: async () => bulkPublishEventsCommand(parsed.data, publish),
    afterSuccess: (data) => {
      for (const target of data.affectedTargets) {
        invalidateEventCaches(target.id, target.slug, { registrations: true });
      }
    },
  });
}

export async function bulkSoftDeleteEvents(
  ids: string[],
): Promise<MutationResult<BulkSoftDeleteEventsResult>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "delete",
    execute: async (user) =>
      bulkSoftDeleteEventsCommand(parsed.data, { id: user.id }),
    afterSuccess: (data) => {
      for (const target of data.affectedTargets) {
        invalidateEventCaches(target.id, target.slug, { registrations: true });
      }
    },
  });
}
