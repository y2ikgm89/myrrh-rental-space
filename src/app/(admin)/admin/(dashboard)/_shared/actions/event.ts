"use server";

import type { SubmissionResult } from "@conform-to/react";
import { redirect } from "next/navigation";
import { z } from "zod";
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
import {
  getEventById,
  searchPostsForEventRelation,
  type EventRelatedPostOption,
} from "@/shared/domain/events/admin-queries";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { getEventForCalendarSync } from "@/shared/domain/events/calendar-sync";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
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

const idSchema = z.string().uuid({ error: "イベントIDが不正です" });

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
    relatedPostIds: rawRelatedPostIds,
    ...rest
  } = data;
  void _dropJson;
  void _dropHtml;
  const tickets = rawTickets.map((t) => omitUndefined(t));
  return omitUndefined({
    ...rest,
    descriptionJson,
    descriptionHtml,
    descriptionPlainText,
    tickets,
    relatedPostIds: rawRelatedPostIds,
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
          invalidateEventCaches(payload.id, payload.slug);
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
          invalidateEventCaches(validId, data.slug, {
            registrations: true,
          });
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
// 関連記事 Post search (read-only、Client Component から呼び出し)
// =============================================================================

const searchPostsForRelationSchema = z.object({
  query: z.string().max(200).optional(),
  includeIds: z.array(z.string().uuid()).max(12).optional(),
});

/**
 * 管理画面の RelatedPostsField から呼ばれる Post 検索 action。
 * 公開記事のみ、最大 20 件 + 既選択 ID を必ず含めて返す。
 */
export async function searchPostsForRelationAction(input: {
  query?: string;
  includeIds?: readonly string[];
}): Promise<
  | { success: true; data: EventRelatedPostOption[] }
  | { success: false; error: string }
> {
  const auth = await checkAdminAuth();
  if (!auth.success) {
    return { success: false, error: "ログインが必要です" };
  }
  const parsed = searchPostsForRelationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "検索条件が不正です" };
  }
  const data = await searchPostsForEventRelation({
    ...(parsed.data.query !== undefined && { query: parsed.data.query }),
    ...(parsed.data.includeIds !== undefined && {
      includeIds: parsed.data.includeIds,
    }),
  });
  return { success: true, data };
}

// =============================================================================
// id-only mutation actions (unchanged — 単純な id 引数のみ、conform 不要)
// =============================================================================

export async function deleteEvent(
  id: string,
): Promise<
  MutationResult<{ slug: string | null; googleCalendarEventId: string | null }>
> {
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
        slug: event?.slug ?? null,
        googleCalendarEventId: event?.googleCalendarEventId ?? null,
      };
    },
    afterSuccess: (data) => {
      invalidateEventCaches(validated.data, data.slug, { registrations: true });
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

export async function publishEvent(
  id: string,
): Promise<MutationResult<string | null>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "publish",
    resourceId: validated.data,
    execute: async () => {
      const event = await getEventById(validated.data);
      await publishEventCommand(validated.data);
      return event?.slug ?? null;
    },
    afterSuccess: (slug) => {
      invalidateEventCaches(validated.data, slug, { registrations: true });
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
      invalidateEventCaches(data.id, data.slug);
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
): Promise<
  MutationResult<{ slug: string | null; googleCalendarEventId: string | null }>
> {
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
        slug: event?.slug ?? null,
        googleCalendarEventId: event?.googleCalendarEventId ?? null,
      };
    },
    afterSuccess: (data) => {
      invalidateEventCaches(validated.data, data.slug, { registrations: true });
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
): Promise<
  MutationResult<{ slug: string | null; googleCalendarEventId: string | null }>
> {
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
        slug: event?.slug ?? null,
        googleCalendarEventId: event?.googleCalendarEventId ?? null,
      };
    },
    afterSuccess: (data) => {
      invalidateEventCaches(validated.data, data.slug, { registrations: true });
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
