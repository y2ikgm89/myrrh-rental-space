/**
 * Receipt issue-time AuditLog coverage 統合テスト (OBS-02、fix/receipt-audit-log-coverage)。
 *
 * `issueReceiptForReservation` / `issueReceiptForEventRegistration` が新規発行時に
 * AuditLog CREATE を append し、`metadata.source` に呼出側 discriminator
 * ("stripe-webhook" / "backfill-cron" 等) を載せることを実 Postgres 上で検証する。
 *
 * 検証ポイント:
 * - 新規発行時: AuditLog CREATE が 1 件 append され、resourceId=receipt.id、
 *   metadata.source が期待値、newValue に serialNo/reservationId(or eventRegistrationId) が入る
 * - idempotent early-return 時: 追加 AuditLog は発火しない (既存 receipt は既に audit 済み)
 * - hash chain 順序不変: 発行前の max(sequence) + 1 で append される
 *
 * AuditLog 書込は fire-and-forget のため、`issueReceipt*` 返却後にすぐ auditLog table を
 * SELECT すると race で見えないことがある。この test では小さな polling helper で
 * commit 完了を最大 3s まで待つ。実 Postgres の pg_advisory_xact_lock (chain) が
 * serialize してくれるため wait 中に他 test の AuditLog が混入する心配はない
 * (SERIAL_DB_TESTS で serial 実行)。
 *
 * == 実行条件 ==
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 * TEST_DATABASE_URL 未設定時は describe.skip で silent skip。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { ensureCommerceSettings } from "../../../support/commerce-settings";
import {
  EventScheduleMode,
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
  ReservationStatus,
  TaxRateType,
} from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type IssueModule = typeof import("@/shared/domain/receipts/issue");

let prisma: PrismaModule["prisma"];
let issueReceiptForReservation: IssueModule["issueReceiptForReservation"];
let issueReceiptForEventRegistration: IssueModule["issueReceiptForEventRegistration"];
let testCategoryId: string;

let nextFixtureSort = 1_300_000_000;

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
  taxRateType: TaxRateType.STANDARD,
  taxRate: 10,
  taxAmount: 100,
  totalPriceWithTax: 1100,
};

type ReservationFixture = {
  reservationId: string;
  cleanup: () => Promise<void>;
};

async function createReservationFixture(): Promise<ReservationFixture> {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  const location = await prisma.location.create({
    data: {
      slug: `rec-audit-loc-${suffix}`,
      name: `Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureSort++,
      // Location の @@unique([sortOrder], where: { isActive: true }) を回避するため
      // fixture 用 Location は isActive=false にしておく (公開ページには出ないので
      // テストロジックに影響しない)。
      isActive: false,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `rec-audit-space-${suffix}`,
      name: `Space ${suffix}`,
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
      email: `rec-audit-${suffix}@example.com`,
      emailCanonical: `rec-audit-${suffix}@example.com`,
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
      paymentStatus: PaymentStatus.PAID,
      ...DEFAULT_RESERVATION_PRICING,
    },
    select: { id: true },
  });

  return {
    reservationId: reservation.id,
    cleanup: async () => {
      await prisma.receipt.deleteMany({
        where: { reservationId: reservation.id },
      });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

type EventFixture = {
  registrationId: string;
  cleanup: () => Promise<void>;
};

async function createEventRegistrationFixture(): Promise<EventFixture> {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const slotStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

  // SINGLE_OCCURRENCE events は DB constraint trigger で commit 時に「exactly one
  // EventTimeSlot」を要求するため、event / slot / ticket / registration を単一 tx で
  // 作成する (別々の create だと event commit 時にゼロ slot で fail する)。
  const { registrationId, eventId, slotId, ticketId } =
    await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          slug: `rec-audit-event-${suffix}`,
          title: `Event ${suffix}`,
          descriptionJson: { type: "doc" },
          descriptionHtml: "<p>test</p>",
          descriptionPlainText: "test",
          status: EventStatus.PUBLISHED,
          thumbnailUrl: "https://example.com/event.jpg",
          scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
          categoryId: testCategoryId,
        },
        select: { id: true },
      });
      const slot = await tx.eventTimeSlot.create({
        data: {
          eventId: event.id,
          startAt: slotStart,
          endAt: slotEnd,
          capacity: 10,
        },
        select: { id: true },
      });
      const ticket = await tx.eventTicket.create({
        data: {
          eventId: event.id,
          name: `Ticket ${suffix}`,
          price: 3000,
          capacity: 10,
          sortOrder: nextFixtureSort++,
        },
        select: { id: true },
      });
      const registration = await tx.eventRegistration.create({
        data: {
          eventId: event.id,
          slotId: slot.id,
          ticketId: ticket.id,
          name: `Name ${suffix}`,
          email: `event-${suffix}@example.com`,
          quantity: 1,
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
          paidAmount: 3000,
        },
        select: { id: true },
      });
      return {
        registrationId: registration.id,
        eventId: event.id,
        slotId: slot.id,
        ticketId: ticket.id,
      };
    });

  return {
    registrationId,
    cleanup: async () => {
      await prisma.receipt.deleteMany({
        where: { eventRegistrationId: registrationId },
      });
      // 逆順で削除 (event 削除時に slot 0 constraint に引っかからないよう
      // registration → ticket → slot → event の順)
      await prisma.eventRegistration.deleteMany({
        where: { id: registrationId },
      });
      await prisma.eventTicket.deleteMany({ where: { id: ticketId } });
      // event を先に消す + cascade で slot も消える方針。SINGLE_OCCURRENCE の
      // 「exactly one slot」制約は event 削除時にも trigger されうるため、
      // event と slot を単一 tx で消す。
      await prisma.$transaction(async (tx) => {
        await tx.eventTimeSlot.deleteMany({ where: { id: slotId } });
        await tx.event.deleteMany({ where: { id: eventId } });
      });
    },
  };
}

/**
 * fireAndForget で発火した AuditLog write の commit を最大 timeoutMs まで poll する。
 *
 * `issueReceipt*` は receipt tx commit 後に `fireAndForget(createAuditLogRecord(...))` を
 * 発火する。fireAndForget は promise を即実行するが完了は待たない。実 DB test では
 * poll で auditLog table を SELECT し続けて出現を待つ (chain lock で 1〜数十ms オーダー
 * のはずだが、CI 上振れを見越して 3s を上限に)。
 */
