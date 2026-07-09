import "server-only";

import { clonePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import { assertAllowedManagedImageSourcesInJson } from "@/shared/domain/media/managed-image-assertions";
import {
  buildOrderScopeLockSql,
  buildUuidOrderSqlFragments,
} from "@/shared/domain/order-sql";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  getPageTemplate,
  isRequiredSectionForTemplate,
} from "@/shared/lib/sections/page-templates";
import { getSectionDefinition } from "@/shared/lib/sections/registry";
import {
  validateSectionConfig,
  type SectionConfig,
  type UpdateSectionContentInput,
} from "@/shared/lib/validations/section";

function cloneJsonValue(value: unknown): Prisma.InputJsonValue {
  return clonePrismaInputJson(value, "JSONデータが不正です");
}

async function ensurePageSectionExists(id: string) {
  const section = await prisma.section.findUnique({
    where: { id },
    select: {
      id: true,
      pageId: true,
      type: true,
      page: { select: { slug: true, template: true } },
    },
  });

  if (!section) {
    throw new DomainError("セクションが見つかりません", "NOT_FOUND");
  }

  return {
    id: section.id,
    pageId: section.pageId,
    type: section.type,
    pageSlug: section.page.slug,
    pageTemplate: section.page.template,
  };
}

async function getPageSlugByIdOrThrow(pageId: string): Promise<string> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { slug: true },
  });
  if (!page) {
    throw new DomainError("ページが見つかりません", "NOT_FOUND");
  }
  return page.slug;
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
): Promise<{ pageId: string; pageSlug: string }> {
  const existing = await ensurePageSectionExists(id);

  const config =
    input.config === undefined
      ? undefined
      : validateConfig(existing.type, input.config);
  if (config !== undefined) {
    assertAllowedManagedImageSourcesInJson("セクション画像", config);
  }

  await prisma.section.update({
    where: { id },
    data: omitUndefined({
      config: config === undefined ? undefined : cloneJsonValue(config),
    }),
  });

  return { pageId: existing.pageId, pageSlug: existing.pageSlug };
}

// =============================================================================
// CRUD コマンド（create / delete / duplicate / toggle / reorder）
// =============================================================================

/**
 * セクションを新規作成する。registry の defaults から config を生成。
 * page-hero は 1 ページに 1 つのみ（既存があれば CONFLICT）。
 */
export async function createPageSectionCommand(input: {
  pageId: string;
  type: string;
}): Promise<{ id: string; pageId: string; pageSlug: string }> {
  const definition = getSectionDefinition(input.type);
  if (!definition) {
    throw new DomainError("不正なセクションタイプです", "VALIDATION");
  }

  // ページのテンプレートが許可するセクションのみ追加可能（サーバー権威 floor）。
  // PageEditor のクライアントフィルタと同挙動: テンプレートが未知の場合は制限しない。
  const page = await prisma.page.findUnique({
    where: { id: input.pageId },
    select: { template: true },
  });
  if (!page) {
    throw new DomainError("ページが見つかりません", "NOT_FOUND");
  }
  const template = getPageTemplate(page.template);
  if (template && !template.allowedSectionTypes.includes(input.type)) {
    throw new DomainError(
      "このページに追加できないセクションタイプです",
      "VALIDATION",
    );
  }

  // registry の defaults から config を生成
  const defaultParse = definition.configSchema.safeParse({});
  const config: unknown = defaultParse.success ? defaultParse.data : {};

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql(`sections:${input.pageId}`));

    // page-hero は 1 ページに 1 つ制約。ページ単位ロック内で確認する。
    if (input.type === "page-hero") {
      const existing = await tx.section.findFirst({
        where: { pageId: input.pageId, type: "page-hero" },
        select: { id: true },
      });
      if (existing) {
        throw new DomainError("ヒーローは既に存在します", "CONFLICT");
      }
    }

    // order: 既存セクションの max + 1（page-hero は -1 固定で先頭）
    const maxOrder = await tx.section.aggregate({
      where: { pageId: input.pageId },
      _max: { order: true },
    });
    const nextOrder =
      input.type === "page-hero" ? -1 : (maxOrder._max.order ?? -1) + 1;

    return tx.section.create({
      data: {
        pageId: input.pageId,
        type: input.type,
        config: cloneJsonValue(config),
        order: nextOrder,
        isActive: true,
      },
      select: {
        id: true,
        pageId: true,
        page: { select: { slug: true } },
      },
    });
  });

  return {
    id: created.id,
    pageId: created.pageId,
    pageSlug: created.page.slug,
  };
}

/** セクションを削除する。page-hero は ページ削除時のみ削除可能（個別削除は CONFLICT）。 */
export async function deletePageSectionCommand(
  id: string,
): Promise<{ id: string; pageId: string; pageSlug: string }> {
  const existing = await ensurePageSectionExists(id);
  if (existing.type === "page-hero") {
    throw new DomainError("ヒーローは削除できません", "CONFLICT");
  }
  // テンプレートの必須（core）セクションは削除不可（サーバー権威 floor）。
  // SectionListSidebar のクライアント disable と同じ requiredSectionTypes を強制する。
  if (isRequiredSectionForTemplate(existing.pageTemplate, existing.type)) {
    throw new DomainError(
      "このセクションはページの必須要素のため削除できません",
      "CONFLICT",
    );
  }
  await prisma.section.delete({ where: { id } });
  return { id, pageId: existing.pageId, pageSlug: existing.pageSlug };
}

