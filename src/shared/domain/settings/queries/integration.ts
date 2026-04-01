import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";

export async function getStripeSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.INTEGRATION_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          stripeEnabled: true,
          stripeTestMode: true,
          stripePublishableKey: true,
          stripeSecretKey: true,
          stripeWebhookSecret: true,
          stripeAccountId: true,
          stripeCurrency: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getStripeSettings",
  });

  return toPlainObject(result);
}
