import "server-only";

import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import {
  buildOrderScopeLockSql,
  buildUuidOrderSqlFragments,
} from "@/shared/domain/order-sql";
import type {
  CreateFaqItemResult,
  FaqItemCommandInput,
  UpdateFaqItemPublishedResult,
} from "@/shared/domain/faq/types";

async function ensureFaqCategoryExists(id: string): Promise<void> {
  const category = await prisma.faqCategory.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!category) {
    throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
  }
}

async function ensureFaqItemExists(
  id: string,
): Promise<{ id: string; categoryId: string }> {
  const item = await prisma.faqItem.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, categoryId: true },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }

  return item;
}

// ============================================================================
// FaqItem: create / update / soft delete / reorder / toggle / restore / permanent
// ============================================================================

export async function createFaqItem(
  input: FaqItemCommandInput,
): Promise<CreateFaqItemResult> {
  const item = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      buildOrderScopeLockSql(`faq_items:${input.categoryId}`),
    );

    // deleteFaqCategory と同じ `faq_items:${categoryId}` lock を共有しているため、
    // lock 取得後にここで再確認することで、カテゴリ削除とのレースを防ぐ
    // （lock 取得前の事前チェックだと、チェック後・lock 取得前にカテゴリが
    // 削除される check-then-act の窓が残る）。
    const category = await tx.faqCategory.findFirst({
      where: { id: input.categoryId, deletedAt: null },
      select: { id: true },
    });

    if (!category) {
      throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
    }

    const maxOrder = await tx.faqItem.aggregate({
      where: { categoryId: input.categoryId, deletedAt: null },
      _max: { order: true },
    });

    return tx.faqItem.create({
      data: {
        categoryId: input.categoryId,
        question: input.question,
        answer: input.answer,
        // 並び順は末尾に自動採番。手動指定は廃止（並び替えは D&D の reorderFaqItems が SSoT）
        order: (maxOrder._max.order ?? -1) + 1,
        isPublished: input.isPublished,
        publishedAt: input.isPublished ? new Date() : null,
      },
      select: { id: true },
    });
  });

  return item;
}

export async function updateFaqItem(
  id: string,
  input: FaqItemCommandInput,
): Promise<void> {
  const existing = await ensureFaqItemExists(id);
  const categoryChanged = existing.categoryId !== input.categoryId;
  if (!categoryChanged) {
    await ensureFaqCategoryExists(input.categoryId);
    await prisma.faqItem.update({
      where: { id, deletedAt: null },
      data: {
        categoryId: input.categoryId,
        question: input.question,
        answer: input.answer,
        isPublished: input.isPublished,
        publishedAt: input.isPublished ? new Date() : null,
      },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      buildOrderScopeLockSql(`faq_items:${input.categoryId}`),
    );

    // createFaqItem と同じ理由で、移動先カテゴリの存在チェックは lock 取得後に
    // tx 内で行う（deleteFaqCategory とのレースを防ぐ）。
    const targetCategory = await tx.faqCategory.findFirst({
      where: { id: input.categoryId, deletedAt: null },
      select: { id: true },
    });

    if (!targetCategory) {
      throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
    }

    const maxTargetOrder = await tx.faqItem.aggregate({
      where: { categoryId: input.categoryId, deletedAt: null },
      _max: { order: true },
    });

    // 同一カテゴリ内では order 不変。カテゴリ移動時のみ移動先末尾へ再採番する。
    await tx.faqItem.update({
      where: { id, deletedAt: null },
      data: {
        categoryId: input.categoryId,
        question: input.question,
        answer: input.answer,
        order: (maxTargetOrder._max.order ?? -1) + 1,
        isPublished: input.isPublished,
        publishedAt: input.isPublished ? new Date() : null,
      },
    });
  });
}

export async function deleteFaqItem(id: string): Promise<void> {
  await ensureFaqItemExists(id);

  await prisma.faqItem.update({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

export async function restoreFaqItem(id: string): Promise<void> {
  const item = await prisma.faqItem.findUnique({
    where: { id },
    select: { id: true, deletedAt: true, categoryId: true },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }

  if (item.deletedAt === null) {
    throw new DomainError("この質問は削除されていません", "CONFLICT");
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      buildOrderScopeLockSql(`faq_items:${item.categoryId}`),
    );

    // createFaqItem / updateFaqItem と同じ理由で、親カテゴリの存在チェックは
    // lock 取得後に tx 内で行う（deleteFaqCategory とのレースを防ぐ）。
    const category = await tx.faqCategory.findFirst({
      where: { id: item.categoryId, deletedAt: null },
      select: { id: true },
    });

    if (!category) {
      throw new DomainError(
        "親カテゴリが削除されています。先にカテゴリを復元してください",
        "CONFLICT",
      );
    }

    const maxOrder = await tx.faqItem.aggregate({
      where: { categoryId: item.categoryId, deletedAt: null },
      _max: { order: true },
    });

    await tx.faqItem.update({
      where: { id },
      data: {
        deletedAt: null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  });
}

export async function permanentlyDeleteFaqItem(id: string): Promise<void> {
  const item = await prisma.faqItem.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }

  if (item.deletedAt === null) {
    throw new DomainError(
      "先にソフトデリートしてから完全削除してください",
      "CONFLICT",
    );
  }

  await prisma.faqItem.delete({
    where: { id },
  });
}

export async function reorderFaqItems(
  categoryId: string,
  items: readonly { id: string; order: number }[],
): Promise<void> {
  await ensureFaqCategoryExists(categoryId);

  if (items.length === 0) {
    return;
  }

  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new DomainError("同じIDを複数指定することはできません", "VALIDATION");
  }

  const targetOrders = items.map((item) => item.order);
  if (new Set(targetOrders).size !== targetOrders.length) {
    throw new DomainError(
      "同じ並び順を複数指定することはできません",
      "VALIDATION",
    );
  }

  const existingItems = await prisma.faqItem.findMany({
    where: {
      id: { in: ids },
      categoryId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (existingItems.length !== items.length) {
    throw new DomainError("カテゴリ内の質問が見つかりません", "NOT_FOUND");
  }

  const conflictingItems = await prisma.faqItem.findMany({
    where: {
      categoryId,
      deletedAt: null,
      id: { notIn: ids },
      order: { in: targetOrders },
    },
    select: { id: true },
  });

  if (conflictingItems.length > 0) {
    throw new DomainError("指定した並び順は他の質問と重複します", "VALIDATION");
  }

  const {
    ids: idFragments,
    tempCases,
    finalCases,
  } = buildUuidOrderSqlFragments(
    items,
    (item) => item.id,
    (item) => item.order,
  );

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql(`faq_items:${categoryId}`));

    await tx.$executeRaw`
      UPDATE "faq_items"
      SET "order" = CASE "id" ${Prisma.join(tempCases, " ")} END
      WHERE "id" IN (${Prisma.join(idFragments)})
        AND category_id = ${categoryId}::uuid
        AND deleted_at IS NULL
    `;

    await tx.$executeRaw`
      UPDATE "faq_items"
      SET "order" = CASE "id" ${Prisma.join(finalCases, " ")} END
      WHERE "id" IN (${Prisma.join(idFragments)})
        AND category_id = ${categoryId}::uuid
        AND deleted_at IS NULL
    `;
  });
}

export async function updateFaqItemPublished(
  id: string,
  isPublished: boolean,
): Promise<UpdateFaqItemPublishedResult> {
  const item = await prisma.faqItem.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }

  await prisma.faqItem.update({
    where: { id, deletedAt: null },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
  });

  return { isPublished };
}
