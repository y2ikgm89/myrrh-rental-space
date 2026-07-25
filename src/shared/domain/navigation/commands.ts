import "server-only";

import { z } from "zod";
import { prisma } from "@/shared/db/prisma";
import { isPrismaInputJsonValue } from "@/shared/db/prisma-input-json";
import { Prisma } from "@generated/prisma/client";
import { NavigationType, SocialPlatform } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import {
  buildOrderScopeLockSql,
  buildUuidOrderSqlFragments,
} from "@/shared/domain/order-sql";
import { createSpanArraySchema } from "@/shared/lib/portable-text/schema";
import { spansToPlainText } from "@/shared/lib/portable-text";
import {
  externalPublicHrefSchema,
  isExternalPublicHref,
  isInternalNavHref,
} from "@/shared/lib/url/safe-href";

export const navigationItemInputSchema = z
  .strictObject({
    type: z.enum(NavigationType),
    parentId: z.uuid().nullable().optional(),
    /**
     * Sanity Portable Text 互換の Span 配列（テキスト + アイコン混在）。
     * icon-only モード（span token ゼロ）は NN/g 準拠で UI 層が拒否する想定。
     */
    label: createSpanArraySchema({ maxSpans: 30 }).refine(
      (spans) => spansToPlainText(spans).trim().length > 0,
      { error: "ラベルにテキストを 1 文字以上含めてください" },
    ),
    url: z.string().min(1, { error: "URLは必須です" }).max(500),
    isExternal: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.isExternal) {
      if (!isExternalPublicHref(data.url)) {
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message:
            "外部リンクは http(s) / mailto / tel の URL を指定してください（javascript: 等は不可）",
        });
      }
    } else if (!isInternalNavHref(data.url)) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "内部リンクは / から始まるパスを指定してください",
      });
    }
  });

export const navigationOrderInputSchema = z
  .array(
    z.strictObject({
      id: z.uuid(),
      order: z.number().int().min(0),
      parentId: z.uuid().nullable().optional(),
    }),
  )
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    error: "同じIDを複数指定することはできません",
  })
  .refine(
    (items) => new Set(items.map((item) => item.order)).size === items.length,
    { error: "同じ順序を複数指定することはできません" },
  )
  .refine((items) => items.every((item) => item.parentId !== item.id), {
    error: "自分自身を親に指定することはできません",
  });

export const socialLinkInputSchema = z.strictObject({
  platform: z.enum(SocialPlatform),
  url: externalPublicHrefSchema,
  isActive: z.boolean().default(true),
  showOnDesktop: z.boolean().default(true),
  showOnMobile: z.boolean().default(true),
});

export const socialLinkOrderInputSchema = z
  .array(
    z.strictObject({
      id: z.uuid(),
      order: z.number().int().min(0),
    }),
  )
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    error: "同じIDを複数指定することはできません",
  })
  .refine(
    (items) => new Set(items.map((item) => item.order)).size === items.length,
    { error: "同じ順序を複数指定することはできません" },
  );

export type NavigationItemInput = z.infer<typeof navigationItemInputSchema>;
export type NavigationOrderInput = z.infer<typeof navigationOrderInputSchema>;
export type SocialLinkInput = z.infer<typeof socialLinkInputSchema>;
export type SocialLinkOrderInput = z.infer<typeof socialLinkOrderInputSchema>;

type NavigationParentRow = {
  id: string;
  type: NavigationType;
  parentId: string | null;
};

export function assertValidNavigationParent(params: {
  type: NavigationType;
  parentId: string | null;
  parent: NavigationParentRow | null;
  itemHasChildren: boolean;
}): void {
  if (params.parentId === null) {
    return;
  }

  if (!params.parent) {
    throw new DomainError("親ナビゲーションが見つかりません", "NOT_FOUND");
  }

  if (params.parent.type !== params.type) {
    throw new DomainError("親ナビゲーションの種別が一致しません", "VALIDATION");
  }

  if (params.parent.parentId !== null) {
    throw new DomainError(
      "親はトップレベルの項目のみ指定できます",
      "VALIDATION",
    );
  }

  if (params.itemHasChildren) {
    throw new DomainError(
      "子メニューがある項目はサブメニューにできません",
      "VALIDATION",
    );
  }
}

async function loadNavigationParentValidationContext(params: {
  type: NavigationType;
  parentId: string | null;
  itemId?: string;
}): Promise<{
  parent: NavigationParentRow | null;
  itemHasChildren: boolean;
}> {
  const [parent, childCount] = await Promise.all([
    params.parentId === null
      ? Promise.resolve(null)
      : prisma.navigationItem.findUnique({
          where: { id: params.parentId },
          select: { id: true, type: true, parentId: true },
        }),
    params.itemId
      ? prisma.navigationItem.count({ where: { parentId: params.itemId } })
      : Promise.resolve(0),
  ]);

  return {
    parent,
    itemHasChildren: childCount > 0,
  };
}

