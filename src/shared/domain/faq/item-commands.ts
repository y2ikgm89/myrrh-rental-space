import "server-only";

import { parsePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import type {
  CreateFaqItemResult,
  FaqItemCommandInput,
  ToggleFaqItemPublishedResult,
} from "@/shared/domain/faq/types";

const ANSWER_PLAIN_TEXT_MAX_LENGTH = 200;

function parseAnswerJson(answerJson: string) {
  return parsePrismaInputJson(answerJson, "回答データが不正です");
}

function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  return value;
}

async function ensureFaqCategoryExists(id: string): Promise<void> {
  const category = await prisma.faqCategory.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!category) {
    throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
  }
}

async function ensureFaqItemExists(id: string): Promise<void> {
  const item = await prisma.faqItem.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }
}

// ============================================================================
// FaqItem: create / update / soft delete / reorder / toggle / restore / permanent
// ============================================================================

export async function createFaqItem(
  input: FaqItemCommandInput,
): Promise<CreateFaqItemResult> {
  await ensureFaqCategoryExists(input.categoryId);

  const maxOrder = await prisma.faqItem.aggregate({
    where: { categoryId: input.categoryId, deletedAt: null },
    _max: { order: true },
  });

  const item = await prisma.faqItem.create({
    data: {
      categoryId: input.categoryId,
      question: input.question,
      answerJson: parseAnswerJson(input.answerJson),
      answerHtml: input.answerHtml,
      answerPlainText: stripHtmlToText(
        input.answerHtml,
        ANSWER_PLAIN_TEXT_MAX_LENGTH,
      ),
      order: input.order || (maxOrder._max.order ?? 0) + 1,
      isPublished: input.isPublished,
      publishedAt: input.isPublished ? new Date() : null,
      metaDescription: normalizeNullableString(input.metaDescription),
      metaKeywords: normalizeNullableString(input.metaKeywords),
      ogpTitle: normalizeNullableString(input.ogpTitle),
      ogpDescription: normalizeNullableString(input.ogpDescription),
      ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
    },
    select: { id: true },
  });

  return item;
}

export async function updateFaqItem(
  id: string,
  input: FaqItemCommandInput,
): Promise<void> {
  await Promise.all([
    ensureFaqItemExists(id),
    ensureFaqCategoryExists(input.categoryId),
  ]);

  await prisma.faqItem.update({
    where: { id, deletedAt: null },
    data: {
      categoryId: input.categoryId,
      question: input.question,
      answerJson: parseAnswerJson(input.answerJson),
      answerHtml: input.answerHtml,
      answerPlainText: stripHtmlToText(
        input.answerHtml,
        ANSWER_PLAIN_TEXT_MAX_LENGTH,
      ),
      order: input.order,
      isPublished: input.isPublished,
      publishedAt: input.isPublished ? new Date() : null,
      metaDescription: normalizeNullableString(input.metaDescription),
      metaKeywords: normalizeNullableString(input.metaKeywords),
      ogpTitle: normalizeNullableString(input.ogpTitle),
      ogpDescription: normalizeNullableString(input.ogpDescription),
      ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
    },
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
    select: {
      id: true,
      deletedAt: true,
      category: { select: { id: true, deletedAt: true } },
    },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }

  if (item.deletedAt === null) {
    throw new DomainError("この質問は削除されていません", "CONFLICT");
  }

  if (item.category.deletedAt !== null) {
    throw new DomainError(
      "親カテゴリが削除されています。先にカテゴリを復元してください",
      "CONFLICT",
    );
  }

  await prisma.faqItem.update({
    where: { id },
    data: { deletedAt: null },
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
  orderedIds: string[],
): Promise<void> {
  await ensureFaqCategoryExists(categoryId);

  if (orderedIds.length === 0) {
    return;
  }

  // Interactive transaction で pg deprecation 回避
  await prisma.$transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx.faqItem.update({
        where: { id, deletedAt: null },
        data: { order: index, categoryId },
      });
    }
  });
}

export async function toggleFaqItemPublished(
  id: string,
): Promise<ToggleFaqItemPublishedResult> {
  const item = await prisma.faqItem.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, isPublished: true },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }

  const isPublished = !item.isPublished;

  await prisma.faqItem.update({
    where: { id, deletedAt: null },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
  });

  return { isPublished };
}
