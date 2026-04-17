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

export type EmailTemplateSettings = {
  companyName: string;
  emailSubjectPrefix: string | null;
  emailFooterNote: string | null;
  emailSupportContactText: string | null;
};

const DEFAULT: EmailTemplateSettings = {
  companyName: "Myrrh Rental Space",
  emailSubjectPrefix: null,
  emailFooterNote: null,
  emailSupportContactText: null,
};

export async function getEmailTemplateSettings(): Promise<EmailTemplateSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.EMAIL_TEMPLATES);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          businessName: true,
          emailSubjectPrefix: true,
          emailFooterNote: true,
          emailSupportContactText: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getEmailTemplateSettings",
  });

  if (!result) return DEFAULT;

  return toPlainObject({
    companyName: result.businessName ?? DEFAULT.companyName,
    emailSubjectPrefix: result.emailSubjectPrefix,
    emailFooterNote: result.emailFooterNote,
    emailSupportContactText: result.emailSupportContactText,
  });
}
