import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

export async function incrementFaqItemViewCount(id: string): Promise<{ incremented: boolean }> {
  const result = await prisma.faqItem.updateMany({
    where: { id, isPublished: true, deletedAt: null },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });
  return { incremented: result.count > 0 };
}

export async function detectStaleFaqItems(staleDays: number, limit = 20): Promise<ReadonlyArray<{ id: string; question: string; updatedAt: Date }>> {
  if (staleDays < 1) {
    throw new DomainError("staleDays は 1 以上でなければなりません", "VALIDATION");
  }
  const threshold = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  return prisma.faqItem.findMany({
    where: { isPublished: true, deletedAt: null, updatedAt: { lt: threshold } },
    select: { id: true, question: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
}

export async function voteFaqItemHelpful(id: string, vote: "helpful" | "not-helpful"): Promise<{ voted: boolean }> {
  const result = await prisma.faqItem.updateMany({
    where: { id, isPublished: true, deletedAt: null },
    data: vote === "helpful" ? { helpfulCount: { increment: 1 } } : { notHelpfulCount: { increment: 1 } },
  });
  return { voted: result.count > 0 };
}

export async function permanentlyDeleteExpiredFaqTrash(retentionDays: number): Promise<{ categoriesDeleted: number; itemsDeleted: number }> {
  if (retentionDays < 0) {
    throw new DomainError("retentionDays は 0 以上でなければなりません", "VALIDATION");
  }
  const threshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const itemsResult = await prisma.faqItem.deleteMany({ where: { deletedAt: { not: null, lt: threshold } } });
  const categoriesResult = await prisma.faqCategory.deleteMany({ where: { deletedAt: { not: null, lt: threshold } } });
  return { categoriesDeleted: categoriesResult.count, itemsDeleted: itemsResult.count };
}
