import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { EventStatus } from "@/shared/db/enums";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";

const publicEventSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  thumbnailUrl: true,
  startTime: true,
  endTime: true,
  capacity: true,
  price: true,
  location: true,
  status: true,
  registrationOpen: true,
  space: { select: { id: true, name: true } },
};

const publicEventDetailSelect = {
  ...publicEventSelect,
  contentJson: true,
  publishedAt: true,
};

export async function getPublishedEvents() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.EVENTS);

  const events = await safeFetch({
    fetch: () =>
      prisma.event.findMany({
        where: {
          status: EventStatus.PUBLISHED,
          deletedAt: null,
        },
        select: publicEventSelect,
        orderBy: { startTime: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedEvents",
  });

  return toPlainArray(events);
}

export async function getPublishedEventBySlug(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.EVENTS, getCacheTag.events.slug(slug));

  const event = await safeFetch({
    fetch: () =>
      prisma.event.findFirst({
        where: {
          slug,
          status: EventStatus.PUBLISHED,
          deletedAt: null,
        },
        select: publicEventDetailSelect,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedEventBySlug",
  });

  if (!event) return null;
  return toPlainObject(event);
}