async function ensureValidNavigationParent(params: {
  type: NavigationType;
  parentId: string | null;
  itemId?: string;
}): Promise<void> {
  const context = await loadNavigationParentValidationContext(params);
  assertValidNavigationParent({
    type: params.type,
    parentId: params.parentId,
    parent: context.parent,
    itemHasChildren: context.itemHasChildren,
  });
}

function normalizeNavigationItemInput(data: NavigationItemInput) {
  // PortableTextSpan[] discriminated union を Prisma の Json 列に渡す境界。
  // Zod が runtime 検証済みのため `isPrismaInputJsonValue` で型 narrow するだけで十分。
  if (!isPrismaInputJsonValue(data.label)) {
    throw new DomainError("ナビゲーションラベルが不正です", "VALIDATION");
  }
  return {
    type: data.type,
    parentId: data.parentId ?? null,
    label: data.label,
    url: data.url,
    isExternal: data.isExternal,
    isActive: data.isActive,
  };
}

export async function createNavigationItem(
  data: NavigationItemInput,
): Promise<{ id: string }> {
  await ensureValidNavigationParent({
    type: data.type,
    parentId: data.parentId ?? null,
  });

  const item = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql(`navigation:${data.type}`));

    const maxOrder = await tx.navigationItem.aggregate({
      where: { type: data.type },
      _max: { order: true },
    });

    return tx.navigationItem.create({
      data: {
        ...normalizeNavigationItemInput(data),
        // order はシステム管理（末尾に自動採番、D&D reorder が SSoT）
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  });

  return { id: item.id };
}

export async function updateNavigationItem(
  id: string,
  data: NavigationItemInput,
): Promise<void> {
  const existing = await prisma.navigationItem.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError("ナビゲーションが見つかりません", "NOT_FOUND");
  }

  await ensureValidNavigationParent({
    type: data.type,
    parentId: data.parentId ?? null,
    itemId: id,
  });

  await prisma.navigationItem.update({
    where: { id },
    data: normalizeNavigationItemInput(data),
  });
}

export async function updateNavigationItemActive(
  id: string,
  isActive: boolean,
): Promise<{ id: string; isActive: boolean }> {
  const existing = await prisma.navigationItem.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError("ナビゲーションが見つかりません", "NOT_FOUND");
  }

  return prisma.navigationItem.update({
    where: { id },
    data: { isActive },
    select: { id: true, isActive: true },
  });
}

export async function deleteNavigationItem(id: string): Promise<void> {
  const item = await prisma.navigationItem.findUnique({
    where: { id },
    select: {
      id: true,
      children: {
        select: { id: true },
      },
    },
  });

  if (!item) {
    throw new DomainError("ナビゲーションが見つかりません", "NOT_FOUND");
  }

  if (item.children.length > 0) {
    throw new DomainError("サブメニューがあるため削除できません", "CONFLICT");
  }

  await prisma.navigationItem.delete({
    where: { id },
  });
}

