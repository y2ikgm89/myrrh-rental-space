import "server-only";

import { prisma } from "@/shared/db/prisma";

export async function getAssignedPageIdsForUser(userId: string): Promise<string[]> {
  const assignments = await prisma.userPageAssignment.findMany({
    where: { userId },
    select: { pageId: true },
  });

  return assignments.map((assignment) => assignment.pageId);
}
