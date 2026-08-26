/**
 * `isPrismaUniqueConstraintError` の回帰テスト。
 *
 * PR #1146 Codex P2 追加対応 (Prisma upsert issue #20229) で導入した helper。
 * Refund child 等の idempotent write で `create` の P2002 を silent success 化する
 * 判定の SSoT。誤検出があると本来 throw すべき別 error まで飲み込む silent bug に
 * つながるため、shape と targetField 判定を機械強制する。
 *
 * 呼び出し側の契約は **`Model.field`**（例: `Refund.stripeRefundId`）。
 * driver が返すのは **index 名**なので、helper が表で橋渡しする。
 * 形状の SSoT は `__tests__/helpers/prisma-errors.ts`。
 */
import { describe, test, expect } from "bun:test";
import { uniqueConstraintError } from "../../helpers/prisma-errors";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";

describe("isPrismaUniqueConstraintError", () => {
  test("code=P2002 で targetField 省略時は任意の unique 制約違反で true", () => {
    expect(
      isPrismaUniqueConstraintError(uniqueConstraintError("users_email_key")),
    ).toBe(true);
  });

  test("v6 (Rust engine) の meta.target 形状は判定しない", () => {
    // Prisma 7 + adapter-pg では `meta.target` は出ない。互換 fallback を足し戻すと、
    // `target` を持つ別種の error まで unique 違反として飲み込む側にしか転ばないため、
    // false を固定する。
    expect(
      isPrismaUniqueConstraintError(
        { code: "P2002", meta: { target: ["stripeRefundId"] } },
        "Refund.stripeRefundId",
      ),
    ).toBe(false);
    expect(
      isPrismaUniqueConstraintError(
        { code: "P2002", meta: { target: "Refund_stripeRefundId_key" } },
        "Refund.stripeRefundId",
      ),
    ).toBe(false);
  });

  test("7.9.1 までの constraint.fields（物理列名）形状は判定しない", () => {
    // adapter-pg 7.10.0 の 23505 マッピングは `error.constraint` を先に見るので、
    // PostgreSQL 相手では `fields` 分岐へ到達しない。検査できない分岐を残さない。
    expect(
      isPrismaUniqueConstraintError(
        {
          code: "P2002",
          meta: {
            modelName: "Refund",
            driverAdapterError: {
              name: "DriverAdapterError",
              cause: {
                originalCode: "23505",
                kind: "UniqueConstraintViolation",
                constraint: { fields: ["stripe_refund_id"] },
              },
            },
          },
        },
        "Refund.stripeRefundId",
      ),
    ).toBe(false);
  });

  test("code=P2002 だが meta 欠損 + targetField 指定で false", () => {
    const error = { code: "P2002" };
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      false,
    );
  });

  test("code=P2002 だが driverAdapterError 欠損 + targetField 指定で false", () => {
    const error = { code: "P2002", meta: {} };
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      false,
    );
  });

  test("別 code (P2003 foreign key violation 等) で false", () => {
    const error = {
      ...uniqueConstraintError("refunds_stripe_refund_id_key", "Refund"),
      code: "P2003",
    };
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      false,
    );
  });

  test("plain Error (Prisma error でない) で false", () => {
    const error = new Error("random failure");
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      false,
    );
    expect(isPrismaUniqueConstraintError(error)).toBe(false);
  });

  test("null / undefined で false (silent no-op)", () => {
    expect(isPrismaUniqueConstraintError(null, "Refund.stripeRefundId")).toBe(
      false,
    );
    expect(
      isPrismaUniqueConstraintError(undefined, "Refund.stripeRefundId"),
    ).toBe(false);
    expect(isPrismaUniqueConstraintError(null)).toBe(false);
  });

  test("primitive (string / number / boolean) で false", () => {
    expect(isPrismaUniqueConstraintError("P2002")).toBe(false);
    expect(isPrismaUniqueConstraintError(42)).toBe(false);
    expect(isPrismaUniqueConstraintError(true)).toBe(false);
  });

  test("表に無い Model.field は false（未登録を握り潰さない）", () => {
    // 呼び出し側が表への追加を忘れたまま出荷できないよう、既定は「検出しない」。
    // 呼び出しリテラルが表に載っていることは
    // `__tests__/unit/architecture/prisma-error-target-fields.test.ts` が突き合わせる。
    expect(
      isPrismaUniqueConstraintError(
        uniqueConstraintError("refunds_stripe_refund_id_key", "Refund"),
        "Refund.reservationId",
      ),
    ).toBe(false);
  });

  test("Model 修飾が meta.modelName と食い違うと false", () => {
    expect(
      isPrismaUniqueConstraintError(
        uniqueConstraintError("coupons_code_key", "Refund"),
        "Coupon.code",
      ),
    ).toBe(false);
  });

  test("主キー違反 (…_pkey) も index 名で判定できる", () => {
    // `StripeEvent.id` は `@id`。webhook dedup の chokepoint がこの形に依存する。
    const error = uniqueConstraintError("stripe_events_pkey", "StripeEvent");
    expect(isPrismaUniqueConstraintError(error, "StripeEvent.id")).toBe(true);
    expect(isPrismaUniqueConstraintError(error)).toBe(true);
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      false,
    );
  });

  test("soft-delete 用の partial unique は明示 map 名で判定する", () => {
    // `@@unique([slug], map: "locations_slug_active_key", where: { isActive: true })`。
    // 既定名 (`locations_slug_key`) を当てにすると常に false になる。
    expect(
      isPrismaUniqueConstraintError(
        uniqueConstraintError("locations_slug_active_key", "Location"),
        "Location.slug",
      ),
    ).toBe(true);
    // 同じモデルの別 unique を取り違えない。
    expect(
      isPrismaUniqueConstraintError(
        uniqueConstraintError("locations_name_active_key", "Location"),
        "Location.slug",
      ),
    ).toBe(false);
  });

  test("Prisma 7.10 + adapter-pg 形状 (constraint.index) で正しく判定", () => {
    const error = uniqueConstraintError(
      "refunds_stripe_refund_id_key",
      "Refund",
    );
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      true,
    );
    expect(isPrismaUniqueConstraintError(error, "Coupon.code")).toBe(false);
  });

  test("kind が UniqueConstraintViolation でない場合は false", () => {
    const error = {
      code: "P2002",
      meta: {
        modelName: "User",
        driverAdapterError: {
          cause: {
            kind: "ForeignKeyViolation",
            constraint: { index: "users_email_key" },
          },
        },
      },
    };
    expect(isPrismaUniqueConstraintError(error, "User.email")).toBe(false);
  });
});