/** セクションを直後に複製する。page-hero は複製不可（CONFLICT）。 */
export async function duplicatePageSectionCommand(
  id: string,
): Promise<{ id: string; pageId: string; pageSlug: string }> {
  const source = await prisma.section.findUnique({
    where: { id },
    select: {
      id: true,
      pageId: true,
      type: true,
      config: true,
      order: true,
      isActive: true,
      page: { select: { slug: true } },
    },
  });
  if (!source) {
    throw new DomainError("セクションが見つかりません", "NOT_FOUND");
  }
  if (source.type === "page-hero") {
    throw new DomainError("ヒーローは複製できません", "CONFLICT");
  }

  const sourcePageId = source.pageId;
  const sourcePageSlug = source.page.slug;
  assertAllowedManagedImageSourcesInJson("セクション画像", source.config);

  const createdId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql(`sections:${sourcePageId}`));

    // Unique 制約下で 3->4, 4->5 のような直接シフトは衝突するため、
    // 後続セクションを一時的な負数領域へ退避してから戻す。
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "sections"
        SET "order" = -("order" + 1000000)
        WHERE "pageId" = ${sourcePageId}
          AND "order" > ${source.order}
      `,
    );

    const created = await tx.section.create({
      data: {
        pageId: sourcePageId,
        type: source.type,
        config: cloneJsonValue(source.config),
        order: source.order + 1,
        isActive: source.isActive,
      },
      select: { id: true },
    });

    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "sections"
        SET "order" = -"order" - 999999
        WHERE "pageId" = ${sourcePageId}
          AND "order" <= -1000000
      `,
    );

    return created.id;
  });

  return { id: createdId, pageId: sourcePageId, pageSlug: sourcePageSlug };
}

/** セクションの有効/無効をトグルする。 */
export async function togglePageSectionActiveCommand(id: string): Promise<{
  id: string;
  pageId: string;
  pageSlug: string;
  isActive: boolean;
}> {
  const current = await prisma.section.findUnique({
    where: { id },
    select: {
      id: true,
      pageId: true,
      isActive: true,
      page: { select: { slug: true } },
    },
  });
  if (!current) {
    throw new DomainError("セクションが見つかりません", "NOT_FOUND");
  }

  const updated = await prisma.section.update({
    where: { id },
    data: { isActive: !current.isActive },
    select: { id: true, isActive: true },
  });
  return {
    id: updated.id,
    pageId: current.pageId,
    pageSlug: current.page.slug,
    isActive: updated.isActive,
  };
}

/**
 * 同一 pageId のセクションを並び替える。
 * orderedIds は同一 pageId に属する全セクション ID（過不足不可）。
 */
export async function reorderPageSectionsCommand(input: {
  pageId: string;
  orderedIds: readonly string[];
}): Promise<{ count: number; pageId: string; pageSlug: string }> {
  if (new Set(input.orderedIds).size !== input.orderedIds.length) {
    throw new DomainError("同じIDを複数指定することはできません", "VALIDATION");
  }

  const [existing, pageSlug] = await Promise.all([
    prisma.section.findMany({
      where: { pageId: input.pageId },
      select: { id: true, type: true, order: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    getPageSlugByIdOrThrow(input.pageId),
  ]);
  const existingIds = new Set(existing.map((s) => s.id));

  for (const id of input.orderedIds) {
    if (!existingIds.has(id)) {
      throw new DomainError("不正なセクションIDが含まれます", "VALIDATION");
    }
  }
  if (existing.length !== input.orderedIds.length) {
    throw new DomainError("セクション数が一致しません（過不足）", "VALIDATION");
  }

  // page-hero は順序不変（-1 固定で先頭維持）
  const heroSection = existing.find((s) => s.type === "page-hero");

  const { ids, tempCases, finalCases } = buildUuidOrderSqlFragments(
    input.orderedIds,
    (id) => id,
    (id, index) => (heroSection && id === heroSection.id ? -1 : index),
  );

  if (finalCases.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(buildOrderScopeLockSql(`sections:${input.pageId}`));

      await tx.$executeRaw`
        UPDATE "sections"
        SET "order" = CASE "id" ${Prisma.join(tempCases, " ")} END
        WHERE "id" IN (${Prisma.join(ids)})
          AND "pageId" = ${input.pageId}::uuid
      `;

      await tx.$executeRaw`
        UPDATE "sections"
        SET "order" = CASE "id" ${Prisma.join(finalCases, " ")} END
        WHERE "id" IN (${Prisma.join(ids)})
          AND "pageId" = ${input.pageId}::uuid
      `;
    });
  }

  return {
    count: input.orderedIds.length,
    pageId: input.pageId,
    pageSlug,
  };
}
