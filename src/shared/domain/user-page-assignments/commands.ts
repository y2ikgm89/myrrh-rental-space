import "server-only";

import { Role } from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

export async function setAssignedPageIdsForUser(
  userId: string,
  pageIds: string[],
): Promise<{ userId: string; pageIds: string[] }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!user) {
    throw new DomainError("ユーザーが見つかりません", "NOT_FOUND");
  }

  if (user.role !== Role.EDITOR) {
    throw new DomainError(
      "ページ割り当ては編集者ロールのユーザーのみ設定できます",
      "VALIDATION",
    );
  }

  const uniquePageIds = [...new Set(pageIds)];

  if (uniquePageIds.length > 0) {
    const existingPages = await prisma.page.findMany({
      where: { id: { in: uniquePageIds }, isActive: true },
      select: { id: true },
    });
    if (existingPages.length !== uniquePageIds.length) {
      throw new DomainError("存在しないページが含まれています", "NOT_FOUND");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.userPageAssignment.deleteMany({ where: { userId } });
    if (uniquePageIds.length > 0) {
      await tx.userPageAssignment.createMany({
        data: uniquePageIds.map((pageId) => ({ userId, pageId })),
        skipDuplicates: true,
      });
    }
  });

  return { userId, pageIds: uniquePageIds };
}