async function waitForAuditLog(
  resourceId: string,
  timeoutMs = 3000,
): Promise<{
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: unknown;
  newValue: unknown;
  sequence: bigint;
} | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await prisma.auditLog.findFirst({
      where: { resource: "receipt", resourceId },
      select: {
        action: true,
        resource: true,
        resourceId: true,
        metadata: true,
        newValue: true,
        sequence: true,
      },
    });
    if (row) return row;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

describeMaybe("issueReceiptFor* — AuditLog coverage (OBS-02)", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    // CI の test DB は未 seed。設定行が要る経路なので自分で用意する。
    await ensureCommerceSettings(prisma);
    ({ issueReceiptForReservation, issueReceiptForEventRegistration } =
      await import("@/shared/domain/receipts/issue"));
    await prisma.$queryRaw`SELECT 1`;

    const category = await prisma.eventCategory.create({
      data: {
        name: `Receipt Audit Log Test Category ${crypto.randomUUID()}`,
        // sortOrder はテーブル全体でユニーク制約があるため、並行実行する他の
        // integration test ファイルの EventCategory 行と衝突しない乱数域を使う。
        sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
  });

  afterAll(async () => {
    // EventCategory は onDelete: Restrict のため、紐づく Event の削除後に削除する。
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await prisma.$disconnect();
  });

  test("issueReceiptForReservation の新規発行で AuditLog CREATE + metadata.source が記録される", async () => {
    const fixture = await createReservationFixture();
    try {
      const receipt = await issueReceiptForReservation(fixture.reservationId, {
        source: "stripe-webhook",
      });

      const audit = await waitForAuditLog(receipt.id);
      expect(audit).not.toBeNull();
      expect(audit?.action).toBe("CREATE");
      expect(audit?.resource).toBe("receipt");
      expect(audit?.resourceId).toBe(receipt.id);

      const metadata = audit?.metadata as { source: string };
      expect(metadata?.source).toBe("stripe-webhook");

      const newValue = audit?.newValue as {
        serialNo: string;
        reservationId: string;
        revision: number;
        amount: number;
      };
      expect(newValue?.serialNo).toBe(receipt.serialNo);
      expect(newValue?.reservationId).toBe(fixture.reservationId);
      expect(newValue?.revision).toBe(0);
      expect(newValue?.amount).toBeGreaterThan(0);
    } finally {
      // AuditLog は append-only (DB trigger で delete/update 禁止)。
      // 各 test は unique な receipt.id で scope してクエリするため、
      // 累積分は他 test に leak しない (append 分は次 test run へ持ち越すが
      // hash chain 監査の観点では想定挙動)。fixture 側 (receipt / reservation)
      // のみ掃除する。
      await fixture.cleanup();
    }
  }, 30_000);

  test("idempotent early-return では追加 AuditLog は書かれない", async () => {
    const fixture = await createReservationFixture();
    try {
      const first = await issueReceiptForReservation(fixture.reservationId, {
        source: "stripe-webhook",
      });
      // 初回 audit の到達を待ってから 2 回目を実行
      await waitForAuditLog(first.id);
      const before = await prisma.auditLog.count({
        where: { resource: "receipt", resourceId: first.id },
      });
      expect(before).toBe(1);

      // 2 回目 (at-least-once retry シナリオ想定)
      const second = await issueReceiptForReservation(fixture.reservationId, {
        source: "backfill-cron",
      });
      expect(second.id).toBe(first.id); // idempotent
      // fireAndForget が到達しないことを追加待ち (見えない audit があれば増えるはず)
      await new Promise((r) => setTimeout(r, 500));

      const after = await prisma.auditLog.count({
        where: { resource: "receipt", resourceId: first.id },
      });
      expect(after).toBe(1); // 2 回目は audit 追記なし
    } finally {
      // AuditLog は append-only (DB trigger で delete 禁止、'seed' でのみ bypass)。
      // 各 test は unique な receipt.id で scope するので他 test に leak しない。
      await fixture.cleanup();
    }
  }, 30_000);

  test("issueReceiptForEventRegistration の新規発行で AuditLog CREATE + eventRegistrationId が記録される", async () => {
    const fixture = await createEventRegistrationFixture();
    try {
      const receipt = await issueReceiptForEventRegistration(
        fixture.registrationId,
        { source: "backfill-cron" },
      );

      const audit = await waitForAuditLog(receipt.id);
      expect(audit).not.toBeNull();
      expect(audit?.action).toBe("CREATE");
      expect(audit?.resource).toBe("receipt");
      expect(audit?.resourceId).toBe(receipt.id);

      const metadata = audit?.metadata as { source: string };
      expect(metadata?.source).toBe("backfill-cron");

      const newValue = audit?.newValue as {
        serialNo: string;
        eventRegistrationId: string;
        reservationId?: string;
      };
      expect(newValue?.serialNo).toBe(receipt.serialNo);
      expect(newValue?.eventRegistrationId).toBe(fixture.registrationId);
      // reservationId は event registration 経路では含まれない
      expect(newValue?.reservationId).toBeUndefined();
    } finally {
      // AuditLog は append-only (DB trigger で delete 禁止、'seed' でのみ bypass)。
      // 各 test は unique な receipt.id で scope するので他 test に leak しない。
      await fixture.cleanup();
    }
  }, 30_000);

  test("hash chain sequence は receipt 発行前後で単調増加する", async () => {
    const fixture = await createReservationFixture();
    try {
      const beforeMax =
        (
          await prisma.auditLog.findFirst({
            orderBy: { sequence: "desc" },
            select: { sequence: true },
          })
        )?.sequence ?? 0n;

      const receipt = await issueReceiptForReservation(fixture.reservationId, {
        source: "stripe-webhook",
      });
      const audit = await waitForAuditLog(receipt.id);
      expect(audit).not.toBeNull();
      // 直前 max + 1 以上 (並行 test は無いので厳密には +1 だが safety margin で >)
      expect(audit?.sequence).toBeGreaterThan(beforeMax);
    } finally {
      // AuditLog は append-only (DB trigger で delete 禁止、'seed' でのみ bypass)。
      // 各 test は unique な receipt.id で scope するので他 test に leak しない。
      await fixture.cleanup();
    }
  }, 30_000);
});
