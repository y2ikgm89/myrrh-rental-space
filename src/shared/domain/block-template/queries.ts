import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { BlockTemplateListItem } from "@/shared/domain/block-template/types";

export async function getBlockTemplates(): Promise<BlockTemplateListItem[]> {
  const templates = await prisma.blockTemplate.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      creator: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    createdAt: template.createdAt,
    creatorName: template.creator?.name ?? null,
  }));
}

export async function getBlockTemplateNodeJsonById(
  id: string,
): Promise<{ nodeJson: unknown } | null> {
  const template = await prisma.blockTemplate.findUnique({
    where: { id },
    select: { nodeJson: true },
  });

  if (!template) {
    return null;
  }

  return { nodeJson: template.nodeJson };
}
