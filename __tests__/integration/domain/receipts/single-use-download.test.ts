/**
 * Receipt.usedAt single-use gate の統合テスト (RECEIPT-USEDAT-P1)。
 *
 * `claimReceiptForSingleUseTokenDownload` (token 経路) が実 Postgres 上で:
 * - 初回 DL 成功時に `usedAt` を刻印し PDF Buffer を返す。
 * - 既に消費済みなら "already_used" を返し、`usedAt` は再刻印しない。
 * - PDF render 中に throw すれば tx が roll back し、`usedAt` は NULL のまま
 *   (次回リトライで正常 DL 可能)。
 * - 並行 DL 要求は advisory lock で serialize され、成功するのは 1 tx のみ。
 *
 * PDF renderer は `mock.module` で軽量スタブに差し替える (@react-pdf/renderer の
 * 実描画は Bun / 実 fonts に依存し integration 対象外)。DB の advisory lock と
 * `usedAt` 列の挙動が実 Postgres で担保されることを検証する。
 *
 * == 実行条件 ==
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 * `TEST_DATABASE_URL` 未設定時は describe.skip で silent skip。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { ReservationStatus, TaxRateType } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type DownloadModule = typeof import("@/shared/domain/receipts/download");

let prisma: PrismaModule["prisma"];
let claimReceiptForSingleUseTokenDownload: DownloadModule["claimReceiptForSingleUseTokenDownload"];

// PDF renderer は軽量スタブに差し替え (実 render は integration 対象外)。
// テストごとに throwOnce フラグで render 失敗をシミュレートする。
const rendererState = { shouldThrow: false };
mock.module("@/shared/pdf/render-receipt-pdf", () => ({
  renderReceiptPdf: async () => {
    if (rendererState.shouldThrow) {
      rendererState.shouldThrow = false;
      throw new Error("mock render failure");
    }
    return Buffer.from("stub-pdf-content", "utf8");
  },
}));

const DEFAULT_RESERVATION_PRICING = {
  basePrice: 1000,
  totalPrice: 1000,
  rateBreakdownJson: {
    schemaVersion: 1,
    segments: [],
    totalHours: 0,
    totalBasePrice: 0,
    holidayFlags: {},
  },
  taxRateType: TaxRateType.standard,
  taxRate: 10,
  taxAmount: 100,
  totalPriceWithTax: 1100,
};

let nextFixtureLocationSortOrder = 1_200_000_000;

type Fixture = {
  receiptId: string;
  serialNo: string;
  cleanup: () => Promise<void>;
};

async function createReceiptFixture(): Promise<Fixture> {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  const location = await prisma.location.create({
    data: {
      slug: `receipt-loc-${suffix}`,
      name: `Receipt Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureLocationSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `receipt-space-${suffix}`,
      name: `Receipt Space ${suffix}`,
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
      email: `receipt-${suffix}@example.com`,
      emailCanonical: `receipt-${suffix}@example.com`,
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

  // 領収書連番は年替わりで衝突するため suffix 由来のユニーク値を採用。
  const serialNo = `9999-${suffix.slice(0, 6).toUpperCase()}`;
  const receipt = await prisma.receipt.create({
    data: {
      serialNo,
      reservationId: reservation.id,
      recipientName: "山田 太郎",
      subject: "スペース利用料として",
      amount: 1100,
      taxAmount: 100,
      taxRate: 10,
      issuerSnapshot: { snapshotAt: new Date().toISOString() },
    },
    select: { id: true, serialNo: true },
  });

  return {
    receiptId: receipt.id,
    serialNo: receipt.serialNo,
    cleanup: async () => {
      await prisma.receipt.deleteMany({ where: { id: receipt.id } });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

const RENDER_INPUT_STUB = {
  serialNo: "stub",
  issuedAt: new Date(),
  recipientName: "山田 太郎",
  subject: "スペース利用料として",
  amount: 1100,
  taxAmount: 100,
  taxRate: 10,
  issuerSnapshot: {},
};

describeMaybe("claimReceiptForSingleUseTokenDownload — single-use gate", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ claimReceiptForSingleUseTokenDownload } =
      await import("@/shared/domain/receipts/download"));
    // pool warmup (cold start が並行 tx を偶発的に直列化するのを防ぐ)
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("初回 DL は success を返し usedAt を刻印する", async () => {
    const { receiptId, cleanup } = await createReceiptFixture();
    try {
      rendererState.shouldThrow = false;
      const result = await claimReceiptForSingleUseTokenDownload(
        receiptId,
        RENDER_INPUT_STUB,
      );
      expect(result.status).toBe("success");

      const row = await prisma.receipt.findUnique({
        where: { id: receiptId },
        select: { usedAt: true },
      });
      expect(row?.usedAt).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("2 回目 DL は already_used を返し usedAt を再刻印しない", async () => {
    const { receiptId, cleanup } = await createReceiptFixture();
    try {
      const first = await claimReceiptForSingleUseTokenDownload(
        receiptId,
        RENDER_INPUT_STUB,
      );
      expect(first.status).toBe("success");

      const stampedAt = (
        await prisma.receipt.findUnique({
          where: { id: receiptId },
          select: { usedAt: true },
        })
      )?.usedAt;
      expect(stampedAt).not.toBeNull();

      // 少し時間を空けて 2 回目 (刻印時刻が変わらないことを確認するため)
      await new Promise((resolve) => setTimeout(resolve, 20));

      const second = await claimReceiptForSingleUseTokenDownload(
        receiptId,
        RENDER_INPUT_STUB,
      );
      expect(second.status).toBe("already_used");

      const afterSecond = (
        await prisma.receipt.findUnique({
          where: { id: receiptId },
          select: { usedAt: true },
        })
      )?.usedAt;
      expect(afterSecond?.getTime()).toBe(stampedAt?.getTime());
    } finally {
      await cleanup();
    }
  });

  test("PDF render 失敗時は tx が roll back し usedAt は NULL のままリトライで成功する", async () => {
    const { receiptId, cleanup } = await createReceiptFixture();
    try {
      rendererState.shouldThrow = true;

      let thrown: unknown = null;
      try {
        await claimReceiptForSingleUseTokenDownload(
          receiptId,
          RENDER_INPUT_STUB,
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);

      // roll back で usedAt は NULL のまま
      const afterFail = await prisma.receipt.findUnique({
        where: { id: receiptId },
        select: { usedAt: true },
      });
      expect(afterFail?.usedAt).toBeNull();

      // リトライは成功して刻印される
      rendererState.shouldThrow = false;
      const retry = await claimReceiptForSingleUseTokenDownload(
        receiptId,
        RENDER_INPUT_STUB,
      );
      expect(retry.status).toBe("success");
      const afterRetry = await prisma.receipt.findUnique({
        where: { id: receiptId },
        select: { usedAt: true },
      });
      expect(afterRetry?.usedAt).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("並行 DL 要求は advisory lock で serialize され成功するのは 1 tx のみ", async () => {
    const { receiptId, cleanup } = await createReceiptFixture();
    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          claimReceiptForSingleUseTokenDownload(receiptId, RENDER_INPUT_STUB),
        ),
      );
      const successCount = results.filter((r) => r.status === "success").length;
      const alreadyUsedCount = results.filter(
        (r) => r.status === "already_used",
      ).length;
      expect(successCount).toBe(1);
      expect(alreadyUsedCount).toBe(4);
    } finally {
      await cleanup();
    }
  }, 30_000);
});
