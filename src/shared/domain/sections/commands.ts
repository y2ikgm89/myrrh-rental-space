import "server-only";

import { clonePrismaInputJson, parsePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  SectionType,
  validateSectionConfig,
  type CreateSectionInput,
  type SectionConfig,
  type UpdateSectionInput,
  type UpdateSectionOrderInput,
} from "@/shared/lib/validations/section";
import { getDefaultSectionConfig } from "@/shared/lib/validations/section-defaults";

function parseSectionConfig(type: string, config: unknown): SectionConfig {
  const result = validateSectionConfig(type, config);
  if (result.success) {
    return result.data;
  }

  const fallback =
    getDefaultSectionConfig(type) ??
    getDefaultSectionConfig(SectionType.CUSTOM);
  if (!fallback) {
    throw new DomainError("セクション設定の初期化に失敗しました", "VALIDATION");
  }
  return fallback;
}

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

async function ensurePageExists(pageId: string): Promise<void> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { id: true },
  });

  if (!page) {
    throw new DomainError("ページが見つかりません", "NOT_FOUND");
  }
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

export async function createPageSectionCommand(
  input: CreateSectionInput,
  contentHtml: string | null,
): Promise<{ id: string }> {
  if (!input.pageId) {
    throw new DomainError("ページIDは必須です", "VALIDATION");
  }

  await ensurePageExists(input.pageId);
  const config = validateConfig(input.type, input.config);

  const maxOrder = await prisma.section.aggregate({
    where: { pageId: input.pageId },
    _max: { order: true },
  });

  const section = await prisma.section.create({
    data: omitUndefined({
      pageId: input.pageId,
      type: input.type,
      title: input.title,
      config: cloneJsonValue(config),
      design: cloneJsonValue(input.design ?? {}),
      contentJson: parseJsonValue(input.contentJson),
      contentHtml,
      order: input.order ?? (maxOrder._max.order ?? -1) + 1,
      isActive: input.isActive,
    }),
    select: { id: true },
  });

  return section;
}

export async function updatePageSectionCommand(
  id: string,
  input: UpdateSectionInput,
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
      title: input.title,
      config: config === undefined ? undefined : cloneJsonValue(config),
      design:
        input.design === undefined ? undefined : cloneJsonValue(input.design),
      ...(input.contentJson !== undefined
        ? {
            contentJson: parseJsonValue(input.contentJson),
            contentHtml: contentHtml ?? null,
          }
        : {}),
      isActive: input.isActive,
    }),
  });

  return { pageId: existing.pageId };
}

export async function togglePageSectionCommand(
  id: string,
  isActive: boolean,
): Promise<{ pageId: string }> {
  const existing = await ensurePageSectionExists(id);

  await prisma.section.update({
    where: { id },
    data: { isActive },
  });

  return { pageId: existing.pageId };
}

export async function updatePageSectionOrderCommand(
  pageId: string,
  input: UpdateSectionOrderInput,
): Promise<void> {
  await ensurePageExists(pageId);

  await prisma.$transaction(
    input.sections.map((item) =>
      prisma.section.update({
        where: { id: item.id },
        data: { order: item.order },
      }),
    ),
  );
}

export async function deletePageSectionCommand(
  id: string,
): Promise<{ pageId: string }> {
  const existing = await ensurePageSectionExists(id);

  await prisma.section.delete({
    where: { id },
  });

  return { pageId: existing.pageId };
}

export async function duplicatePageSectionCommand(id: string) {
  const existing = await ensurePageSectionExists(id);
  const section = await prisma.section.findUnique({
    where: { id },
  });

  if (!section || !section.pageId) {
    throw new DomainError("セクションが見つかりません", "NOT_FOUND");
  }

  const maxOrderSection = await prisma.section.findFirst({
    where: { pageId: section.pageId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const duplicated = await prisma.section.create({
    data: omitUndefined({
      pageId: section.pageId,
      type: section.type,
      title: section.title ? `コピー - ${section.title}` : null,
      config: section.config ?? undefined,
      design: section.design ?? undefined,
      contentHtml: section.contentHtml,
      contentJson: section.contentJson ?? undefined,
      order: (maxOrderSection?.order ?? 0) + 1,
      isActive: section.isActive,
    }),
  });

  return {
    pageId: existing.pageId,
    section: {
      id: duplicated.id,
      pageId: duplicated.pageId ?? "",
      type: duplicated.type,
      title: duplicated.title,
      config: parseSectionConfig(duplicated.type, duplicated.config),
      design: duplicated.design,
      contentHtml: duplicated.contentHtml,
      contentJson: duplicated.contentJson,
      order: duplicated.order,
      isActive: duplicated.isActive,
      createdAt: duplicated.createdAt,
      updatedAt: duplicated.updatedAt,
    },
  };
}
