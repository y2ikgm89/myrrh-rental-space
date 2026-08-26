import "server-only";

import { isRecord } from "@/shared/lib/serialize";

/**
 * Prisma unique 制約違反 (P2002) を検出する type guard。
 *
 * `error.code === "P2002"` の判定。target field 制約付き検出も option 経由でサポート。
 * Prisma の値 (`Prisma.PrismaClientKnownRequestError` 等) は re-export 禁止のため
 * (Prisma gateway 契約: `Prisma.JsonNull` の identity 比較が
 * runtime 間で壊れる)、runtime shape check で判定する。
 *
 * ## 用途
 * webhook / command から Refund child 等を idempotent に write する際、`upsert` の
 * SELECT+INSERT race (Prisma issue #20229) を回避するため、単一 `create` + `catch`
 * pattern を使うのが真の atomic。この helper が P2002 判定を集約する。
 *
 * ## driver が返すのは **index 名**（列名でも field 名でもない）
 *
 * 呼び出し側は **`Model.field`**（例: `Refund.stripeRefundId`）で書く。
 * 同名 field が複数モデルにあっても取り違えないため。**adapter-pg が返すのは
 * その unique を実現している index の名前**（`refunds_stripe_refund_id_key`）なので、
 * この関数が両者を橋渡しする。
 *
 * 実測（test DB, Prisma 7.10.0 + @prisma/adapter-pg）:
 *
 *   meta: {
 *     modelName: "Refund",
 *     driverAdapterError: {
 *       name: "DriverAdapterError",
 *       cause: {
 *         originalCode: "23505",
 *         originalMessage: 'duplicate key value violates unique constraint "refunds_stripe_refund_id_key"',
 *         kind: "UniqueConstraintViolation",
 *         constraint: { index: "refunds_stripe_refund_id_key" },
 *         table: "refunds"
 *       }
 *     }
 *   }
 *
 * **7.9.1 までは `constraint: { fields: ["stripe_refund_id"] }` だった。**
 * `@prisma/adapter-pg` 7.10.0 の 23505 マッピングが
 * `if (error.constraint) constraint = { index: error.constraint }` を先に見るように
 * なり、PostgreSQL は 23505 で必ず制約名を返すので `fields` 分岐へは到達しない
 * （`node_modules/@prisma/adapter-pg/dist/index.js` の 23505 case）。列名を見る旧実装は
 * **無言で常に false** になる。それを実 DB で捕まえたのが
 * `__tests__/integration/domain/payment/refund-duplicate-detection.test.ts`。
 *
 * false になった先は「P2002 を握り潰して idempotent に扱う」経路なので、握り潰しが
 * 止まって throw に変わり、Stripe の webhook 再送が無限リトライになる
 * （KGI: 返金が正しく一度だけ行われる）。
 *
 * `fields` 側の fallback は**足さない**。adapter-pg では到達しないので検査できず、
 * 検査できない分岐は「別種の error まで unique 違反として飲み込む」側にしか転ばない。
 * v6 (Rust engine) の `meta.target` を残さなかったのと同じ判断。
 *
 * ## index 名は schema.prisma が決める
 *
 * 既定は `<@@map したテーブル名>_<物理列名>_key`、`@id` なら `<テーブル名>_pkey`、
 * `@@unique(..., map: "...")` を書いていればその名前（このリポジトリの
 * soft-delete 用 partial unique はすべて明示名）。runtime からは schema を読めないので
 * 下の表が SSoT になる。**表と schema.prisma の一致は
 * `__tests__/unit/architecture/prisma-error-target-fields.test.ts` が機械強制する**
 * （呼び出し側リテラルが表に載っていることも同じ gate が見る）。
 *
 * @param error - catch した任意 error
 * @param targetField - 特定 field (`@unique` の対象) の制約違反のみ検出したい場合、
 *                     **`Model.field`**（Prisma field 名）。省略時は任意の unique 制約違反を true 判定。
 * @returns P2002 (かつ optional target field) の unique 制約違反なら true
 */
/**
 * `Model.field` → その一意性を実現している index 名。
 *
 * 未登録の `Model.field` で呼ぶと **false**（握り潰さない）。gate が呼び出し側の
 * リテラルを突き合わせるので、追加を忘れたまま出荷はできない。
 */
const UNIQUE_INDEX_BY_TARGET_FIELD: Readonly<Record<string, string>> = {
  "Coupon.code": "coupons_code_key",
  "Event.slug": "events_slug_active_key",
  "Inquiry.receiptNumber": "inquiries_receipt_number_key",
  "Location.name": "locations_name_active_key",
  "Location.slug": "locations_slug_active_key",
  "Page.slug": "pages_slug_key",
  "Post.slug": "posts_slug_active_key",
  "Refund.stripeRefundId": "refunds_stripe_refund_id_key",
  "StripeEvent.id": "stripe_events_pkey",
  "User.email": "users_email_key",
};

export function isPrismaUniqueConstraintError(
  error: unknown,
  targetField?: string,
): boolean {
  if (!isRecord(error)) return false;
  if (error["code"] !== "P2002") return false;
  if (targetField === undefined) return true;

  const expectedIndex = UNIQUE_INDEX_BY_TARGET_FIELD[targetField];
  if (expectedIndex === undefined) return false;

  const meta = error["meta"];
  if (!isRecord(meta)) return false;

  // meta.modelName があるとき Model 修飾と食い違えば false（取り違えを握り潰さない）。
  const model = targetField.slice(0, targetField.indexOf("."));
  const modelName = meta["modelName"];
  if (typeof modelName === "string" && modelName !== model) return false;

  const driverAdapterError = meta["driverAdapterError"];
  if (!isRecord(driverAdapterError)) return false;
  const cause = driverAdapterError["cause"];
  if (!isRecord(cause)) return false;
  if (cause["kind"] !== "UniqueConstraintViolation") return false;
  const constraint = cause["constraint"];
  if (!isRecord(constraint)) return false;
  return constraint["index"] === expectedIndex;
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
