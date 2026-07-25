"use server";

import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { emitBulkAuditRecords } from "@/admin/lib/audit";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkPublishEventsCommand,
  bulkSoftDeleteEventsCommand,
  type BulkPublishEventsResult,
  type BulkSoftDeleteEventsResult,
} from "@/shared/domain/events/bulk-commands";
import {
  bulkSetStatusEventsCommand,
  type BulkSetStatusEventsResult,
} from "@/shared/domain/events/bulk-status-commands";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import {
  AuditAction,
  EventStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { fireAndForget } from "@/shared/lib/async-utils";
import { sendEventCancelledToAllParticipants } from "@/shared/lib/email/event-emails";
import { ErrorCategory } from "@/shared/lib/errors";
import { prismaCuidIdSchema } from "@/shared/lib/validations/params";

const eventIdSchema = prismaCuidIdSchema("イベント");

const bulkIdsSchema = z
  .array(eventIdSchema)
  .min(1, { error: "1件以上選択してください" })
  .max(100, { error: "一度に処理できるのは100件までです" });

function buildBulkAuditMetadata(args: {
  ip: string | null;
  userAgent: string | null;
}): Record<string, unknown> {
  return {
    channel: "admin",
    ...(args.ip !== null && { ip: args.ip }),
    ...(args.userAgent !== null && { userAgent: args.userAgent }),
  };
}

export async function bulkPublishEvents(
  ids: string[],
  publish: boolean,
): Promise<MutationResult<BulkPublishEventsResult>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "publish",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkPublishEventsCommand(parsed.data, publish);
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateEventCaches();
      emitBulkAuditRecords({
        resource: "event",
        userId: outcome.actorUserId,
        records: outcome.affectedTargets.map((target) => ({
          resourceId: target.id,
          action: AuditAction.PUBLISH,
          newValue: {
            status: outcome.isPublished
              ? EventStatus.PUBLISHED
              : EventStatus.DRAFT,
            slug: target.slug,
          },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
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
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkSoftDeleteEventsCommand(parsed.data, {
        id: user.id,
      });
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateEventCaches();
      emitBulkAuditRecords({
        resource: "event",
        userId: outcome.actorUserId,
        records: outcome.affectedTargets.map((target) => ({
          resourceId: target.id,
          action: AuditAction.DELETE,
          oldValue: { slug: target.slug },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
    },
  });
}

const bulkStatusInputSchema = z.object({
  ids: z
    .array(eventIdSchema)
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に処理できるのは100件までです" }),
  newStatus: z.enum(EventStatus),
});

export async function bulkSetStatusEvents(
  ids: string[],
  newStatus: EventStatus,
): Promise<MutationResult<BulkSetStatusEventsResult>> {
  const parsed = bulkStatusInputSchema.safeParse({ ids, newStatus });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkSetStatusEventsCommand(
        parsed.data.ids,
        parsed.data.newStatus,
      );
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateEventCaches();
      emitBulkAuditRecords({
        resource: "event",
        userId: outcome.actorUserId,
        records: outcome.affectedIds.map((id) => ({
          resourceId: id,
          action: AuditAction.UPDATE,
          newValue: { status: outcome.newStatus },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
      if (
        outcome.newStatus === EventStatus.CANCELLED &&
        outcome.affectedIds.length > 0
      ) {
        fireAndForget(
          Promise.allSettled(
            outcome.affectedIds.map((eventId) =>
              sendEventCancelledToAllParticipants(eventId),
            ),
          ).then(() => undefined),
          {
            operation: "bulkSetStatusEvents.cancel",
            category: ErrorCategory.EXTERNAL_API,
          },
        );
      }
    },
  });
}
