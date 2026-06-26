"use server";

import type { SubmissionResult } from "@conform-to/react";
import { redirect } from "next/navigation";
import { parsePrismaInputJson } from "@/shared/db/json";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  archiveEventCommand,
  cancelEventCommand,
  createEventCommand,
  deleteEventCommand,
  duplicateEventCommand,
  publishEventCommand,
  updateEventCommand,
} from "@/shared/domain/events/commands";
import { getEventById } from "@/shared/domain/events/admin-queries";
import { getEventForCalendarSync } from "@/shared/domain/events/calendar-sync";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { purgeCloudflareDetailUrls } from "@/shared/lib/cloudflare";
import {
  invalidateSiteWideCache,
  purgeMarketingHomeTag,
  firePurgeAsync,
} from "@/shared/lib/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";

function invalidateEventSiteWideCaches(slug?: string | null): void {
  invalidateSiteWideCache([CACHE_TAGS.EVENTS, CACHE_TAGS.SIDEBAR_DATA]);
  purgeMarketingHomeTag();
  if (slug) {
    void firePurgeAsync(() => purgeCloudflareDetailUrls([`/events/${slug}`]), {
      operation: "purgeEventDetailUrls",
      urls: [`/events/${slug}`],
    });
  }
}
import {
  syncEventToCalendar,
  updateEventCalendarSync,
  deleteEventCalendarSync,
} from "@/shared/lib/calendar-sync/event-outbound";
import {
  eventFormSchema,
  type EventFormData,
} from "../../events/_components/event-form-schema";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("イベント");

/**
 * EventFormData (conform parsed output: Lexical JSON string + 事前 render 済み HTML)
 * → EventCommandInput (Prisma InputJsonValue + HTML cache + plain text)
 */
function buildEventCommandInput(data: EventFormData) {
  const descriptionHtml = data.descriptionHtml;
  const descriptionPlainText = stripHtmlToText(descriptionHtml, 200);
  const descriptionJson = parsePrismaInputJson(
    data.descriptionJson,
    "descriptionJson が不正です",
  );

  const {
    descriptionJson: _dropJson,
    descriptionHtml: _dropHtml,
    tickets: rawTickets,
    slots: rawSlots,
    ...rest
  } = data;
  void _dropJson;
  void _dropHtml;
  const tickets = rawTickets.map((t) => omitUndefined(t));
  const slots = rawSlots.map((s) => omitUndefined(s));
  return omitUndefined({
    ...rest,
    descriptionJson,
    descriptionHtml,
    descriptionPlainText,
    tickets,
    slots,
  });
}

/** create / duplicate / update / publish 共通 GCal 同期 */
async function syncEventOutbound(eventId: string): Promise<void> {
  const context = await getEventForCalendarSync(eventId);
  if (!context) return;
  if (context.googleCalendarEventId) {
    await updateEventCalendarSync(context, context.googleCalendarEventId);
  } else {
    await syncEventToCalendar(context);
  }
}

/** cancel / delete 用: 既存 GCal ID がある場合のみ削除 */
async function deleteEventOutbound(
  eventId: string,
  gcalEventId: string | null,
): Promise<void> {
  if (!gcalEventId) return;
  await deleteEventCalendarSync(eventId, gcalEventId);
}

// =============================================================================
// conform Server Actions
// =============================================================================

/**
 * 管理画面 新規イベント作成 — conform `useActionState` canonical
 *
 * `(prev, formData) => SubmissionResult` signature。
 * 成功時は `redirect()` で一覧ページに遷移、失敗時は `submission.reply()` を返す。
 */
export async function createEventAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  let createdId: string | null = null;
  let createdSlug: string | null = null;

  const submissionResult = await executeConformMutation(
    formData,
    eventFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "event",
        action: "create",
        execute: async () => {
          const commandInput = buildEventCommandInput(data);
          const event = await createEventCommand(commandInput);
          return { id: event.id, slug: event.slug };
        },
        afterSuccess: (payload) => {
          invalidateEventCaches();
          invalidateEventSiteWideCaches(payload.slug);
          fireAndForget(syncEventOutbound(payload.id), {
            operation: "syncEventOutbound.create",
            category: ErrorCategory.EXTERNAL_API,
          });
        },
        resolveAuditResourceId: (payload) => payload.id,
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      createdId = result.id;
      createdSlug = result.slug;
      return { ok: true };
    },
  );

  if (createdId !== null && createdSlug !== null) {
    redirect(toAppRoute(`/admin/events`));
  }

  return submissionResult;
}

