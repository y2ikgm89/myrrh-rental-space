/**
 * `isPrismaUniqueConstraintError` の回帰テスト。
 *
 * PR #1146 Codex P2 追加対応 (Prisma upsert issue #20229) で導入した helper。
 * Refund child 等の idempotent write で `create` の P2002 を silent success 化する
 * 判定の SSoT。誤検出があると本来 throw すべき別 error まで飲み込む silent bug に
 * つながるため、shape と targetField 判定を機械強制する。
 */
import { describe, test, expect } from "bun:test";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";

describe("isPrismaUniqueConstraintError", () => {
  test("code=P2002 + target field 一致 (array target) で true", () => {
    const error = {
      code: "P2002",
      meta: { target: ["stripeRefundId"] },
    };
    expect(isPrismaUniqueConstraintError(error, "stripeRefundId")).toBe(true);
  });

  test("code=P2002 + target field 一致 (string target — SQL Server 系) で true", () => {
    const error = {
      code: "P2002",
      meta: { target: "Refund_stripeRefundId_key" },
    };
    expect(isPrismaUniqueConstraintError(error, "stripeRefundId")).toBe(true);
  });

  test("code=P2002 + target field 不一致で false (別 unique 制約を silent skip しない)", () => {
    const error = {
      code: "P2002",
      meta: { target: ["email"] },
    };
    expect(isPrismaUniqueConstraintError(error, "stripeRefundId")).toBe(false);
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
    expect(isPrismaUniqueConstraintError(error, "stripeRefundId")).toBe(false);
  });

  test("code=P2002 だが meta.target 欠損 + targetField 指定で false", () => {
    const error = { code: "P2002", meta: {} };
    expect(isPrismaUniqueConstraintError(error, "stripeRefundId")).toBe(false);
  });

  test("別 code (P2003 foreign key violation 等) で false", () => {
    const error = { code: "P2003", meta: { target: ["stripeRefundId"] } };
    expect(isPrismaUniqueConstraintError(error, "stripeRefundId")).toBe(false);
  });

  test("plain Error (Prisma error でない) で false", () => {
    const error = new Error("random failure");
    expect(isPrismaUniqueConstraintError(error, "stripeRefundId")).toBe(false);
    expect(isPrismaUniqueConstraintError(error)).toBe(false);
  });

  test("null / undefined で false (silent no-op)", () => {
    expect(isPrismaUniqueConstraintError(null, "stripeRefundId")).toBe(false);
    expect(isPrismaUniqueConstraintError(undefined, "stripeRefundId")).toBe(
      false,
    );
    expect(isPrismaUniqueConstraintError(null)).toBe(false);
  });

  test("primitive (string / number / boolean) で false", () => {
    expect(isPrismaUniqueConstraintError("P2002")).toBe(false);
    expect(isPrismaUniqueConstraintError(42)).toBe(false);
    expect(isPrismaUniqueConstraintError(true)).toBe(false);
  });

  test("実 Prisma error 形状 (postgres, array target) で正しく判定", () => {
    // 実際の Prisma P2002 error の shape (PostgreSQL の場合、
    // meta.target は @unique の field 名の array)。
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
    expect(isPrismaUniqueConstraintError(error, "stripeRefundId")).toBe(true);
  });

  test("Prisma 7 + adapter-pg 形状 (driverAdapterError.cause.constraint.fields) で正しく判定", () => {
    // Prisma 7 (`@prisma/adapter-pg`) は P2002 の meta shape が旧 rust engine と
    // 異なり、field 名は `meta.driverAdapterError.cause.constraint.fields` に
    // 埋め込まれる。旧 shape の `meta.target` は付与されないため、helper が
    // 新旧両方の shape を正しく判定できることを機械強制する。
    // これが壊れると STRIPE-DEDUP-A chokepoint / Refund idempotency が全 500 化する
    // silent bug になる (E2E `e2e/public/stripe-webhook-dedup-replay.spec.ts` の
    // replay 検証はこの判定を貫通する回帰 gate)。
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
    expect(isPrismaUniqueConstraintError(error, "id")).toBe(true);
    // targetField 省略時も true
    expect(isPrismaUniqueConstraintError(error)).toBe(true);
    // 別 field 指定なら false (silent skip 防止)
    expect(isPrismaUniqueConstraintError(error, "stripeRefundId")).toBe(false);
  });

  test("adapter-pg の fields は物理列名。field 名で呼んでも一致する", () => {
    // **この fixture は実測値**（test DB, Prisma 7.8.0 + @prisma/adapter-pg）:
    //   Unique constraint failed on the fields: (`stripe_refund_id`)
    //
    // かつてここは `fields: ["stripeRefundId"]` と書いてあった。物理列名を
    // snake_case へ寄せた 20260804110000〜20260804150000 で本番経路が壊れたのに、
    // **この fixture が旧名を焼いていたためテストは緑のままだった**。
    // 「テストが通る」と「壊れていない」が乖離した実例なので、fixture は
    // 実測値以外を書かない。
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

    // 呼び出し側はアプリの語彙（Prisma field 名）のまま書ける
    expect(isPrismaUniqueConstraintError(error, "stripeRefundId")).toBe(true);
    // 別 field は取り違えない
    expect(isPrismaUniqueConstraintError(error, "reservationId")).toBe(false);
    // 単語 1 つの field は物理名と同形なのでそのまま一致する
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
        "slug",
      ),
    ).toBe(true);
  });

  test("Prisma 7 + adapter-pg 形状で kind が UniqueConstraintViolation でない場合は false", () => {
    // 同じ driverAdapterError shape でも kind が異なる (foreign key, not-null 等)
    // 場合は unique constraint 判定にしない。
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
    expect(isPrismaUniqueConstraintError(error, "userId")).toBe(false);
  });
});
