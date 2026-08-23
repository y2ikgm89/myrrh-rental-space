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
import { getGoogleCalendarEventIdsByEventIds } from "@/shared/domain/events/calendar-sync";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import {
  AuditAction,
  EventStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { fireAndForget, settleAllWithLogging } from "@/shared/lib/async-utils";
import { sendEventCancelledToAllParticipants } from "@/shared/domain/email/lib-dispatch";
import { getEventCancelledNotificationPayload } from "@/shared/domain/events/email-queries";
import { getEventEmailRenderContext } from "@/shared/domain/settings/queries/email-render-context";
import { ErrorCategory } from "@/shared/lib/errors";
import { entityIdSchema } from "@/shared/lib/validations/entity-id";
import { deleteEventOutbound, syncEventOutbound } from "./calendar-outbound";

const eventIdSchema = entityIdSchema("Event");

const bulkIdsSchema = z
  .array(eventIdSchema)
  .min(1, { error: "1件以上選択してください" })
  .max(100, { error: "一度に処理できるのは100件までです" });

type OutboundDeleteTarget = {
  eventId: string;
  googleCalendarEventIds: string[];
};

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

function buildOutboundDeleteTargets(
  gcalMap: Map<string, string[]>,
  eventIds: readonly string[],
): OutboundDeleteTarget[] {
  return eventIds.flatMap((eventId) => {
    const googleCalendarEventIds = gcalMap.get(eventId);
    if (
      googleCalendarEventIds === undefined ||
      googleCalendarEventIds.length === 0
    ) {
      return [];
    }
    return [{ eventId, googleCalendarEventIds }];
  });
}

function fireBulkOutboundDeletes(targets: OutboundDeleteTarget[]): void {
  if (targets.length === 0) return;

  // 監査 A-77: 以前は `Promise.allSettled(...).then(() => undefined)` をそのまま
  // `fireAndForget` に渡していた。allSettled は**決して reject しない**ので
  // `fireAndForget` の `.catch` は到達不能で、ここで宣言した operation 名の
  // ログはどんな障害でも出ない。個別の reject を拾うのは
  // `settleAllWithLogging` の仕事。`fireAndForget` は `after()` で完了を
  // 追跡するために残す。
  fireAndForget(
    settleAllWithLogging(
      targets.map(({ eventId, googleCalendarEventIds }) =>
        deleteEventOutbound(eventId, googleCalendarEventIds),
      ),
      {
        operationPrefix: "deleteEventOutbound.bulk",
        category: ErrorCategory.EXTERNAL_API,
      },
    ).then(() => undefined),
    {
      operation: "deleteEventOutbound.bulk",
      category: ErrorCategory.EXTERNAL_API,
    },
  );
}

function fireBulkOutboundSyncs(eventIds: readonly string[]): void {
  if (eventIds.length === 0) return;

  fireAndForget(
    settleAllWithLogging(
      eventIds.map((eventId) => syncEventOutbound(eventId)),
      {
        operationPrefix: "syncEventOutbound.bulk",
        category: ErrorCategory.EXTERNAL_API,
      },
    ).then(() => undefined),
    {
      operation: "syncEventOutbound.bulk",
      category: ErrorCategory.EXTERNAL_API,
    },
  );
}

function statusRequiresCalendarDelete(status: EventStatus): boolean {
  return status === EventStatus.CANCELLED || status === EventStatus.ARCHIVED;
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
      const outboundDeleteTargets = publish
        ? []
        : buildOutboundDeleteTargets(
            await getGoogleCalendarEventIdsByEventIds(parsed.data),
            parsed.data,
          );
      const result = await bulkPublishEventsCommand(parsed.data, publish);
      const affectedIdSet = new Set(
        result.affectedTargets.map((target) => target.id),
      );

      return {
        ...result,
        actorUserId: user.id,
        ip,
        userAgent,
        outboundDeleteTargets: outboundDeleteTargets.filter((target) =>
          affectedIdSet.has(target.eventId),
        ),
      };
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
      if (outcome.isPublished) {
        fireBulkOutboundSyncs(
          outcome.affectedTargets.map((target) => target.id),
        );
      } else {
        fireBulkOutboundDeletes(outcome.outboundDeleteTargets);
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
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const outboundDeleteTargets = buildOutboundDeleteTargets(
        await getGoogleCalendarEventIdsByEventIds(parsed.data),
        parsed.data,
      );
      const result = await bulkSoftDeleteEventsCommand(parsed.data, {
        id: user.id,
      });
      const affectedIdSet = new Set(
        result.affectedTargets.map((target) => target.id),
      );

      return {
        ...result,
        actorUserId: user.id,
        ip,
        userAgent,
        outboundDeleteTargets: outboundDeleteTargets.filter((target) =>
          affectedIdSet.has(target.eventId),
        ),
      };
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
      fireBulkOutboundDeletes(outcome.outboundDeleteTargets);
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
      const outboundDeleteTargets = statusRequiresCalendarDelete(
        parsed.data.newStatus,
      )
        ? buildOutboundDeleteTargets(
            await getGoogleCalendarEventIdsByEventIds(parsed.data.ids),
            parsed.data.ids,
          )
        : [];
      const result = await bulkSetStatusEventsCommand(
        parsed.data.ids,
        parsed.data.newStatus,
      );
      const affectedIdSet = new Set(result.affectedIds);

      return {
        ...result,
        actorUserId: user.id,
        ip,
        userAgent,
        outboundDeleteTargets: outboundDeleteTargets.filter((target) =>
          affectedIdSet.has(target.eventId),
        ),
      };
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
      if (statusRequiresCalendarDelete(outcome.newStatus)) {
        fireBulkOutboundDeletes(outcome.outboundDeleteTargets);
      }
      if (
        outcome.newStatus === EventStatus.CANCELLED &&
        outcome.affectedIds.length > 0
      ) {
        fireAndForget(
          (async () => {
            const renderContext = await getEventEmailRenderContext();
            // 個別の reject（payload 取得の prisma クエリ等）を拾う（監査 A-77）。
            // 素の allSettled だと、参加者へキャンセルメールが送られなかった
            // イベントが無記録になる。
            await settleAllWithLogging(
              outcome.affectedIds.map(async (eventId) => {
                const payload =
                  await getEventCancelledNotificationPayload(eventId);
                if (payload) {
                  await sendEventCancelledToAllParticipants(
                    payload,
                    renderContext,
                  );
                }
              }),
              {
                operationPrefix: "bulkSetStatusEvents.cancel",
                category: ErrorCategory.EXTERNAL_API,
              },
            );
          })(),
          {
            operation: "bulkSetStatusEvents.cancel",
            category: ErrorCategory.EXTERNAL_API,
          },
        );
      }
    },
  });
}
