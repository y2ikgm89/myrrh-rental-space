/**
 * `isPrismaUniqueConstraintError` の回帰テスト。
 *
 * PR #1146 Codex P2 追加対応 (Prisma upsert issue #20229) で導入した helper。
 * Refund child 等の idempotent write で `create` の P2002 を silent success 化する
 * 判定の SSoT。誤検出があると本来 throw すべき別 error まで飲み込む silent bug に
 * つながるため、shape と targetField 判定を機械強制する。
 *
 * 呼び出し側の契約は **`Model.field`**（例: `Refund.stripeRefundId`）。
 */
import { describe, test, expect } from "bun:test";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";

describe("isPrismaUniqueConstraintError", () => {
  test("code=P2002 + target field 一致 (array target) で true", () => {
    const error = {
      code: "P2002",
      meta: { target: ["stripeRefundId"] },
    };
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      true,
    );
  });

  test("code=P2002 + target field 一致 (string target — SQL Server 系) で true", () => {
    const error = {
      code: "P2002",
      meta: { target: "Refund_stripeRefundId_key" },
    };
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      true,
    );
  });

  test("code=P2002 + target field 不一致で false (別 unique 制約を silent skip しない)", () => {
    const error = {
      code: "P2002",
      meta: { target: ["email"] },
    };
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      false,
    );
  });

  test("code=P2002 で targetField 省略時は任意の unique 制約違反で true", () => {
    const error = {
      code: "P2002",
      meta: { target: ["email"] },
    };
    expect(isPrismaUniqueConstraintError(error)).toBe(true);
  });

  test("code=P2002 だが meta 欠損 + targetField 指定で false", () => {
    const error = { code: "P2002" };
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      false,
    );
  });

  test("code=P2002 だが meta.target 欠損 + targetField 指定で false", () => {
    const error = { code: "P2002", meta: {} };
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      false,
    );
  });

  test("別 code (P2003 foreign key violation 等) で false", () => {
    const error = { code: "P2003", meta: { target: ["stripeRefundId"] } };
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

  test("実 Prisma error 形状 (postgres, array target) で正しく判定", () => {
    const error = {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      clientVersion: "7.0.0",
      meta: {
        modelName: "Refund",
        target: ["stripeRefundId"],
      },
      message: "Unique constraint failed on the fields: (`stripeRefundId`)",
    };
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      true,
    );
  });

  test("Model 修飾が meta.modelName と食い違うと false", () => {
    const error = {
      code: "P2002",
      meta: {
        modelName: "Refund",
        target: ["stripeRefundId"],
      },
    };
    expect(isPrismaUniqueConstraintError(error, "Coupon.stripeRefundId")).toBe(
      false,
    );
  });

  test("Prisma 7 + adapter-pg 形状 (driverAdapterError.cause.constraint.fields) で正しく判定", () => {
    const error = {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      clientVersion: "7.0.0",
      meta: {
        modelName: "StripeEvent",
        driverAdapterError: {
          name: "DriverAdapterError",
          cause: {
            originalCode: "23505",
            originalMessage:
              'duplicate key value violates unique constraint "stripe_events_pkey"',
            kind: "UniqueConstraintViolation",
            constraint: { fields: ["id"] },
          },
        },
      },
    };
    expect(isPrismaUniqueConstraintError(error, "StripeEvent.id")).toBe(true);
    expect(isPrismaUniqueConstraintError(error)).toBe(true);
    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      false,
    );
  });

  test("adapter-pg の fields は物理列名。Model.field で呼んでも一致する", () => {
    // **この fixture は実測値**（test DB, Prisma 7.8.0 + @prisma/adapter-pg）:
    //   Unique constraint failed on the fields: (`stripe_refund_id`)
    const error = {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      clientVersion: "7.8.0",
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
    };

    expect(isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")).toBe(
      true,
    );
    expect(isPrismaUniqueConstraintError(error, "Refund.reservationId")).toBe(
      false,
    );
    expect(
      isPrismaUniqueConstraintError(
        {
          code: "P2002",
          meta: {
            driverAdapterError: {
              cause: {
                kind: "UniqueConstraintViolation",
                constraint: { fields: ["slug"] },
              },
            },
          },
        },
        "Location.slug",
      ),
    ).toBe(true);
  });

  test("Prisma 7 + adapter-pg 形状で kind が UniqueConstraintViolation でない場合は false", () => {
    const error = {
      code: "P2002",
      meta: {
        driverAdapterError: {
          cause: {
            kind: "ForeignKeyViolation",
            constraint: { fields: ["userId"] },
          },
        },
      },
    };
    expect(isPrismaUniqueConstraintError(error, "User.id")).toBe(false);
  });
});
