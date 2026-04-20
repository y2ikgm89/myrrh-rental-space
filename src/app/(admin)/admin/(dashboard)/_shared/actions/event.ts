"use server";

import { z } from "zod";
import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
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
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import {
  eventFormSchema,
  type EventFormInput,
} from "@/shared/lib/validations/event";
import type { MutationResult } from "@/shared/lib/mutation-result";

const idSchema = z.string().uuid({ error: "イベントIDが不正です" });

/**
 * EventFormInput (Lexical JSON 文字列) → EventCommandInput (Prisma InputJsonValue + HTML cache + plain text)
 * Space の buildSpaceCommandInput と同じ変換責務。
 */
async function buildEventCommandInput(data: EventFormInput) {
  const descriptionHtml = await renderEditorStateToHtmlLazy(
    data.descriptionJson,
  );
  const descriptionPlainText = stripHtmlToText(descriptionHtml, 200);
  const descriptionJson = JSON.parse(
    data.descriptionJson,
  ) as Prisma.InputJsonValue;

  const { descriptionJson: _drop, ...rest } = data;
  void _drop;
  return omitUndefined({
    ...rest,
    descriptionJson,
    descriptionHtml,
    descriptionPlainText,
  });
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
    },
  });
}

export async function deleteEvent(
  id: string,
): Promise<MutationResult<string | null>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      const event = await getEventById(validated.data);
      await deleteEventCommand(validated.data);
      return event?.slug ?? null;
    },
    afterSuccess: (slug) => {
      invalidateEventCaches(validated.data, slug, { registrations: true });
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
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

export async function cancelEvent(
  id: string,
): Promise<MutationResult<string | null>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      const event = await getEventById(validated.data);
      await cancelEventCommand(validated.data);
      return event?.slug ?? null;
    },
    afterSuccess: (slug) => {
      invalidateEventCaches(validated.data, slug, { registrations: true });
    },
  });
}
