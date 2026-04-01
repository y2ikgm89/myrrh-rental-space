"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  cancelEventCommand,
  createEventCommand,
  deleteEventCommand,
  publishEventCommand,
  updateEventCommand,
} from "@/shared/domain/events/commands";
import { getEventById } from "@/shared/domain/events/admin-queries";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  eventFormSchema,
  type EventFormInput,
} from "@/shared/lib/validations/event";
import type { MutationResult } from "@/shared/lib/mutation-result";

const idSchema = z.string().uuid({ error: "イベントIDが不正です" });

function invalidateEventCaches(id: string, slug?: string) {
  updateTag(CACHE_TAGS.EVENTS);
  updateTag(getCacheTag.events.detail(id));
  if (slug) {
    updateTag(getCacheTag.events.slug(slug));
  }
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
      const event = await createEventCommand(parsed.data);
      return { id: event.id, slug: event.slug };
    },
    afterSuccess: (data) => {
      updateTag(CACHE_TAGS.EVENTS);
      updateTag(getCacheTag.events.detail(data.id));
      updateTag(getCacheTag.events.slug(data.slug));
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
      await updateEventCommand(idParsed.data, parsed.data);
      return null;
    },
    afterSuccess: () => {
      invalidateEventCaches(idParsed.data, parsed.data.slug);
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
      updateTag(CACHE_TAGS.EVENTS);
      updateTag(getCacheTag.events.detail(validated.data));
      if (slug) updateTag(getCacheTag.events.slug(slug));
      updateTag(getCacheTag.eventRegistrations.list(validated.data));
    },
  });
}

export async function publishEvent(id: string): Promise<MutationResult<null>> {
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
      invalidateEventCaches(validated.data);
    },
  });
}

export async function cancelEvent(id: string): Promise<MutationResult<null>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      await cancelEventCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      invalidateEventCaches(validated.data);
      updateTag(getCacheTag.eventRegistrations.list(validated.data));
    },
  });
}
