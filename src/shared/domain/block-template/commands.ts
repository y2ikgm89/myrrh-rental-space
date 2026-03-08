import "server-only";

import { Prisma, prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

type CreateBlockTemplateInput = {
  name: string;
  description?: string;
  nodeJson: unknown;
};

function isInputJsonValue(value: unknown): value is Prisma.InputJsonValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isInputJsonValue);
  }

  if (value === null || typeof value !== "object") {
    return false;
  }

  return Object.values(value).every(isInputJsonValue);
}

function normalizeNodeJson(nodeJson: unknown): Prisma.InputJsonValue {
  let normalized: unknown;

  try {
    normalized = JSON.parse(JSON.stringify(nodeJson));
  } catch {
    throw new DomainError("テンプレートの内容が不正です", "VALIDATION");
  }

  if (!isInputJsonValue(normalized)) {
    throw new DomainError("テンプレートの内容が不正です", "VALIDATION");
  }

  return normalized;
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
