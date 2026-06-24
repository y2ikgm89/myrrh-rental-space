import "server-only";

import { clonePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
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

  // page-hero は 1 ページに 1 つ制約
  if (input.type === "page-hero") {
    const existing = await prisma.section.findFirst({
      where: { pageId: input.pageId, type: "page-hero" },
      select: { id: true },
    });
    if (existing) {
      throw new DomainError("ヒーローは既に存在します", "CONFLICT");
    }
  }

  // registry の defaults から config を生成
  const defaultParse = definition.configSchema.safeParse({});
  const config: unknown = defaultParse.success ? defaultParse.data : {};

  // order: 既存セクションの max + 1（page-hero は -1 固定で先頭）
  const maxOrder = await prisma.section.aggregate({
    where: { pageId: input.pageId },
    _max: { order: true },
  });
  const nextOrder =
    input.type === "page-hero" ? -1 : (maxOrder._max.order ?? -1) + 1;

  const created = await prisma.section.create({
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

  const createdId = await prisma.$transaction(async (tx) => {
    // source.order より大きい order を全部 +1 にずらす
    await tx.section.updateMany({
      where: { pageId: sourcePageId, order: { gt: source.order } },
      data: { order: { increment: 1 } },
    });

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
  const [existing, pageSlug] = await Promise.all([
    prisma.section.findMany({
      where: { pageId: input.pageId },
      select: { id: true, type: true, order: true },
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

  // 単一 SQL の CASE WHEN で一括更新（N 回の UPDATE ループを廃止）。
  // PostgreSQL は CASE 式の引数を順序評価するため、id ごとの分岐が成立する。
  // page-hero は -1 固定、それ以外は配列インデックス。
  const cases: Prisma.Sql[] = [];
  const ids: Prisma.Sql[] = [];
  for (let i = 0; i < input.orderedIds.length; i++) {
    const id = input.orderedIds[i];
    if (id === undefined) continue;
    const nextOrder = heroSection && id === heroSection.id ? -1 : i;
    cases.push(Prisma.sql`WHEN ${id}::uuid THEN ${nextOrder}`);
    ids.push(Prisma.sql`${id}::uuid`);
  }

  if (cases.length > 0) {
    await prisma.$executeRaw`
      UPDATE "sections"
      SET "order" = CASE "id" ${Prisma.join(cases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;
  }

  return {
    count: input.orderedIds.length,
    pageId: input.pageId,
    pageSlug,
  };
}
