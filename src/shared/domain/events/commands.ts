import "server-only";

import { Prisma, prisma } from "@/shared/db/prisma";
import { EventStatus } from "@/shared/db/enums";
import { DomainError } from "@/shared/domain/domain-error";
import type { EventFormInput } from "@/shared/lib/validations/event";
import { sendEventCancelledToAllParticipants } from "@/shared/lib/email/event-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";

export async function createEventCommand(data: EventFormInput) {
  const slug = await ensureUniqueSlug(data.slug);

  const event = await prisma.event.create({
    data: {
      title: data.title,
      slug,
      description: data.description ?? null,
      contentJson: data.contentJson ?? Prisma.JsonNull,
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

export async function updateEventCommand(id: string, data: EventFormInput) {
  const existing = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true, status: true },
  });
  if (!existing) throw new DomainError("イベントが見つかりません", "NOT_FOUND");

  const slug =
    data.slug !== existing.slug
      ? await ensureUniqueSlug(data.slug, id)
      : data.slug;

  const wasPublished =
    existing.status !== EventStatus.PUBLISHED &&
    data.status === EventStatus.PUBLISHED;

  await prisma.event.update({
    where: { id, deletedAt: null },
    data: {
      title: data.title,
      slug,
      description: data.description ?? null,
      contentJson: data.contentJson ?? Prisma.JsonNull,
      thumbnailUrl: data.thumbnailUrl ?? null,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      capacity: data.capacity ?? null,
      price: data.price ?? null,
      location: data.location ?? null,
      spaceId: data.spaceId ?? null,
      status: data.status,
      registrationOpen: data.registrationOpen ?? true,
      ...(wasPublished && { publishedAt: new Date() }),
    },
  });
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
