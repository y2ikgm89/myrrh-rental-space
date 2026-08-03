/**
 * 領収書の導出フィールド（宛名・但し書き）が導出元の最大長で発行できることの回帰テスト。
 *
 * **このテストが守る不変条件**:
 *   `recipientName` / `subject` は他レコードからの導出値であり、導出元が取りうる
 *   最大長でも領収書が発行できる。
 *
 * 壊れていたときの挙動: 両列が VarChar(100) だったため
 *   - `subject` = `${Event.title} 参加費として` は **タイトル 94 文字**で 100 を超える
 *     （Event.title は VarChar(200) / Zod .max(200)）
 *   - `recipientName` = `${lastName} ${firstName}` は 50 + 1 + 50 = **101 文字**
 * となり `tx.receipt.create` が Prisma P2000 を投げる。これは DomainError ではないため
 * stripe-webhook の catch が再送出し、webhook が 500 → Stripe が無限リトライする。
 * **決済は成立しているのに領収書だけ出ない**という壊れ方で、型検査でも lint でも
 * 検出できない（長さの一致は schema.prisma と Zod の目視同期に委ねられていた）。
 *
 * 境界を直接叩く。「100 文字ちょうど」で通しても意味が無いので、導出元の宣言上の
 * 最大値をそのまま使う。
 *
 * == 実行条件 ==
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 * TEST_DATABASE_URL 未設定時は describe.skip で silent skip。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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

let nextFixtureSort = 1_600_000_000;

/** Event.title の上限（schema.prisma の @db.VarChar(200) / event-form-schema の .max(200)）。 */
const EVENT_TITLE_MAX = 200;
/** 姓・名それぞれの上限（personNameFieldSchema / customerProfileSchema の .max(50)）。 */
const PERSON_NAME_MAX = 50;

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

describeMaybe("領収書の導出フィールド長", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ issueReceiptForReservation, issueReceiptForEventRegistration } =
      await import("@/shared/domain/receipts/issue"));
    await prisma.$queryRaw`SELECT 1`;

    const category = await prisma.eventCategory.create({
      data: {
        name: `Receipt Length Test Category ${crypto.randomUUID()}`,
        sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
  });

  afterAll(async () => {
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await prisma.$disconnect();
  });

  test("姓 50 文字 + 名 50 文字の顧客に領収書を発行できる", async () => {
    const suffix = crypto.randomUUID().replace(/-/gu, "").slice(0, 12);
    const lastName = "山".repeat(PERSON_NAME_MAX);
    const firstName = "太".repeat(PERSON_NAME_MAX);

    const location = await prisma.location.create({
      data: {
        slug: `rec-len-loc-${suffix}`,
        name: `Loc ${suffix}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/loc.jpg",
        sortOrder: nextFixtureSort++,
        // @@unique([sortOrder], where: { isActive: true }) を避けるため非公開にする
        isActive: false,
      },
      select: { id: true },
    });
    const space = await prisma.space.create({
      data: {
        slug: `rec-len-space-${suffix}`,
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
        lastName,
        firstName,
        email: `rec-len-${suffix}@example.com`,
        emailCanonical: `rec-len-${suffix}@example.com`,
      },
      select: { id: true },
    });
    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const reservation = await prisma.reservation.create({
      data: {
        spaceId: space.id,
        customerId: customer.id,
        startTime,
        endTime: new Date(startTime.getTime() + 60 * 60 * 1000),
        status: ReservationStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        ...DEFAULT_RESERVATION_PRICING,
      },
      select: { id: true },
    });

    try {
      const receipt = await issueReceiptForReservation(reservation.id, {
        source: "stripe-webhook",
      });

      // 50 + 区切り 1 + 50 = 101 文字。旧 VarChar(100) では P2000 で落ちていた
      expect(receipt.recipientName).toBe(`${lastName} ${firstName}`);
      expect(receipt.recipientName.length).toBe(PERSON_NAME_MAX * 2 + 1);
    } finally {
      await prisma.receipt.deleteMany({
        where: { reservationId: reservation.id },
      });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    }
  });

  test("タイトル 200 文字のイベント申込に領収書を発行できる", async () => {
    const suffix = crypto.randomUUID().replace(/-/gu, "").slice(0, 12);
    const title = "催".repeat(EVENT_TITLE_MAX);
    const slotStart = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // SINGLE_OCCURRENCE は commit 時に「slot ちょうど 1 件」を要求する constraint
    // trigger があるため、event / slot / ticket / registration を単一 tx で作る。
    const fixture = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          slug: `rec-len-event-${suffix}`,
          title,
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
          endAt: new Date(slotStart.getTime() + 60 * 60 * 1000),
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
          email: `rec-len-event-${suffix}@example.com`,
          quantity: 1,
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
          paidAmount: 3000,
        },
        select: { id: true },
      });
      return {
        eventId: event.id,
        slotId: slot.id,
        ticketId: ticket.id,
        registrationId: registration.id,
      };
    });

    try {
      const receipt = await issueReceiptForEventRegistration(
        fixture.registrationId,
        { source: "stripe-webhook" },
      );

      // 200 + " 参加費として"(7) = 207 文字。旧 VarChar(100) では P2000 で落ちていた
      expect(receipt.subject).toBe(`${title} 参加費として`);
      expect(receipt.subject.length).toBeGreaterThan(100);
    } finally {
      await prisma.receipt.deleteMany({
        where: { eventRegistrationId: fixture.registrationId },
      });
      await prisma.eventRegistration.deleteMany({
        where: { id: fixture.registrationId },
      });
      await prisma.eventTicket.deleteMany({ where: { id: fixture.ticketId } });
      await prisma.$transaction(async (tx) => {
        await tx.eventTimeSlot.deleteMany({ where: { id: fixture.slotId } });
        await tx.event.deleteMany({ where: { id: fixture.eventId } });
      });
    }
  });
});