/**
 * 管理画面 イベント更新 — conform `useActionState` canonical
 *
 * id は `bind(null, event.id)` で部分適用。
 */
export async function updateEventAction(
  id: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return {
      status: "error",
      error: { "": ["イベントIDが不正です"] },
    } satisfies SubmissionResult;
  }
  const validId = idParsed.data;

  let success = false;
  let updatedSlug: string | null = null;

  const submissionResult = await executeConformMutation(
    formData,
    eventFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "event",
        action: "update",
        resourceId: validId,
        execute: async () => {
          const commandInput = buildEventCommandInput(data);
          await updateEventCommand(validId, commandInput);
          return null;
        },
        afterSuccess: () => {
          invalidateEventCaches();
          invalidateEventSiteWideCaches(data.slug);
          fireAndForget(syncEventOutbound(validId), {
            operation: "syncEventOutbound.update",
            category: ErrorCategory.EXTERNAL_API,
          });
        },
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      success = true;
      updatedSlug = data.slug;
      return { ok: true };
    },
  );

  if (success && updatedSlug !== null) {
    redirect(toAppRoute(`/admin/events`));
  }

  return submissionResult;
}

// =============================================================================
// id-only mutation actions (unchanged — 単純な id 引数のみ、conform 不要)
// =============================================================================

export async function deleteEvent(
  id: string,
): Promise<MutationResult<{ googleCalendarEventId: string | null }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      const event = await getEventById(validated.data);
      await deleteEventCommand(validated.data);
      return {
        googleCalendarEventId: event?.googleCalendarEventId ?? null,
      };
    },
    afterSuccess: (data) => {
      invalidateEventCaches();
      invalidateEventSiteWideCaches();
      fireAndForget(
        deleteEventOutbound(validated.data, data.googleCalendarEventId),
        {
          operation: "deleteEventOutbound.delete",
          category: ErrorCategory.EXTERNAL_API,
        },
      );
    },
  });
}

export async function publishEvent(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "publish",
    resourceId: validated.data,
    execute: async () => {
      await publishEventCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      invalidateEventCaches();
      invalidateEventSiteWideCaches();
      fireAndForget(syncEventOutbound(validated.data), {
        operation: "syncEventOutbound.publish",
        category: ErrorCategory.EXTERNAL_API,
      });
    },
  });
}

export async function duplicateEvent(
  id: string,
): Promise<MutationResult<{ id: string; slug: string }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "create",
    execute: async () => duplicateEventCommand(validated.data),
    afterSuccess: (data) => {
      invalidateEventCaches();
      invalidateEventSiteWideCaches(data.slug);
      fireAndForget(syncEventOutbound(data.id), {
        operation: "syncEventOutbound.duplicate",
        category: ErrorCategory.EXTERNAL_API,
      });
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

export async function cancelEvent(
  id: string,
): Promise<MutationResult<{ googleCalendarEventId: string | null }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      const event = await getEventById(validated.data);
      await cancelEventCommand(validated.data);
      return {
        googleCalendarEventId: event?.googleCalendarEventId ?? null,
      };
    },
    afterSuccess: (data) => {
      invalidateEventCaches();
      invalidateEventSiteWideCaches();
      fireAndForget(
        deleteEventOutbound(validated.data, data.googleCalendarEventId),
        {
          operation: "deleteEventOutbound.cancel",
          category: ErrorCategory.EXTERNAL_API,
        },
      );
    },
  });
}

export async function archiveEvent(
  id: string,
): Promise<MutationResult<{ googleCalendarEventId: string | null }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      const event = await getEventById(validated.data);
      await archiveEventCommand(validated.data);
      return {
        googleCalendarEventId: event?.googleCalendarEventId ?? null,
      };
    },
    afterSuccess: (data) => {
      invalidateEventCaches();
      invalidateEventSiteWideCaches();
      fireAndForget(
        deleteEventOutbound(validated.data, data.googleCalendarEventId),
        {
          operation: "deleteEventOutbound.archive",
          category: ErrorCategory.EXTERNAL_API,
        },
      );
    },
  });
}
