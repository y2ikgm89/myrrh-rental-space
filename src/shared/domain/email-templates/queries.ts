import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { toPlainObject, toPlainArray } from "@/shared/lib/serialize";
import {
  isValidEmailTemplateType,
} from "@/shared/lib/validations/enums/helpers";
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";
import type { EmailTemplate } from "./types";

const EMAIL_TEMPLATE_SELECT = {
  id: true,
  type: true,
  subject: true,
  greeting: true,
  intro: true,
  outro: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toEmailTemplate(
  record: {
    id: string;
    type: string;
    subject: string;
    greeting: string;
    intro: string;
    outro: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null,
): EmailTemplate | null {
  if (!record) return null;
  if (!isValidEmailTemplateType(record.type)) return null;
  return toPlainObject({
    ...record,
    type: record.type,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export async function getEmailTemplate(
  type: EmailTemplateType,
): Promise<EmailTemplate | null> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.EMAIL_TEMPLATES, getCacheTag.emailTemplates.detail(type));

  const result = await safeFetch({
    fetch: () =>
      prisma.emailTemplate.findUnique({
        where: { type },
        select: EMAIL_TEMPLATE_SELECT,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    operationName: "getEmailTemplate",
  });

  return toEmailTemplate(result);
}

export async function getAllEmailTemplates(): Promise<EmailTemplate[]> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.EMAIL_TEMPLATES);

  const result = await safeFetch({
    fetch: () =>
      prisma.emailTemplate.findMany({
        select: EMAIL_TEMPLATE_SELECT,
        orderBy: { type: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    operationName: "getAllEmailTemplates",
  });

  const normalized: EmailTemplate[] = result
    .filter(
      (r): r is typeof r & { type: EmailTemplateType } =>
        isValidEmailTemplateType(r.type),
    )
    .map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

  return toPlainArray(normalized);
}
