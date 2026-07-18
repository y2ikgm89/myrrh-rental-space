/**
 * anonymizeCustomerCommand の統合テスト (STATE-03、実 DB 必須)。
 *
 * 決済歴 (Receipt 発行済) のある Customer を anonymize しても Receipt.reservation
 * (`onDelete: Restrict`) が blocker にならず、Reservation / Receipt の customerId
 * 参照が保たれることを実 DB 上で検証する。
 *
 * ドキュメント上「決済歴のある顧客の削除は Receipt FK Restrict で常時失敗」だった
 * regression の再発防止 gate として設置。
 *
 * == 実行条件 ==
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 * `TEST_DATABASE_URL` 未設定時は describe.skip で silent skip。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ReservationStatus, TaxRateType } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule = typeof import("@/shared/domain/customers/commands");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let anonymizeCustomerCommand: CommandsModule["anonymizeCustomerCommand"];

const DEFAULT_RESERVATION_PRICING = {
  basePrice: 1000,
  totalPrice: 1000,
  rateBreakdownJson: {
    schemaVersion: 1,
    segments: [],
    totalHours: 0,
    totalBasePrice: 0,
    holidayFlags: {},
    legacy: true,
  },
  taxRateType: TaxRateType.standard,
  taxRate: 10,
  taxAmount: 100,
  totalPriceWithTax: 1100,
};

// sortOrder は Location `@@unique([sortOrder], where: { isActive: true })` を持つ。
// 並行テストや過去テストの残置と衝突しないよう、プロセスごとに randomized base offset を使う。
let nextFixtureLocationSortOrder =
  1_300_000_000 + Math.floor(Math.random() * 100_000_000);

type Fixture = {
  customerId: string;
  reservationId: string;
  receiptId: string;
  serialNo: string;
  originalEmail: string;
  cleanup: () => Promise<void>;
};

/** 決済歴 (Receipt 発行済) のある Customer を作成する。 */
async function createCustomerWithReceipt(): Promise<Fixture> {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  const location = await prisma.location.create({
    data: {
      slug: `anon-loc-${suffix}`,
      name: `Anon Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureLocationSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `anon-space-${suffix}`,
      name: `Anon Space ${suffix}`,
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

  const originalEmail = `anon-${suffix}@example.com`;
  const customer = await prisma.customer.create({
    data: {
      lastName: "テスト",
      firstName: "太郎",
      companyName: "テスト株式会社",
      phoneNumber: "090-1234-5678",
      email: originalEmail,
      emailCanonical: originalEmail,
    },
    select: { id: true },
  });

  const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
  const reservation = await prisma.reservation.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      startTime,
      endTime,
      status: ReservationStatus.CONFIRMED,
      ...DEFAULT_RESERVATION_PRICING,
    },
    select: { id: true },
  });

  const serialNo = `9998-${suffix.slice(0, 6).toUpperCase()}`;
  const receipt = await prisma.receipt.create({
    data: {
      serialNo,
      reservationId: reservation.id,
      recipientName: "テスト 太郎",
      subject: "スペース利用料として",
      amount: 1100,
      taxAmount: 100,
      taxRate: 10,
      issuerSnapshot: { snapshotAt: new Date().toISOString() },
    },
    select: { id: true, serialNo: true },
  });

  return {
    customerId: customer.id,
    reservationId: reservation.id,
    receiptId: receipt.id,
    serialNo: receipt.serialNo,
    originalEmail,
    cleanup: async () => {
      await prisma.receipt.deleteMany({ where: { id: receipt.id } });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

describeMaybe("anonymizeCustomerCommand — Receipt FK safety (STATE-03)", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ anonymizeCustomerCommand } =
      await import("@/shared/domain/customers/commands"));
    // pool warmup (cold start 対策)
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("Receipt 発行済の Customer を anonymize しても Receipt/Reservation は残り customerId で JOIN 可能", async () => {
    const fixture = await createCustomerWithReceipt();
    try {
      const result = await anonymizeCustomerCommand({
        customerId: fixture.customerId,
        reason: "customer-requested",
      });

      expect(result.customerId).toBe(fixture.customerId);
      expect(result.reason).toBe("customer-requested");
      expect(result.hadUserId).toBe(false);
      expect(result.anonymizedAt).toBeInstanceOf(Date);

      // Customer は残る (物理削除されていない)
      const customerAfter = await prisma.customer.findUnique({
        where: { id: fixture.customerId },
        select: {
          id: true,
          email: true,
          emailCanonical: true,
          lastName: true,
          firstName: true,
          companyName: true,
          phoneNumber: true,
          isActive: true,
          marketingOptIn: true,
          phoneContactOptIn: true,
          anonymizedAt: true,
          anonymizedReason: true,
          userId: true,
        },
      });
      expect(customerAfter).not.toBeNull();
      expect(customerAfter?.email).toBe(
        `deleted+${fixture.customerId}@anonymized.local`,
      );
      expect(customerAfter?.emailCanonical).toBe(
        `deleted+${fixture.customerId}@anonymized.local`,
      );
      expect(customerAfter?.lastName).toBe("削除済み");
      expect(customerAfter?.firstName).toBe("");
      expect(customerAfter?.companyName).toBeNull();
      expect(customerAfter?.phoneNumber).toBeNull();
      expect(customerAfter?.isActive).toBe(false);
      expect(customerAfter?.marketingOptIn).toBe(false);
      expect(customerAfter?.phoneContactOptIn).toBe(false);
      expect(customerAfter?.anonymizedAt).not.toBeNull();
      expect(customerAfter?.anonymizedReason).toBe("customer-requested");
      expect(customerAfter?.userId).toBeNull();

      // Reservation は残り customerId で結ばれたまま
      const reservationAfter = await prisma.reservation.findUnique({
        where: { id: fixture.reservationId },
        select: { id: true, customerId: true },
      });
      expect(reservationAfter?.customerId).toBe(fixture.customerId);

      // Receipt は残り reservationId で結ばれたまま
      const receiptAfter = await prisma.receipt.findUnique({
        where: { id: fixture.receiptId },
        select: { id: true, reservationId: true, serialNo: true },
      });
      expect(receiptAfter?.reservationId).toBe(fixture.reservationId);
      expect(receiptAfter?.serialNo).toBe(fixture.serialNo);

      // JOIN で PII に到達しても placeholder になっていることを確認
      const receiptWithCustomer = await prisma.receipt.findUnique({
        where: { id: fixture.receiptId },
        select: {
          reservation: {
            select: {
              customer: {
                select: { email: true, lastName: true, firstName: true },
              },
            },
          },
        },
      });
      expect(receiptWithCustomer?.reservation?.customer.email).toBe(
        `deleted+${fixture.customerId}@anonymized.local`,
      );
      expect(receiptWithCustomer?.reservation?.customer.lastName).toBe(
        "削除済み",
      );
    } finally {
      await fixture.cleanup();
    }
  }, 15_000);

  test("同じ Customer を 2 回 anonymize すると 2 回目は CONFLICT (冪等性)", async () => {
    const fixture = await createCustomerWithReceipt();
    try {
      // 1 回目 = 成功
      await anonymizeCustomerCommand({
        customerId: fixture.customerId,
        reason: "customer-requested",
      });

      // Prisma pool drain (feedback_fire-and-forget-pool-drain-in-tests と同型:
      // interactive tx を連続で発火すると 2 回目が maxWait timeout する)。
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 2 回目 = CONFLICT (bun 1.3.14 の rejects ハング回避のため try/catch を使用)
      let thrown: unknown = null;
      try {
        await anonymizeCustomerCommand({
          customerId: fixture.customerId,
          reason: "admin-purge",
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        code: "CONFLICT",
        message: "この顧客は既に匿名化済みです",
      });
    } finally {
      await fixture.cleanup();
    }
  }, 15_000);

  test("存在しない customerId は NOT_FOUND", async () => {
    const fakeCustomerId = crypto.randomUUID();
    let thrown: unknown = null;
    try {
      await anonymizeCustomerCommand({
        customerId: fakeCustomerId,
        reason: "customer-requested",
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: "NOT_FOUND",
      message: "顧客が見つかりません",
    });
  });
});
