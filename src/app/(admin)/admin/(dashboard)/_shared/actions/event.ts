"use server";

import { z } from "zod";
import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import { omitUndefined } from "@/shared/lib/serialize";
import {
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
import {
  syncEventToCalendar,
  updateEventCalendarSync,
  deleteEventCalendarSync,
} from "@/shared/lib/calendar-sync/event-outbound";
import {
  eventFormSchema,
  type EventFormInput,
} from "@/shared/lib/validations/event";
import type { MutationResult } from "@/shared/lib/mutation-result";

const idSchema = z.string().uuid({ error: "イベントIDが不正です" });

/**
 * EventFormInput (Lexical JSON + 事前 render 済み HTML) → EventCommandInput
 * (Prisma InputJsonValue + HTML cache + plain text)
 *
 * client が `renderEditorStateJsonToHtmlClient` で事前 render した HTML を受け取り、
 * 派生 plain text を server-side で計算する（Lexical を server で実行しない設計）。
 */
function buildEventCommandInput(data: EventFormInput) {
  const descriptionHtml = data.descriptionHtml;
  const descriptionPlainText = stripHtmlToText(descriptionHtml, 200);
  const descriptionJson = JSON.parse(
    data.descriptionJson,
  ) as Prisma.InputJsonValue;

  const {
    descriptionJson: _dropJson,
    descriptionHtml: _dropHtml,
    ...rest
  } = data;
  void _dropJson;
  void _dropHtml;
  return omitUndefined({
    ...rest,
    descriptionJson,
    descriptionHtml,
    descriptionPlainText,
  });
}

/**
 * create / duplicate / update / publish / cancel 共通: afterSuccess で DB 1 回読んで GCal 同期
 * delete 後は soft-delete で取得できないため呼ばないこと
 */
async function syncEventOutbound(eventId: string): Promise<void> {
  const context = await getEventForCalendarSync(eventId);
  if (!context) return;
  if (context.googleCalendarEventId) {
    await updateEventCalendarSync(context, context.googleCalendarEventId);
  } else {
    await syncEventToCalendar(context);
  }
}

/**
 * cancel / delete 用: 既存 GCal ID がある場合のみ削除
 */
async function deleteEventOutbound(
  eventId: string,
  gcalEventId: string | null,
): Promise<void> {
  if (!gcalEventId) return;
  await deleteEventCalendarSync(eventId, gcalEventId);
}

export async function createEvent(
  input: EventFormInput,
): Promise<MutationResult<{ id: string; slug: string }>> {
  const parsed = eventFormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "create",
    execute: async () => {
      const commandInput = await buildEventCommandInput(parsed.data);
      const event = await createEventCommand(commandInput);
      return { id: event.id, slug: event.slug };
    },
    afterSuccess: (data) => {
      invalidateEventCaches(data.id, data.slug);
      fireAndForget(syncEventOutbound(data.id), {
        operation: "syncEventOutbound.create",
        category: ErrorCategory.EXTERNAL_API,
      });
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

export async function updateEvent(
  id: string,
  input: EventFormInput,
): Promise<MutationResult<null>> {
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) return createValidationMutationError(idParsed.error);

  const parsed = eventFormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: idParsed.data,
    execute: async () => {
      const commandInput = await buildEventCommandInput(parsed.data);
      await updateEventCommand(idParsed.data, commandInput);
      return null;
    },
    afterSuccess: () => {
      invalidateEventCaches(idParsed.data, parsed.data.slug, {
        registrations: true,
      });
      fireAndForget(syncEventOutbound(idParsed.data), {
        operation: "syncEventOutbound.update",
        category: ErrorCategory.EXTERNAL_API,
      });
    },
  });
}

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
