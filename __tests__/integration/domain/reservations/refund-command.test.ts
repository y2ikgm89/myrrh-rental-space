/**
 * `refundReservationPaymentCommand` の実 DB 統合テスト (task #9 PR#3)。
 *
 * 検証対象 (unit mock 不能な interactive tx + advisory lock + Refund child table 集計):
 * 1. 全額返金で PAID → REFUNDED + Refund child 1 レコード書込
 * 2. 部分返金 2 回で PAID → PARTIALLY_REFUNDED → REFUNDED + Refund 2 レコード
 * 3. amount 未指定は残額全額を返金
 * 4. 残額超過の amount 指定は VALIDATION reject
 * 5. REFUNDED 済みで追加返金不可 (VALIDATION)
 * 6. UNPAID/PENDING/FAILED で返金不可 (VALIDATION)
 * 7. stripePaymentIntentId 未設定で返金不可 (VALIDATION)
 * 8. concurrent race (advisory lock 直列化 → over-refund 防止)
 * 9. AuditLog に actorType + cumulativeAmount + refundAmount + stripeRefundId 記録
 *
 * == 実行条件 ==
 * 実 Postgres を要求する (advisory lock + child table aggregate の直列化は mock 不能)。
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { deleteRefundsForTest } from "../../../helpers/refund-test-cleanup";
import { definite, nthCall } from "../../../support/definite";

// グローバル preload が DATABASE_URL をダミー値に固定するため、gateway を読む前に
// 実テスト DB へ向け直す (静的 import は gateway を引かないためこの代入は動的 import
// より先に実行される)。
// concurrent race test で 3 tx が interactive slot を並行取得するため connection_limit と
// pool_timeout を明示指定 (Prisma default 8-12 slots・pool_timeout 10s では pool 枯渇時に
// 「Unable to start a transaction in the given time」が発生する)。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  const url = new URL(TEST_DB_URL);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "20");
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "60");
  }
  process.env["DATABASE_URL"] = url.toString();
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// Stripe: 実 Stripe に呼ばず fake refund object を返す。idempotency key を record して
// key strategy (running cumulative) の検証にも使う。
const mockRefundsCreate = mock<
  (
    args: Record<string, unknown>,
    opts?: { idempotencyKey?: string },
  ) => Promise<{ id: string; status: string }>
>((_args, _opts) => Promise.resolve({ id: "", status: "succeeded" }));

mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: () => ({
    client: {
      refunds: { create: mockRefundsCreate },
    },
  }),
}));

// assertStripeCredentialsConfigured: Settings row 依存を回避し dummy credentials を返す。
mock.module("@/shared/domain/payment/availability", () => ({
  assertOnlinePaymentAvailable: () =>
    Promise.resolve({
      stripeSecretKey: "sk_test_dummy",
      stripeWebhookSecret: "whsec_dummy",
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeCurrency: "jpy",
      stripePaymentMethodTypes: ["card"],
    }),
  assertStripeCredentialsConfigured: () =>
    Promise.resolve({
      stripeSecretKey: "sk_test_dummy",
      stripeWebhookSecret: "whsec_dummy",
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeCurrency: "jpy",
      stripePaymentMethodTypes: ["card"],
    }),
}));

// AuditLog: hash-chain の書込が実 DB を汚染 (chain 状態 pollute) するため mock。
// mock は各呼出の input を record し、metadata / userId / newValue の検証に使う。
const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve());

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (input: Record<string, unknown>) =>
    mockCreateAuditLogRecord(input),
}));

// ---------------------------------------------------------------------------
// Dynamic imports (gateway 上書き後に読む)
// ---------------------------------------------------------------------------
type PrismaModule = typeof import("@/shared/db/prisma");
type PaymentCommandsModule =
  typeof import("@/shared/domain/reservations/payment-commands");
type PrismaEnumsModule = typeof import("@generated/prisma/enums");
type HelpersModule =
  typeof import("@/shared/lib/validations/enums/refund-attribution");

let prisma: PrismaModule["prisma"];
let refundReservationPaymentCommand: PaymentCommandsModule["refundReservationPaymentCommand"];
let PaymentStatus: PrismaEnumsModule["PaymentStatus"];
let REFUNDED_BY_TYPE: HelpersModule["REFUNDED_BY_TYPE"];

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------
type ReservationFixture = {
  reservationId: string;
  spaceId: string;
  customerId: string;
  locationId: string;
  cleanup: () => Promise<void>;
};

// sortOrder は Date.now()/1000 (秒単位、INT 範囲内) ベースで module load 時に unique 化する。
// 固定値だと同 test DB に残留した過去 fixture (前回 fail で cleanup 未実行) と
// unique constraint 衝突する。beforeAll でも残留を掃除する二重防御。
// Date.now() ms は INT 範囲 (max 2147483647) を超えるため秒単位で正規化。
let nextFixtureSortOrder = Math.floor(Date.now() / 1000);
/** 予約の税率。fixture はアプリと同じ向き（税抜 → round）で税額を導く。 */
const TAX_RATE_PERCENT = 10;

