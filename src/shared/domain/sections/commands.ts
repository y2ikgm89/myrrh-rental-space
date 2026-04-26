import "server-only";

import { clonePrismaInputJson, parsePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  validateSectionConfig,
  type SectionConfig,
  type UpdateSectionContentInput,
} from "@/shared/lib/validations/section";

function parseJsonValue(
  value: string | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value) {
    return Prisma.JsonNull;
  }

  return parsePrismaInputJson(value, "JSONデータが不正です");
}

function cloneJsonValue(value: unknown): Prisma.InputJsonValue {
  return clonePrismaInputJson(value, "JSONデータが不正です");
}

async function ensurePageSectionExists(id: string) {
  const section = await prisma.section.findUnique({
    where: { id },
    select: { id: true, pageId: true, type: true },
  });

  if (!section || !section.pageId) {
    throw new DomainError("セクションが見つかりません", "NOT_FOUND");
  }

  return {
    ...section,
    pageId: section.pageId,
  };
}

function validateConfig(type: string, config: unknown): SectionConfig {
  const result = validateSectionConfig(type, config);
  if (!result.success) {
    throw new DomainError("設定エラー", "VALIDATION");
  }

  return result.data;
}

export async function updatePageSectionCommand(
  id: string,
  input: UpdateSectionContentInput,
  contentHtml?: string | null,
): Promise<{ pageId: string }> {
  const existing = await ensurePageSectionExists(id);

  const config =
    input.config === undefined
      ? undefined
      : validateConfig(existing.type, input.config);

  await prisma.section.update({
    where: { id },
    data: omitUndefined({
      config: config === undefined ? undefined : cloneJsonValue(config),
      ...(input.contentJson !== undefined
        ? {
            contentJson: parseJsonValue(input.contentJson),
            contentHtml: contentHtml ?? null,
          }
        : {}),
    }),
  });

  return { pageId: existing.pageId };
}
