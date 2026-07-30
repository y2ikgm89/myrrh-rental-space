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

  // Legacy shape (Prisma 6 rust engine / SQL Server 系):
  //   meta: { target: ["id"] } または meta: { target: "Refund_stripeRefundId_key" }
  const target = meta["target"];
  if (Array.isArray(target) && target.includes(targetField)) return true;
  if (typeof target === "string" && target.includes(targetField)) return true;

  // Prisma 7 + `@prisma/adapter-pg` shape:
  //   meta: {
  //     modelName: "StripeEvent",
  //     driverAdapterError: {
  //       name: "DriverAdapterError",
  //       cause: {
  //         originalCode: "23505",
  //         kind: "UniqueConstraintViolation",
  //         constraint: { fields: ["id"] }
  //       }
  //     }
  //   }
  // legacy shape に fallthrough させず driverAdapterError.cause.constraint.fields
  // まで潜って比較する (この経路が壊れると webhook / refund の idempotency chokepoint
  // が silent に 500 で throw して Stripe 再送の無限リトライを引き起こす)。
  const driverAdapterError = meta["driverAdapterError"];
  if (!isRecord(driverAdapterError)) return false;
  const cause = driverAdapterError["cause"];
  if (!isRecord(cause)) return false;
  if (cause["kind"] !== "UniqueConstraintViolation") return false;
  const constraint = cause["constraint"];
  if (!isRecord(constraint)) return false;
  const fields = constraint["fields"];
  if (Array.isArray(fields) && fields.includes(targetField)) return true;
  return false;
}

/**
 * PostgreSQL EXCLUDE 制約違反 (SQLSTATE 23P01) を検出する type guard。
 *
 * P2002 (unique constraint) と異なり、Prisma 7 + `@prisma/adapter-pg` は
 * exclusion constraint 違反を `PrismaClientKnownRequestError` にラップしない
 * （Prisma の error-code マッピング表に 23P01 のエントリが無いため）。
 * catch されるのは adapter 層の生の `DriverAdapterError` そのもの:
 *
 *   {
 *     name: "DriverAdapterError",
 *     cause: {
 *       code: "23P01",
 *       originalCode: "23P01",
 *       kind: "postgres",
 *       message: "conflicting key value violates exclusion constraint \"...\"",
 *       detail: "Key (...) conflicts with existing key (...)."
 *     }
 *   }
 *
 * （`__tests__/integration/domain/reservations/exclusion-violation-shape.test.ts` で実測）。
 * `reservations_no_active_time_overlap_excl` は DEFERRABLE ではないため文単位で
 * 即時発火し、その statement を直接 try/catch できる。一方 Event⇔Reservation の
 * cross-table CONSTRAINT TRIGGER 3 本は DEFERRABLE INITIALLY DEFERRED で
 * COMMIT 時にしか発火しないため、それらを拾うには `$transaction(...)` 呼び出し
 * 自体を try/catch で包む必要がある（tx callback 内の try/catch では捕捉不可）。
 *
 * @param error - catch した任意 error
 * @param constraintName - 特定制約名のみ検出したい場合に指定。省略時は任意の
 *                        exclusion constraint 違反を true 判定
 */
export function isPrismaExclusionConstraintError(
  error: unknown,
  constraintName?: string,
): boolean {
  if (!isRecord(error)) return false;
  if (error["name"] !== "DriverAdapterError") return false;

  const cause = error["cause"];
  if (!isRecord(cause)) return false;
  if (cause["code"] !== "23P01") return false;
  if (constraintName === undefined) return true;

  const message = cause["message"];
  return typeof message === "string" && message.includes(constraintName);
}