async function createPaidReservationFixture(
  totalPriceWithTax: number,
  paymentStatus: (typeof PaymentStatus)[keyof typeof PaymentStatus] = PaymentStatus.PAID,
): Promise<ReservationFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `refund-loc-${suffix}`,
      name: `Refund Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `refund-space-${suffix}`,
      name: `Refund Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
    },
    select: { id: true },
  });

  const customer = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `refund-${suffix}@example.com`,
      emailCanonical: `refund-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const startTime = new Date(`2027-04-01T09:00:00+09:00`);
  const endTime = new Date(`2027-04-01T11:00:00+09:00`);

  // 税額はアプリの書込経路と同じ向きで導く（**税抜から round**）。
  // `floor(税込 * 10 / 110)` で作ると `reservations_tax_amount_derivation_check`
  // （`tax_amount = round(total_price * tax_rate / 100)`）を満たさない行になる。
  // つまり fixture が**アプリの決して作れないデータ**を書いていた。
  const basePrice = Math.round(
    (totalPriceWithTax * 100) / (100 + TAX_RATE_PERCENT),
  );
  const taxAmount = Math.round((basePrice * TAX_RATE_PERCENT) / 100);
  if (basePrice + taxAmount !== totalPriceWithTax) {
    throw new Error(
      `税込 ${totalPriceWithTax} 円は税抜からの導出で再現できない（${basePrice} + ${taxAmount}）。fixture の金額を選び直す`,
    );
  }

  const reservation = await prisma.reservation.create({
    data: {
      customerId: customer.id,
      spaceId: space.id,
      startTime,
      endTime,
      status: "CONFIRMED",
      // `total_price` は税抜。本番 3 経路とも `with_tax = total + tax` で
      // 組み立てており、`reservations_total_price_breakdown_check` がその等式を固定している。
      totalPrice: basePrice,
      basePrice,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 0,
        totalBasePrice: 0,
        holidayFlags: {},
      },
      taxRateType: "STANDARD",
      taxRate: 10,
      taxAmount,
      totalPriceWithTax,
      paymentStatus,
      stripePaymentIntentId: `pi_test_${suffix}`,
    },
    select: { id: true },
  });

  return {
    reservationId: reservation.id,
    spaceId: space.id,
    customerId: customer.id,
    locationId: location.id,
    cleanup: async () => {
      await deleteRefundsForTest(prisma, {
        reservationId: reservation.id,
      });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describeMaybe("refundReservationPaymentCommand (integration)", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ refundReservationPaymentCommand } =
      await import("@/shared/domain/reservations/payment-commands"));
    ({ PaymentStatus } = await import("@generated/prisma/enums"));
    ({ REFUNDED_BY_TYPE } =
      await import("@/shared/lib/validations/enums/refund-attribution"));

    // 接続プール warm-up (cold start が並行クエリをずらして race を隠すのを防ぐ)。
    await prisma.$queryRaw`SELECT 1`;

    // 過去の fail 実行で cleanup 未達な残留 fixture を予備削除 (再実行耐性)。
    // FK 順: refunds → reservations → spaces → customers → locations。
    await deleteRefundsForTest(prisma, {
      reservation: {
        space: { location: { slug: { startsWith: "refund-loc-" } } },
      },
    });
    await prisma.reservation.deleteMany({
      where: { space: { location: { slug: { startsWith: "refund-loc-" } } } },
    });
    await prisma.space.deleteMany({
      where: { location: { slug: { startsWith: "refund-loc-" } } },
    });
    await prisma.customer.deleteMany({
      where: { email: { startsWith: "refund-" } },
    });
    await prisma.location.deleteMany({
      where: { slug: { startsWith: "refund-loc-" } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    mockRefundsCreate.mockReset();
    mockCreateAuditLogRecord.mockReset();
    // Stripe refund id は crypto.randomUUID() で unique にする（@unique(stripeRefundId) の衝突回避）
    mockRefundsCreate.mockImplementation((_args, _opts) => {
      return Promise.resolve({
        id: `re_test_${crypto.randomUUID()}`,
        status: "succeeded",
      });
    });
    // mockReset は factory (mock<>(() => Promise.resolve())) も消すため、
    // 明示的に AuditLog mock の Promise 返却を再設定する (`await createAuditLogRecord`
    // が undefined を await して非同期 chain が壊れないことを保証)。
    mockCreateAuditLogRecord.mockImplementation(() => Promise.resolve());
  });

  test("全額返金で PAID → REFUNDED + Refund child 1 レコード + AuditLog 記録", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      const result = await refundReservationPaymentCommand({
        reservationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        actorUserId: "admin-user-id",
      });

      expect(result.newPaymentStatus).toBe(PaymentStatus.REFUNDED);
      expect(result.refundAmount).toBe(5000);
      expect(result.cumulativeAmount).toBe(5000);

      const refunds = await prisma.refund.findMany({
        where: { reservationId },
      });
      expect(refunds).toHaveLength(1);
      const refund = definite(refunds[0], "refunds[0]");
      expect(refund.amount).toBe(5000);
      expect(refund.refundedByType).toBe(REFUNDED_BY_TYPE.ADMIN);
      expect(refund.reason).toBeNull();

      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
        select: { paymentStatus: true },
      });
      expect(reservation?.paymentStatus).toBe(PaymentStatus.REFUNDED);

      // AuditLog record
      expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
      const auditInput = nthCall(
        mockCreateAuditLogRecord,
        0,
        "mockCreateAuditLogRecord",
      )[0] as {
        userId: string;
        resource: string;
        resourceId: string;
        newValue: { paymentStatus: string; refundedAmount: number };
        metadata: {
          actorType: string;
          refundAmount: number;
          cumulativeAmount: number;
          stripeRefundId: string;
        };
      };
      expect(auditInput.userId).toBe("admin-user-id");
      expect(auditInput.resource).toBe("reservation");
      expect(auditInput.resourceId).toBe(reservationId);
      expect(auditInput.newValue.paymentStatus).toBe(PaymentStatus.REFUNDED);
      expect(auditInput.newValue.refundedAmount).toBe(5000);
      expect(auditInput.metadata.actorType).toBe(REFUNDED_BY_TYPE.ADMIN);
      expect(auditInput.metadata.refundAmount).toBe(5000);
      expect(auditInput.metadata.cumulativeAmount).toBe(5000);
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("konbini 等の非同期返金 (status=pending) は paymentStatus を書き換えず、Refund.status に暫定値を記録する", async () => {
    // 実 advisory lock + interactive tx 経由で「未確定の間は paymentStatus を
    // 変更しない」ことを実 DB で検証する (unit mock では tx/lock 自体をフェイクする
    // ため、他の書込経路との real race や append-only trigger の実挙動は確認できない)。
    mockRefundsCreate.mockImplementation((_args, _opts) => {
      return Promise.resolve({
        id: `re_test_pending_${crypto.randomUUID()}`,
        status: "pending",
      });
    });

    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      const result = await refundReservationPaymentCommand({
        reservationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        actorUserId: "admin-user-id",
      });

      expect(result.isSettled).toBe(false);
      // newPaymentStatus は「確定したら到達する目標」であり続ける (webhook 確定時に使う)。
      expect(result.newPaymentStatus).toBe(PaymentStatus.REFUNDED);

      const refunds = await prisma.refund.findMany({
        where: { reservationId },
      });
      expect(refunds).toHaveLength(1);
      expect(definite(refunds[0], "refunds[0]").status).toBe("pending");
      expect(definite(refunds[0], "refunds[0]").amount).toBe(5000);

      // 最も重要な不変条件: Stripe が未確定の間、paymentStatus は PAID のまま
      // (REFUNDED に false-positive で遷移していない)。
      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
        select: { paymentStatus: true },
      });
      expect(reservation?.paymentStatus).toBe(PaymentStatus.PAID);
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("部分返金 2 回で PAID → PARTIALLY_REFUNDED → REFUNDED + Refund 2 レコード", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      const r1 = await refundReservationPaymentCommand({
        reservationId,
        amount: 2000,
        reason: "顧客都合",
        actorType: REFUNDED_BY_TYPE.ADMIN,
      });
      expect(r1.newPaymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(r1.refundAmount).toBe(2000);
      expect(r1.cumulativeAmount).toBe(2000);

      const r2 = await refundReservationPaymentCommand({
        reservationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        // amount 未指定 → 残額 3000 を全額返金
      });
      expect(r2.newPaymentStatus).toBe(PaymentStatus.REFUNDED);
      expect(r2.refundAmount).toBe(3000);
      expect(r2.cumulativeAmount).toBe(5000);

      const refunds = await prisma.refund.findMany({
        where: { reservationId },
        orderBy: { createdAt: "asc" },
      });
      expect(refunds).toHaveLength(2);
      expect(definite(refunds[0], "refunds[0]").amount).toBe(2000);
      expect(definite(refunds[0], "refunds[0]").reason).toBe("顧客都合");
      expect(definite(refunds[1], "refunds[1]").amount).toBe(3000);

      // Stripe idempotency key: 累積後 total を key に含める (2000, 5000)
      expect(mockRefundsCreate).toHaveBeenCalledTimes(2);
      const opts1 = nthCall(mockRefundsCreate, 0, "mockRefundsCreate")[1] as {
        idempotencyKey?: string;
      };
      const opts2 = nthCall(mockRefundsCreate, 1, "mockRefundsCreate")[1] as {
        idempotencyKey?: string;
      };
      expect(opts1.idempotencyKey).toBe(
        `reservation-refund-${reservationId}-2000`,
      );
      expect(opts2.idempotencyKey).toBe(
        `reservation-refund-${reservationId}-5000`,
      );
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("残額を超える amount 指定は VALIDATION reject", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      // Bun 1.3.14 の bug 回避 (実 DB 統合テストで `expect(promise).rejects` が hang する)
      // 詳細: memory/feedback_bun-rejects-hang-and-npm-script-args
      let caught: unknown;
      try {
        await refundReservationPaymentCommand({
          reservationId,
          amount: 6000,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toMatchObject({ code: "VALIDATION" });
      expect(mockRefundsCreate).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("既に REFUNDED 済みは追加返金不可 (VALIDATION)", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      // 1st: 全額返金
      await refundReservationPaymentCommand({
        reservationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
      });
      // 2nd: すでに REFUNDED (Bun rejects hang 回避のため try/catch)
      let caught: unknown;
      try {
        await refundReservationPaymentCommand({
          reservationId,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toMatchObject({ code: "VALIDATION" });
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("UNPAID の予約は VALIDATION reject", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(
      5000,
      PaymentStatus.UNPAID,
    );
    try {
      // Bun rejects hang 回避 (try/catch)
      let caught: unknown;
      try {
        await refundReservationPaymentCommand({
          reservationId,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toMatchObject({ code: "VALIDATION" });
      expect(mockRefundsCreate).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  }, 30_000);

  // #20: stripePaymentIntentId が null の予約は VALIDATION reject（Stripe API 呼出前）。
  test("#20: stripePaymentIntentId が null の PAID 予約は VALIDATION reject (Stripe 呼出なし)", async () => {
    // stripePaymentIntentId: null で PAID な予約を直接 create する
    const suffix = crypto.randomUUID();
    const location = await prisma.location.create({
      data: {
        slug: `refund-nopi-loc-${suffix}`,
        name: `Refund NoPi Loc ${suffix}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/loc.jpg",
        sortOrder: nextFixtureSortOrder++,
      },
      select: { id: true },
    });
    const space = await prisma.space.create({
      data: {
        slug: `refund-nopi-space-${suffix}`,
        name: `Refund NoPi Space ${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        capacity: 10,
        hourlyPrice: 1000,
        mainImageUrl: "https://example.com/space.jpg",
        locationId: location.id,
      },
      select: { id: true },
    });
    const customer = await prisma.customer.create({
      data: {
        lastName: "田中",
        firstName: "一郎",
        email: `refund-nopi-${suffix}@example.com`,
        emailCanonical: `refund-nopi-${suffix}@example.com`,
      },
      select: { id: true },
    });
    const totalPriceWithTax = 3000;
    // helper と同じ向き（税抜から round）で導く。floor で税込から逆算すると
    // `reservations_tax_amount_derivation_check` を満たさない行になる。
    const basePrice = Math.round(
      (totalPriceWithTax * 100) / (100 + TAX_RATE_PERCENT),
    );
    const taxAmount = Math.round((basePrice * TAX_RATE_PERCENT) / 100);
    const reservation = await prisma.reservation.create({
      data: {
        customerId: customer.id,
        spaceId: space.id,
        startTime: new Date("2027-06-01T09:00:00+09:00"),
        endTime: new Date("2027-06-01T11:00:00+09:00"),
        status: "CONFIRMED",
        // `total_price` は税抜。本番 3 経路とも `with_tax = total + tax` で
        // 組み立てており、`reservations_total_price_breakdown_check` がその等式を固定している。
        totalPrice: basePrice,
        basePrice,
        rateBreakdownJson: {
          schemaVersion: 1,
          segments: [],
          totalHours: 0,
          totalBasePrice: 0,
          holidayFlags: {},
        },
        taxRateType: "STANDARD",
        taxRate: 10,
        taxAmount,
        totalPriceWithTax,
        paymentStatus: "PAID",
        stripePaymentIntentId: null, // 意図的に null
      },
      select: { id: true },
    });
    const reservationId = reservation.id;

    try {
      // Bun rejects hang 回避 (try/catch)
      let caught: unknown;
      try {
        await refundReservationPaymentCommand({
          reservationId,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toMatchObject({ code: "VALIDATION" });
      // stripePaymentIntentId チェックは Stripe API 呼出より前
      expect(mockRefundsCreate).not.toHaveBeenCalled();
    } finally {
      await prisma.reservation.deleteMany({ where: { id: reservationId } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    }
  }, 30_000);

  // UA-HORIZ-04: request が渡されたら AuditLog metadata に ip/userAgent が載る。
  // 渡されなければ (webhook / AUTO_ON_CANCEL の後方互換) キーが付かない。
  test("UA-HORIZ-04: request 指定時は AuditLog metadata に ip/userAgent が載る", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      await refundReservationPaymentCommand({
        reservationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        actorUserId: "admin-user-id",
        request: { ip: "203.0.113.42", userAgent: "test-admin-agent/1.0" },
      });

      expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
      const auditInput = nthCall(
        mockCreateAuditLogRecord,
        0,
        "mockCreateAuditLogRecord",
      )[0] as {
        metadata: Record<string, unknown>;
      };
      expect(auditInput.metadata).toMatchObject({
        ip: "203.0.113.42",
        userAgent: "test-admin-agent/1.0",
      });
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("UA-HORIZ-04: request 未指定なら AuditLog metadata に ip/userAgent キーが付かない", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      await refundReservationPaymentCommand({
        reservationId,
        actorType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
      });

      expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
      const auditInput = nthCall(
        mockCreateAuditLogRecord,
        0,
        "mockCreateAuditLogRecord",
      )[0] as {
        metadata: Record<string, unknown>;
      };
      expect(auditInput.metadata).not.toHaveProperty("ip");
      expect(auditInput.metadata).not.toHaveProperty("userAgent");
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("UA-HORIZ-04: request.ip=null / userAgent=null は metadata に載せない", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      await refundReservationPaymentCommand({
        reservationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        actorUserId: "admin-user-id",
        request: { ip: null, userAgent: null },
      });

      expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
      const auditInput = nthCall(
        mockCreateAuditLogRecord,
        0,
        "mockCreateAuditLogRecord",
      )[0] as {
        metadata: Record<string, unknown>;
      };
      expect(auditInput.metadata).not.toHaveProperty("ip");
      expect(auditInput.metadata).not.toHaveProperty("userAgent");
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("concurrent race: 3 並行 refund tx で advisory lock により over-refund 防止", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      // 各 refund は 3000 円要求。合計 9000 > 5000 = totalPriceWithTax。
      // refundReservationPaymentCommand は Phase A (advisory lock 内で cumulativeSoFar を
      // 読み残額検証) → Phase B (Stripe API 呼出、tx 外) → Phase C (advisory lock 再取得で
      // Phase A 時点の cumulativeSoFar と実際値を再検証) の 3 段階構成
      // (stripe-refund-orchestration.ts)。Phase A/C は別 tx で advisory lock は tx スコープ
      // のため、1 個目以外が reject される理由は実行タイミング依存になる:
      // - Phase A がほぼ直列に進めば 2/3 個目は Phase A の残額チェックで VALIDATION
      // - Phase A がほぼ同時に走れば 2/3 個目は Phase C の状態変更検知で CONFLICT
      // どちらの経路でも over-refund 自体は防止される（本テストの核心不変条件）。
      const results = await Promise.allSettled([
        refundReservationPaymentCommand({
          reservationId,
          amount: 3000,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        }),
        refundReservationPaymentCommand({
          reservationId,
          amount: 3000,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        }),
        refundReservationPaymentCommand({
          reservationId,
          amount: 3000,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);
      for (const r of rejected) {
        expect(r.reason).toMatchObject({
          code: expect.stringMatching(/^(VALIDATION|CONFLICT)$/),
        });
      }

      // Refund child table は 1 レコードのみ (advisory lock で serialize)
      const refunds = await prisma.refund.findMany({
        where: { reservationId },
      });
      expect(refunds).toHaveLength(1);
      expect(definite(refunds[0], "refunds[0]").amount).toBe(3000);

      // Stripe 呼出「回数」は固定できない。Phase B は advisory lock を保持する tx の
      // 外にあり lock は tx スコープのため、Phase A を通過した本数だけ Phase B に
      // 到達しうる (1〜3 回)。3 本が同時に Phase A を通れば 3 本とも Stripe を呼び、
      // 2/3 本目は Phase C の状態変更検知で CONFLICT になる — これは上のコメントが
      // 説明している正常経路であり、回数を 1 に固定するとこの経路で flaky に落ちる。
      //
      // Stripe 側の実際の不変条件は「二重返金が発生しないこと」= idempotency key の
      // 一致。key は `reservation-refund-<id>-<newCumulative>`
      // (payment-commands.ts の refundReservationPaymentCommand) で、Phase A を
      // 通過できるのは cumulativeSoFar=0 を読んだ tx のみ (3000 が書込済みなら
      // 残額 2000 < 要求 3000 で resolveRefundAmount が VALIDATION reject し
      // Stripe に到達しない)。よって到達した呼出の key は必ず `...-3000` で一致し、
      // Stripe 側の実返金は 1 件に収束する。
      expect(mockRefundsCreate).toHaveBeenCalled();
      const idempotencyKeys = mockRefundsCreate.mock.calls.map(
        (call) =>
          (call[1] as { idempotencyKey?: string } | undefined)?.idempotencyKey,
      );
      expect([...new Set(idempotencyKeys)]).toEqual([
        `reservation-refund-${reservationId}-3000`,
      ]);
    } finally {
      await cleanup();
    }
  }, 30_000);
});
