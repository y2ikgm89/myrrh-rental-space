import "server-only";

import { clonePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

type CreateBlockTemplateInput = {
  name: string;
  description?: string;
  nodeJson: unknown;
};

function normalizeNodeJson(nodeJson: unknown) {
  return clonePrismaInputJson(nodeJson, "テンプレートの内容が不正です");
}

export async function createBlockTemplate(
  input: CreateBlockTemplateInput,
  userId: string,
): Promise<{ id: string }> {
  const template = await prisma.blockTemplate.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      nodeJson: normalizeNodeJson(input.nodeJson),
      createdBy: userId,
    },
    select: { id: true },
  });

  return { id: template.id };
}

export async function deleteBlockTemplate(id: string): Promise<void> {
  const template = await prisma.blockTemplate.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!template) {
    throw new DomainError("テンプレートが見つかりません", "NOT_FOUND");
  }

  await prisma.blockTemplate.delete({
    where: { id },
  });
}
