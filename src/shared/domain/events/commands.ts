import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { EventStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import {
  sendEventCancelledToAllParticipants,
  sendEventUpdatedToAllParticipants,
} from "@/shared/lib/email/event-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { generateSlug } from "@/shared/lib/slug";
import {
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "@/shared/lib/lexical/description-defaults";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import { EventStatus as EventStatusEnum } from "@/shared/lib/validations/enums/prisma-types";

/**
 * Domain レイヤーの Event 書き込み入力型。
 * Server Action 側で `buildEventCommandInput` が `EventFormInput`（Lexical JSON string）
 * から 3 値（descriptionJson / descriptionHtml / descriptionPlainText）を生成して渡す。
 *
 * Space の `SpaceCommandInput` と同じ分離パターン。
 */
export interface EventCommandInput {
  title: string;
  slug: string;
  descriptionJson: Prisma.InputJsonValue;
  descriptionHtml: string;
  descriptionPlainText: string;
  thumbnailUrl?: string | null;
  startTime: string;
  endTime: string;
  capacity?: number | null;
  price?: number | null;
  location?: string | null;
  spaceId?: string | null;
  status: (typeof EventStatusEnum)[keyof typeof EventStatusEnum];
  registrationOpen?: boolean;
}

export async function createEventCommand(data: EventCommandInput) {
  const slug = await ensureUniqueSlug(data.slug);

  const event = await prisma.event.create({
    data: {
      title: data.title,
      slug,
      descriptionJson: data.descriptionJson,
      descriptionHtml: data.descriptionHtml,
      descriptionPlainText: data.descriptionPlainText,
      thumbnailUrl: data.thumbnailUrl ?? null,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      capacity: data.capacity ?? null,
      price: data.price ?? null,
      location: data.location ?? null,
      spaceId: data.spaceId ?? null,
      status: data.status,
      registrationOpen: data.registrationOpen ?? true,
      publishedAt: data.status === EventStatus.PUBLISHED ? new Date() : null,
    },
    select: { id: true, slug: true },
  });

  return event;
}

export async function updateEventCommand(id: string, data: EventCommandInput) {
  const existing = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      slug: true,
      status: true,
      startTime: true,
      endTime: true,
      location: true,
    },
  });
  if (!existing) throw new DomainError("イベントが見つかりません", "NOT_FOUND");

  const slug =
    data.slug !== existing.slug
      ? await ensureUniqueSlug(data.slug, id)
      : data.slug;

  const wasPublished =
    existing.status !== EventStatus.PUBLISHED &&
    data.status === EventStatus.PUBLISHED;

  const newStartTime = new Date(data.startTime);
  const newEndTime = new Date(data.endTime);

  await prisma.event.update({
    where: { id, deletedAt: null },
    data: {
      title: data.title,
      slug,
      descriptionJson: data.descriptionJson,
      descriptionHtml: data.descriptionHtml,
      descriptionPlainText: data.descriptionPlainText,
      thumbnailUrl: data.thumbnailUrl ?? null,
      startTime: newStartTime,
      endTime: newEndTime,
      capacity: data.capacity ?? null,
      price: data.price ?? null,
      location: data.location ?? null,
      spaceId: data.spaceId ?? null,
      status: data.status,
      registrationOpen: data.registrationOpen ?? true,
      ...(wasPublished && { publishedAt: new Date() }),
    },
  });

  const dateTimeChanged =
    existing.startTime.getTime() !== newStartTime.getTime() ||
    existing.endTime.getTime() !== newEndTime.getTime();
  const locationChanged = (existing.location ?? "") !== (data.location ?? "");

  if (
    (dateTimeChanged || locationChanged) &&
    data.status === EventStatus.PUBLISHED
  ) {
    fireAndForget(sendEventUpdatedToAllParticipants(id, existing.startTime), {
      operation: "sendEventUpdatedToAllParticipants",
      category: ErrorCategory.EXTERNAL_API,
    });
  }
}

export async function deleteEventCommand(id: string) {
  const event = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!event) throw new DomainError("イベントが見つかりません", "NOT_FOUND");

  await prisma.event.update({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

export async function publishEventCommand(id: string) {
  const event = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true, status: true },
  });
  if (!event) throw new DomainError("イベントが見つかりません", "NOT_FOUND");
  if (!event.title) throw new DomainError("タイトルが必要です", "VALIDATION");

  await prisma.event.update({
    where: { id, deletedAt: null },
    data: { status: EventStatus.PUBLISHED, publishedAt: new Date() },
  });
}

export async function cancelEventCommand(id: string) {
  const event = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!event) throw new DomainError("イベントが見つかりません", "NOT_FOUND");

  await prisma.event.update({
    where: { id, deletedAt: null },
    data: { status: EventStatus.CANCELLED },
  });

  fireAndForget(sendEventCancelledToAllParticipants(id), {
    operation: "sendEventCancelledToAllParticipants",
    category: ErrorCategory.EXTERNAL_API,
  });
}

export async function upsertEventFromCalendar(data: {
  googleCalendarEventId: string;
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  location?: string | null;
}) {
  const plain = (data.description ?? "").trim();
  const descriptionJson = JSON.parse(
    buildParagraphEditorStateJson(plain),
  ) as Prisma.InputJsonValue;
  const descriptionHtml = buildParagraphHtml(plain);
  const descriptionPlainText = stripHtmlToText(descriptionHtml, 200);

  const existing = await prisma.event.findFirst({
    where: {
      googleCalendarEventId: data.googleCalendarEventId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.event.update({
      where: { id: existing.id, deletedAt: null },
      data: {
        title: data.title,
        descriptionJson,
        descriptionHtml,
        descriptionPlainText,
        startTime: data.startTime,
        endTime: data.endTime,
        location: data.location ?? null,
      },
    });
    return { id: existing.id, action: "updated" as const };
  }

  const slug = await ensureUniqueSlug(generateSlug(data.title, "event"));
  const event = await prisma.event.create({
    data: {
      title: data.title,
      slug,
      descriptionJson,
      descriptionHtml,
      descriptionPlainText,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location ?? null,
      status: EventStatus.DRAFT,
      googleCalendarEventId: data.googleCalendarEventId,
    },
    select: { id: true },
  });
  return { id: event.id, action: "created" as const };
}

async function ensureUniqueSlug(
  slug: string,
  excludeId?: string,
): Promise<string> {
  const existing = await prisma.event.findFirst({
    where: {
      slug,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (!existing) return slug;

  const randomSuffix = crypto.randomUUID().slice(0, 8);
  return `${slug}-${randomSuffix}`;
}
