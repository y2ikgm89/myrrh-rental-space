import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";

export async function getNotificationEmailAddresses(): Promise<string[]> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.NOTIFICATION_SETTINGS);

  const settings = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          notificationEmailAddresses: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getNotificationEmailAddresses",
  });

  if (!settings?.notificationEmailAddresses) {
    return [];
  }

  return settings.notificationEmailAddresses
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

export async function getCalendarEmailSettings(): Promise<{
  icalAttachmentEnabled: boolean;
  addToCalendarLinksEnabled: boolean;
}> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.NOTIFICATION_SETTINGS);

  const settings = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          icalAttachmentEnabled: true,
          addToCalendarLinksEnabled: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getCalendarEmailSettings",
  });

  return {
    icalAttachmentEnabled: settings?.icalAttachmentEnabled ?? true,
    addToCalendarLinksEnabled: settings?.addToCalendarLinksEnabled ?? true,
  };
}
