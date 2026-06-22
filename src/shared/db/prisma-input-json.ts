/**
 * Prisma InputJson 検証・クローン（server-only に依存しない）
 * prisma/seed.ts（Bun）や system-pages-commands から利用可能
 */

import type { Prisma } from "@generated/prisma/client";
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

  if (value === null) {
    return true;
  }

  if (typeof value !== "object") {
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

/**
 * 既パース済みオブジェクトを `Prisma.InputJsonValue` として narrow して返す。
 * `parsePrismaInputJson` は string を受けて JSON.parse + 検証するが、
 * Prisma の read 結果 (`Prisma.JsonValue`) や Zod parsed object 等の
 * **既にオブジェクト化された値** を `as Prisma.InputJsonValue` cast せず
 * runtime 検証経由で narrow したい場合はこちらを使う。
 */
export function asPrismaInputJsonValue(
  value: unknown,
  invalidMessage: string,
): Prisma.InputJsonValue {
  if (!isPrismaInputJsonValue(value)) {
    throw new DomainError(invalidMessage, "VALIDATION");
  }
  return value;
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
