import "server-only";

import { isRecord } from "@/shared/lib/serialize";

/**
 * Prisma unique 制約違反 (P2002) を検出する type guard。
 *
 * `error.code === "P2002"` の判定。target field 制約付き検出も option 経由でサポート。
 * Prisma の値 (`Prisma.PrismaClientKnownRequestError` 等) は re-export 禁止のため
 * (`.claude/rules/db-domain.md` の gateway 契約: `Prisma.JsonNull` の identity 比較が
 * runtime 間で壊れる)、runtime shape check で判定する。
 *
 * ## 用途
 * webhook / command から Refund child 等を idempotent に write する際、`upsert` の
 * SELECT+INSERT race (Prisma issue #20229) を回避するため、単一 `create` + `catch`
 * pattern を使うのが真の atomic。この helper が P2002 判定を集約する。
 *
 * @param error - catch した任意 error
 * @param targetField - 特定 field (`@unique` の対象) の制約違反のみ検出したい場合、
 *                     その field 名。省略時は任意の unique 制約違反を true 判定。
 * @returns P2002 (かつ optional target field) の unique 制約違反なら true
 */
export function isPrismaUniqueConstraintError(
  error: unknown,
  targetField?: string,
): boolean {
  if (!isRecord(error)) return false;
  if (error["code"] !== "P2002") return false;
  if (targetField === undefined) return true;

  const meta = error["meta"];
  if (!isRecord(meta)) return false;
  const target = meta["target"];
  if (Array.isArray(target)) return target.includes(targetField);
  if (typeof target === "string") return target.includes(targetField);
  return false;
}
