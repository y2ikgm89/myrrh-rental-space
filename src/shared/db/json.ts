import "server-only";

import { Prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

export function isPrismaInputJsonValue(
  value: unknown,
): value is Prisma.InputJsonValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isPrismaInputJsonValue);
  }

  if (value === null || typeof value !== "object") {
    return false;
  }

  return Object.values(value).every(isPrismaInputJsonValue);
}

export function parsePrismaInputJson(
  json: string,
  invalidMessage: string,
): Prisma.InputJsonValue {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DomainError(invalidMessage, "VALIDATION");
  }

  if (!isPrismaInputJsonValue(parsed)) {
    throw new DomainError(invalidMessage, "VALIDATION");
  }

  return parsed;
}

export function clonePrismaInputJson(
  value: unknown,
  invalidMessage: string,
): Prisma.InputJsonValue {
  let cloned: unknown;

  try {
    cloned = JSON.parse(JSON.stringify(value));
  } catch {
    throw new DomainError(invalidMessage, "VALIDATION");
  }

  if (!isPrismaInputJsonValue(cloned)) {
    throw new DomainError(invalidMessage, "VALIDATION");
  }

  return cloned;
}