export async function updateNavigationOrder(
  items: NavigationOrderInput,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new DomainError("同じIDを複数指定することはできません", "VALIDATION");
  }
  if (new Set(items.map((item) => item.order)).size !== items.length) {
    throw new DomainError(
      "同じ順序を複数指定することはできません",
      "VALIDATION",
    );
  }

  const itemIds = items.map((item) => item.id);
  const targetRows = await prisma.navigationItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, type: true },
  });
  const targetIds = new Set(targetRows.map((item) => item.id));

  for (const item of items) {
    if (!targetIds.has(item.id)) {
      throw new DomainError("ナビゲーションが見つかりません", "NOT_FOUND");
    }
  }

  const targetType = targetRows[0]?.type;
  if (
    targetType === undefined ||
    targetRows.some((item) => item.type !== targetType)
  ) {
    throw new DomainError("ナビゲーション種別が一致しません", "VALIDATION");
  }

  const allTypeItems = await prisma.navigationItem.findMany({
    where: { type: targetType },
    select: { id: true },
  });
  if (allTypeItems.length !== items.length) {
    throw new DomainError(
      "ナビゲーション数が一致しません（過不足）",
      "VALIDATION",
    );
  }

  const parentIds = [
    ...new Set(
      items
        .map((item) => item.parentId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const parentRows =
    parentIds.length === 0
      ? []
      : await prisma.navigationItem.findMany({
          where: { id: { in: parentIds } },
          select: { id: true, type: true, parentId: true },
        });
  const parentRowsById = new Map(parentRows.map((item) => [item.id, item]));

  const childCounts =
    itemIds.length === 0
      ? []
      : await prisma.navigationItem.groupBy({
          by: ["parentId"],
          where: { parentId: { in: itemIds } },
          _count: { _all: true },
        });
  const childCountByParentId = new Map(
    childCounts.flatMap((row) =>
      row.parentId === null ? [] : [[row.parentId, row._count._all] as const],
    ),
  );

  for (const item of items) {
    const parentId = item.parentId ?? null;
    assertValidNavigationParent({
      type: targetType,
      parentId,
      parent: parentId === null ? null : (parentRowsById.get(parentId) ?? null),
      itemHasChildren: (childCountByParentId.get(item.id) ?? 0) > 0,
    });
  }

  const { ids, tempCases, finalCases } = buildUuidOrderSqlFragments(
    items,
    (item) => item.id,
    (item) => item.order,
  );
  const parentCases: Prisma.Sql[] = [];
  for (const item of items) {
    if (item.parentId !== undefined) {
      parentCases.push(
        Prisma.sql`WHEN ${item.id}::uuid THEN ${
          item.parentId === null
            ? Prisma.sql`NULL`
            : Prisma.sql`${item.parentId}::uuid`
        }`,
      );
    }
  }

  if (parentCases.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(buildOrderScopeLockSql(`navigation:${targetType}`));

      await tx.$executeRaw`
        UPDATE "navigation_items"
        SET "order" = CASE "id" ${Prisma.join(tempCases, " ")} END
        WHERE "id" IN (${Prisma.join(ids)})
      `;

      await tx.$executeRaw`
        UPDATE "navigation_items"
        SET
          "order" = CASE "id" ${Prisma.join(finalCases, " ")} END,
          "parentId" = CASE "id" ${Prisma.join(parentCases, " ")} ELSE "parentId" END
        WHERE "id" IN (${Prisma.join(ids)})
      `;
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql(`navigation:${targetType}`));

    await tx.$executeRaw`
      UPDATE "navigation_items"
      SET "order" = CASE "id" ${Prisma.join(tempCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;

    await tx.$executeRaw`
      UPDATE "navigation_items"
      SET "order" = CASE "id" ${Prisma.join(finalCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;
  });
}

function normalizeSocialLinkInput(data: SocialLinkInput) {
  return {
    platform: data.platform,
    url: data.url,
    isActive: data.isActive,
    showOnDesktop: data.showOnDesktop,
    showOnMobile: data.showOnMobile,
  };
}

export async function createSocialLink(
  data: SocialLinkInput,
): Promise<{ id: string }> {
  const link = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("social_links:all"));

    const maxOrder = await tx.socialLink.aggregate({
      _max: { order: true },
    });

    return tx.socialLink.create({
      data: {
        ...normalizeSocialLinkInput(data),
        // order はシステム管理（末尾に自動採番、D&D reorder が SSoT）
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  });

  return { id: link.id };
}

export async function updateSocialLink(
  id: string,
  data: SocialLinkInput,
): Promise<void> {
  const existing = await prisma.socialLink.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError("SNSリンクが見つかりません", "NOT_FOUND");
  }

  await prisma.socialLink.update({
    where: { id },
    data: normalizeSocialLinkInput(data),
  });
}

async function ensureSocialLinkExists(id: string): Promise<void> {
  const existing = await prisma.socialLink.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError("SNSリンクが見つかりません", "NOT_FOUND");
  }
}

export async function updateSocialLinkActive(
  id: string,
  isActive: boolean,
): Promise<{ id: string; isActive: boolean }> {
  await ensureSocialLinkExists(id);

  return prisma.socialLink.update({
    where: { id },
    data: { isActive },
    select: { id: true, isActive: true },
  });
}

export async function updateSocialLinkDesktopVisibility(
  id: string,
  showOnDesktop: boolean,
): Promise<{ id: string; showOnDesktop: boolean }> {
  await ensureSocialLinkExists(id);

  return prisma.socialLink.update({
    where: { id },
    data: { showOnDesktop },
    select: { id: true, showOnDesktop: true },
  });
}

export async function updateSocialLinkMobileVisibility(
  id: string,
  showOnMobile: boolean,
): Promise<{ id: string; showOnMobile: boolean }> {
  await ensureSocialLinkExists(id);

  return prisma.socialLink.update({
    where: { id },
    data: { showOnMobile },
    select: { id: true, showOnMobile: true },
  });
}

export async function deleteSocialLink(id: string): Promise<void> {
  const existing = await prisma.socialLink.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError("SNSリンクが見つかりません", "NOT_FOUND");
  }

  await prisma.socialLink.delete({
    where: { id },
  });
}

export async function updateSocialLinkOrder(
  items: SocialLinkOrderInput,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new DomainError("同じIDを複数指定することはできません", "VALIDATION");
  }
  if (new Set(items.map((item) => item.order)).size !== items.length) {
    throw new DomainError(
      "同じ順序を複数指定することはできません",
      "VALIDATION",
    );
  }

  const existing = await prisma.socialLink.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((link) => link.id));

  for (const item of items) {
    if (!existingIds.has(item.id)) {
      throw new DomainError("SNSリンクが見つかりません", "NOT_FOUND");
    }
  }

  if (existing.length !== items.length) {
    throw new DomainError("SNSリンク数が一致しません（過不足）", "VALIDATION");
  }

  const { ids, tempCases, finalCases } = buildUuidOrderSqlFragments(
    items,
    (item) => item.id,
    (item) => item.order,
  );

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("social_links:all"));

    await tx.$executeRaw`
      UPDATE "social_links"
      SET "order" = CASE "id" ${Prisma.join(tempCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;

    await tx.$executeRaw`
      UPDATE "social_links"
      SET "order" = CASE "id" ${Prisma.join(finalCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;
  });
}
