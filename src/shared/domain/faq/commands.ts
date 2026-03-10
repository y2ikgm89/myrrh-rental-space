import "server-only";

import { parsePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { omitUndefined } from "@/shared/lib/serialize";
import type {
  CreateFaqCategoryResult,
  CreateFaqItemResult,
  FaqCategoryCommandInput,
  FaqItemCommandInput,
  ToggleFaqItemPublishedResult,
} from "@/shared/domain/faq/types";

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
  const category = await prisma.faqCategory.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!category) {
    throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
  }
}

async function ensureFaqCategoryUnique(
  slug: string,
  currentId?: string,
): Promise<void> {
  const existing = await prisma.faqCategory.findFirst({
    where: omitUndefined({
      slug,
      id: currentId ? { not: currentId } : undefined,
    }),
    select: { id: true },
  });

  if (existing) {
    throw new DomainError("このスラッグは既に使用されています", "CONFLICT");
  }
}

async function ensureFaqItemExists(id: string): Promise<void> {
  const item = await prisma.faqItem.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }
}

export async function createFaqCategory(
  input: FaqCategoryCommandInput,
): Promise<CreateFaqCategoryResult> {
  await ensureFaqCategoryUnique(input.slug);

  const maxOrder = await prisma.faqCategory.aggregate({
    _max: { order: true },
  });

  const category = await prisma.faqCategory.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: normalizeNullableString(input.description),
      order: input.order || (maxOrder._max.order ?? 0) + 1,
      isActive: input.isActive,
    },
    select: { id: true },
  });

  return category;
}

export async function updateFaqCategory(
  id: string,
  input: FaqCategoryCommandInput,
): Promise<void> {
  await Promise.all([
    ensureFaqCategoryExists(id),
    ensureFaqCategoryUnique(input.slug, id),
  ]);

  await prisma.faqCategory.update({
    where: { id },
    data: {
      name: input.name,
      slug: input.slug,
      description: normalizeNullableString(input.description),
      order: input.order,
      isActive: input.isActive,
    },
  });
}

export async function deleteFaqCategory(id: string): Promise<void> {
  const category = await prisma.faqCategory.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  });

  if (!category) {
    throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
  }

  if (category._count.items > 0) {
    throw new DomainError(
      "このカテゴリには質問が含まれています。先に質問を削除または移動してください",
      "CONFLICT",
    );
  }

  await prisma.faqCategory.delete({
    where: { id },
  });
}

export async function reorderFaqCategories(
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) {
    return;
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.faqCategory.update({
        where: { id },
        data: { order: index },
      }),
    ),
  );
}

export async function createFaqItem(
  input: FaqItemCommandInput,
): Promise<CreateFaqItemResult> {
  await ensureFaqCategoryExists(input.categoryId);

  const maxOrder = await prisma.faqItem.aggregate({
    where: { categoryId: input.categoryId },
    _max: { order: true },
  });

  const item = await prisma.faqItem.create({
    data: {
      categoryId: input.categoryId,
      question: input.question,
      answerJson: parseAnswerJson(input.answerJson),
      answerHtml: input.answerHtml,
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
    where: { id },
    data: {
      categoryId: input.categoryId,
      question: input.question,
      answerJson: parseAnswerJson(input.answerJson),
      answerHtml: input.answerHtml,
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

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.faqItem.update({
        where: { id },
        data: { order: index, categoryId },
      }),
    ),
  );
}

export async function toggleFaqItemPublished(
  id: string,
): Promise<ToggleFaqItemPublishedResult> {
  const item = await prisma.faqItem.findUnique({
    where: { id },
    select: { id: true, isPublished: true },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }

  const isPublished = !item.isPublished;

  await prisma.faqItem.update({
    where: { id },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
  });

  return { isPublished };
}
