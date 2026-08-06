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
 * ## driver は **物理列名**を返す（Prisma の field 名ではない）
 *
 * 呼び出し側は **`Model.field`**（例: `Refund.stripeRefundId`）で書く。
 * 同名 field が複数モデルにあっても取り違えないため。**adapter-pg が返すのは
 * 物理列名**（`stripe_refund_id`）なので、この関数が両者を橋渡しする。
 *
 * 実測（test DB, Prisma 7.8.0 + @prisma/adapter-pg）:
 *
 *   Unique constraint failed on the fields: (`stripe_refund_id`)
 *
 * 橋渡しを怠ると **無言で常に false** になる。P2002 を握り潰すはずの経路が
 * throw に変わり、Stripe の webhook 再送が無限リトライになる（KGI: 返金が
 * 正しく一度だけ行われる）。実際、物理列名を snake_case へ寄せた rename で
 * この経路が壊れ、**単体テストは fixture に旧名を焼いてあったため緑のままだった**。
 *
 * 物理名は「field 名の snake_case」と等しい。これは思い込みではなく
 * `__tests__/unit/architecture/prisma-naming-conventions.test.ts` が全 77 モデルに
 * 対して機械強制している不変条件で、さらに
 * `__tests__/unit/architecture/prisma-error-target-fields.test.ts` が
 * **この関数の呼び出し側リテラルが実在する Model.field であること**を
 * schema.prisma と突き合わせる。
 *
 * @param error - catch した任意 error
 * @param targetField - 特定 field (`@unique` の対象) の制約違反のみ検出したい場合、
 *                     **`Model.field`**（Prisma field 名）。省略時は任意の unique 制約違反を true 判定。
 * @returns P2002 (かつ optional target field) の unique 制約違反なら true
 */
/** Prisma の field 名 → 物理列名。schema.prisma 全列で成り立つことをゲートが強制する。 */
function toPhysicalColumnName(field: string): string {
  return field.replaceAll(/(?<!^)(?=[A-Z])/gu, "_").toLowerCase();
}

/** `Refund.stripeRefundId` → `{ model: "Refund", field: "stripeRefundId" }`。 */
function resolveTargetField(targetField: string): {
  readonly model: string | undefined;
  readonly field: string;
} {
  const separator = targetField.indexOf(".");
  if (separator === -1) {
    return { model: undefined, field: targetField };
  }
  return {
    model: targetField.slice(0, separator),
    field: targetField.slice(separator + 1),
  };
}

export function isPrismaUniqueConstraintError(
  error: unknown,
  targetField?: string,
): boolean {
  if (!isRecord(error)) return false;
  if (error["code"] !== "P2002") return false;
  if (targetField === undefined) return true;

  const { model, field } = resolveTargetField(targetField);
  if (field.length === 0) return false;

  const meta = error["meta"];
  if (!isRecord(meta)) return false;

  // meta.modelName があるとき Model 修飾と食い違えば false（取り違えを握り潰さない）。
  const modelName = meta["modelName"];
  if (
    model !== undefined &&
    typeof modelName === "string" &&
    modelName !== model
  ) {
    return false;
  }

  // Legacy shape (Prisma 6 rust engine / SQL Server 系):
  //   meta: { target: ["id"] } または meta: { target: "Refund_stripeRefundId_key" }
  const target = meta["target"];
  if (Array.isArray(target) && target.includes(field)) return true;
  if (typeof target === "string" && target.includes(field)) return true;

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
  //
  // **`fields` は物理列名**。field 名のまま比較すると camelCase の列で必ず false。
  const driverAdapterError = meta["driverAdapterError"];
  if (!isRecord(driverAdapterError)) return false;
  const cause = driverAdapterError["cause"];
  if (!isRecord(cause)) return false;
  if (cause["kind"] !== "UniqueConstraintViolation") return false;
  const constraint = cause["constraint"];
  if (!isRecord(constraint)) return false;
  const fields = constraint["fields"];
  if (!Array.isArray(fields)) return false;
  return fields.includes(toPhysicalColumnName(field));
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
