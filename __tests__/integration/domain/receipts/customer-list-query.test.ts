/**
 * `getCustomerReceipts` 統合テスト (STATE-02、mypage /receipts 一覧クエリ)。
 *
 * ## 実 Postgres で担保する不変条件
 * 1. Customer 単位で予約経路 (reservation.customerId) と イベント経路
 *    (eventRegistration.customerId) の両方の Receipt を横断取得できる。
 * 2. `reissueReceiptCommand` で reservationId / eventRegistrationId が両方 NULL の
 *    orphan (再発行元) は返らない (chain の branch を隠す)。
 * 3. Reservation.deletedAt (管理者 soft-delete) された予約の Receipt も返り、
 *    source.isDeleted=true が付く (適格請求書は append-only 契約で削除に追従しない)。
 * 4. Event.deletedAt な event の EventRegistration Receipt も返り、source.isDeleted=true
 *    が付く。
 * 5. 別 Customer の Receipt は返らない (ownership 隔離)。
 * 6. order は issuedAt desc (最新発行順)。
 * 7. offset ページングが動作する (skip + take、totalCount / totalPages 一致)。
 *
 * PDF renderer は使わないので mock 不要。DB クエリ層のみ検証する。
 *
 * == 実行条件 ==
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 * `TEST_DATABASE_URL` 未設定時は describe.skip で silent skip。
 * SERIAL_DB_TESTS への登録必須 (scripts/test-db-runner-env.ts)。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
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
type QueriesModule = typeof import("@/shared/domain/receipts/queries");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let getCustomerReceipts: QueriesModule["getCustomerReceipts"];

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

// テスト run 全体でユニークな sortOrder。他テストとの衝突を避けるため乱数 offset。
// 過去 run が cleanup 失敗で残しても衝突しないよう、テスト suite 起動ごとにランダム。
const SORT_ORDER_BASE = 1_400_000_000 + Math.floor(Math.random() * 100_000_000);
let nextFixtureLocationSortOrder = SORT_ORDER_BASE;

type SpaceFixture = { spaceId: string; locationId: string };

async function createSpaceFixture(suffix: string): Promise<SpaceFixture> {
  const location = await prisma.location.create({
    data: {
      slug: `receipts-list-loc-${suffix}`,
      name: `Receipts List Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureLocationSortOrder++,
    },
    select: { id: true },
  });
  const space = await prisma.space.create({
    data: {
      slug: `receipts-list-space-${suffix}`,
      name: `Receipts List Space ${suffix}`,
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
  return { spaceId: space.id, locationId: location.id };
}

async function createCustomerFixture(suffix: string): Promise<string> {
  const customer = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: `太郎-${suffix}`,
      email: `receipts-list-${suffix}@example.com`,
      emailCanonical: `receipts-list-${suffix}@example.com`,
    },
    select: { id: true },
  });
  return customer.id;
}

// 各 Reservation は同一 space 内で `reservations_no_active_time_overlap_excl`
// (EXCLUDE constraint) に抵触しないよう time slot をずらす。テスト単位で単調増加。
let nextReservationSlotIndex = 0;

async function createReservationFixture(
  customerId: string,
  spaceId: string,
  options?: { deleted?: boolean },
): Promise<string> {
  const slotIndex = nextReservationSlotIndex++;
  // 24h 先を基準に、slot ごとに 2h ずつずらす (重複しない半開区間)
  const startTime = new Date(
    Date.now() + 24 * 60 * 60 * 1000 + slotIndex * 2 * 60 * 60 * 1000,
  );
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
  const reservation = await prisma.reservation.create({
    data: {
      spaceId,
      customerId,
      startTime,
      endTime,
      status: ReservationStatus.CONFIRMED,
      ...DEFAULT_RESERVATION_PRICING,
      ...(options?.deleted ? { deletedAt: new Date() } : {}),
    },
    select: { id: true },
  });
  return reservation.id;
}

async function createReceiptForReservation(
  reservationId: string,
  serialNoSuffix: string,
  issuedAt: Date,
  amount = 1100,
): Promise<string> {
  const serialNo = `9998-${serialNoSuffix}`;
  const receipt = await prisma.receipt.create({
    data: {
      serialNo,
      reservationId,
      recipientName: "山田 太郎",
      subject: "スペース利用料として",
      amount,
      taxAmount: 100,
      taxRate: 10,
      issuedAt,
      issuerSnapshot: { snapshotAt: new Date().toISOString() },
    },
    select: { id: true },
  });
  return receipt.id;
}

type EventFixture = {
  eventId: string;
  slotId: string;
  ticketId: string;
};

async function createEventFixture(
  suffix: string,
  options?: { deleted?: boolean },
): Promise<EventFixture> {
  const slotStartAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const slotEndAt = new Date(slotStartAt.getTime() + 2 * 60 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `Receipts List Event ${suffix}`,
        slug: `receipts-list-event-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: slotStartAt,
        lastSlotEndAt: slotEndAt,
        ...(options?.deleted ? { deletedAt: new Date() } : {}),
      },
      select: { id: true },
    });
    const slot = await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt: slotStartAt,
        endAt: slotEndAt,
        capacity: 1000,
      },
      select: { id: true },
    });
    const ticket = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: "一般",
        price: 3000,
        capacity: null,
        isAvailable: true,
      },
      select: { id: true },
    });
    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
  });
}

async function createEventRegistration(
  customerId: string | null,
  fx: EventFixture,
  suffix: string,
): Promise<string> {
  const registration = await prisma.eventRegistration.create({
    data: {
      eventId: fx.eventId,
      slotId: fx.slotId,
      ticketId: fx.ticketId,
      name: "山田太郎",
      email: `receipts-list-reg-${suffix}@example.com`,
      quantity: 1,
      status: RegistrationStatus.CONFIRMED,
      ...(customerId !== null ? { customerId } : {}),
    },
    select: { id: true },
  });
  return registration.id;
}

async function createReceiptForEventRegistration(
  registrationId: string,
  serialNoSuffix: string,
  issuedAt: Date,
  amount = 3300,
): Promise<string> {
  const serialNo = `9997-${serialNoSuffix}`;
  const receipt = await prisma.receipt.create({
    data: {
      serialNo,
      eventRegistrationId: registrationId,
      recipientName: "山田 太郎",
      subject: "イベント参加費として",
      amount,
      taxAmount: 300,
      taxRate: 10,
      issuedAt,
      issuerSnapshot: { snapshotAt: new Date().toISOString() },
    },
    select: { id: true },
  });
  return receipt.id;
}

describeMaybe("getCustomerReceipts — cross-source list query", () => {
  const cleanupIds: {
    receiptIds: string[];
    reservationIds: string[];
    registrationIds: string[];
    eventIds: string[];
    customerIds: string[];
    spaceIds: string[];
    locationIds: string[];
  } = {
    receiptIds: [],
    reservationIds: [],
    registrationIds: [],
    eventIds: [],
    customerIds: [],
    spaceIds: [],
    locationIds: [],
  };

  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ getCustomerReceipts } =
      await import("@/shared/domain/receipts/queries"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    // Cascade 順に削除 (Receipt → Reservation/Registration → Event → Space → Customer/Location)
    if (cleanupIds.receiptIds.length > 0) {
      await prisma.receipt.deleteMany({
        where: { id: { in: cleanupIds.receiptIds } },
      });
    }
    if (cleanupIds.reservationIds.length > 0) {
      await prisma.reservation.deleteMany({
        where: { id: { in: cleanupIds.reservationIds } },
      });
    }
    if (cleanupIds.registrationIds.length > 0) {
      await prisma.eventRegistration.deleteMany({
        where: { id: { in: cleanupIds.registrationIds } },
      });
    }
    if (cleanupIds.eventIds.length > 0) {
      await prisma.event.deleteMany({
        where: { id: { in: cleanupIds.eventIds } },
      });
    }
    if (cleanupIds.spaceIds.length > 0) {
      await prisma.space.deleteMany({
        where: { id: { in: cleanupIds.spaceIds } },
      });
    }
    if (cleanupIds.customerIds.length > 0) {
      await prisma.customer.deleteMany({
        where: { id: { in: cleanupIds.customerIds } },
      });
    }
    if (cleanupIds.locationIds.length > 0) {
      await prisma.location.deleteMany({
        where: { id: { in: cleanupIds.locationIds } },
      });
    }
    await basePrisma.$disconnect();
  });

  test("予約経路 + イベント経路の Receipt を横断取得し issuedAt desc で並ぶ", async () => {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    const spaceFx = await createSpaceFixture(suffix);
    cleanupIds.spaceIds.push(spaceFx.spaceId);
    cleanupIds.locationIds.push(spaceFx.locationId);

    const customerId = await createCustomerFixture(suffix);
    cleanupIds.customerIds.push(customerId);

    const reservationId = await createReservationFixture(
      customerId,
      spaceFx.spaceId,
    );
    cleanupIds.reservationIds.push(reservationId);

    const eventFx = await createEventFixture(suffix);
    cleanupIds.eventIds.push(eventFx.eventId);

    const registrationId = await createEventRegistration(
      customerId,
      eventFx,
      suffix,
    );
    cleanupIds.registrationIds.push(registrationId);

    // 予約 Receipt を古い issuedAt で発行、イベント Receipt を新しい issuedAt で発行
    const oldIssuedAt = new Date(Date.now() - 60 * 60 * 1000);
    const newIssuedAt = new Date(Date.now() - 5 * 60 * 1000);

    const reservationReceiptId = await createReceiptForReservation(
      reservationId,
      `${suffix.slice(0, 4)}RA`,
      oldIssuedAt,
    );
    const eventReceiptId = await createReceiptForEventRegistration(
      registrationId,
      `${suffix.slice(0, 4)}EA`,
      newIssuedAt,
    );
    cleanupIds.receiptIds.push(reservationReceiptId, eventReceiptId);

    const result = await getCustomerReceipts(customerId);

    expect(result.totalCount).toBe(2);
    expect(result.items.length).toBe(2);

    // issuedAt desc: event (新) → reservation (古)
    const first = result.items[0];
    const second = result.items[1];
    expect(first?.id).toBe(eventReceiptId);
    expect(first?.source.type).toBe("event");
    if (first?.source.type === "event") {
      expect(first.source.isDeleted).toBe(false);
      expect(first.source.eventTitle).toContain("Receipts List Event");
    }

    expect(second?.id).toBe(reservationReceiptId);
    expect(second?.source.type).toBe("reservation");
    if (second?.source.type === "reservation") {
      expect(second.source.isDeleted).toBe(false);
      expect(second.source.spaceName).toContain("Receipts List Space");
    }
  });

  test("orphan (reissue 元、reservationId=NULL AND eventRegistrationId=NULL) は返らない", async () => {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    const spaceFx = await createSpaceFixture(suffix);
    cleanupIds.spaceIds.push(spaceFx.spaceId);
    cleanupIds.locationIds.push(spaceFx.locationId);

    const customerId = await createCustomerFixture(suffix);
    cleanupIds.customerIds.push(customerId);

    const reservationId = await createReservationFixture(
      customerId,
      spaceFx.spaceId,
    );
    cleanupIds.reservationIds.push(reservationId);

    // 通常の (active) Receipt
    const activeReceiptId = await createReceiptForReservation(
      reservationId,
      `${suffix.slice(0, 4)}AC`,
      new Date(),
    );
    cleanupIds.receiptIds.push(activeReceiptId);

    // orphan (reservationId=NULL, eventRegistrationId=NULL): reissueReceiptCommand の
    // 副作用で発生する状態を直接 create して再現する。
    const orphanReceipt = await prisma.receipt.create({
      data: {
        serialNo: `9996-${suffix.slice(0, 6).toUpperCase()}`,
        recipientName: "山田 太郎",
        subject: "スペース利用料として",
        amount: 1100,
        taxAmount: 100,
        taxRate: 10,
        issuerSnapshot: { snapshotAt: new Date().toISOString() },
      },
      select: { id: true },
    });
    cleanupIds.receiptIds.push(orphanReceipt.id);

    const result = await getCustomerReceipts(customerId);

    // active のみ返る (orphan は customerId 関連付けが無いので OR 節に hit しない)
    expect(result.totalCount).toBe(1);
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.id).toBe(activeReceiptId);
    expect(result.items.some((it) => it.id === orphanReceipt.id)).toBe(false);
  });

  test("Reservation.deletedAt な予約の Receipt は取得でき isDeleted=true が付く", async () => {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    const spaceFx = await createSpaceFixture(suffix);
    cleanupIds.spaceIds.push(spaceFx.spaceId);
    cleanupIds.locationIds.push(spaceFx.locationId);

    const customerId = await createCustomerFixture(suffix);
    cleanupIds.customerIds.push(customerId);

    const deletedReservationId = await createReservationFixture(
      customerId,
      spaceFx.spaceId,
      { deleted: true },
    );
    cleanupIds.reservationIds.push(deletedReservationId);

    const receiptId = await createReceiptForReservation(
      deletedReservationId,
      `${suffix.slice(0, 4)}DL`,
      new Date(),
    );
    cleanupIds.receiptIds.push(receiptId);

    const result = await getCustomerReceipts(customerId);
    expect(result.totalCount).toBe(1);
    const item = result.items[0];
    expect(item?.id).toBe(receiptId);
    expect(item?.source.type).toBe("reservation");
    if (item?.source.type === "reservation") {
      expect(item.source.isDeleted).toBe(true);
    }
  });

  test("Event.deletedAt な event の EventRegistration Receipt は取得でき isDeleted=true が付く", async () => {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    const customerId = await createCustomerFixture(suffix);
    cleanupIds.customerIds.push(customerId);

    const deletedEventFx = await createEventFixture(suffix, { deleted: true });
    cleanupIds.eventIds.push(deletedEventFx.eventId);

    const registrationId = await createEventRegistration(
      customerId,
      deletedEventFx,
      suffix,
    );
    cleanupIds.registrationIds.push(registrationId);

    const receiptId = await createReceiptForEventRegistration(
      registrationId,
      `${suffix.slice(0, 4)}ED`,
      new Date(),
    );
    cleanupIds.receiptIds.push(receiptId);

    const result = await getCustomerReceipts(customerId);
    expect(result.totalCount).toBe(1);
    const item = result.items[0];
    expect(item?.id).toBe(receiptId);
    expect(item?.source.type).toBe("event");
    if (item?.source.type === "event") {
      expect(item.source.isDeleted).toBe(true);
    }
  });

  test("別 Customer の Receipt は返らない (ownership 隔離)", async () => {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    const spaceFx = await createSpaceFixture(suffix);
    cleanupIds.spaceIds.push(spaceFx.spaceId);
    cleanupIds.locationIds.push(spaceFx.locationId);

    const customerAId = await createCustomerFixture(`${suffix}-A`);
    const customerBId = await createCustomerFixture(`${suffix}-B`);
    cleanupIds.customerIds.push(customerAId, customerBId);

    const reservationAId = await createReservationFixture(
      customerAId,
      spaceFx.spaceId,
    );
    const reservationBId = await createReservationFixture(
      customerBId,
      spaceFx.spaceId,
    );
    cleanupIds.reservationIds.push(reservationAId, reservationBId);

    const receiptAId = await createReceiptForReservation(
      reservationAId,
      `${suffix.slice(0, 4)}OA`,
      new Date(),
    );
    const receiptBId = await createReceiptForReservation(
      reservationBId,
      `${suffix.slice(0, 4)}OB`,
      new Date(),
    );
    cleanupIds.receiptIds.push(receiptAId, receiptBId);

    // A から見ると A の Receipt のみ
    const resultA = await getCustomerReceipts(customerAId);
    expect(resultA.totalCount).toBe(1);
    expect(resultA.items[0]?.id).toBe(receiptAId);

    // B から見ると B の Receipt のみ
    const resultB = await getCustomerReceipts(customerBId);
    expect(resultB.totalCount).toBe(1);
    expect(resultB.items[0]?.id).toBe(receiptBId);
  });

  test("offset ページング: 3 件 / pageSize:2 なら page:1 で 2 件、page:2 で 1 件", async () => {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    const spaceFx = await createSpaceFixture(suffix);
    cleanupIds.spaceIds.push(spaceFx.spaceId);
    cleanupIds.locationIds.push(spaceFx.locationId);

    const customerId = await createCustomerFixture(suffix);
    cleanupIds.customerIds.push(customerId);

    const reservationIds: string[] = [];
    const receiptIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const reservationId = await createReservationFixture(
        customerId,
        spaceFx.spaceId,
      );
      // Incrementally push to cleanupIds so partial failure still cleans up
      cleanupIds.reservationIds.push(reservationId);
      reservationIds.push(reservationId);
      const receiptId = await createReceiptForReservation(
        reservationId,
        `${suffix.slice(0, 4)}P${String(i)}`,
        // issuedAt を分単位でずらして順序を確定 (i=0 が最古、i=2 が最新)
        new Date(Date.now() - (10 - i) * 60 * 1000),
      );
      cleanupIds.receiptIds.push(receiptId);
      receiptIds.push(receiptId);
    }

    // page 1: 最新 2 件 (i=2, i=1)
    const page1 = await getCustomerReceipts(customerId, {
      page: 1,
      pageSize: 2,
    });
    expect(page1.totalCount).toBe(3);
    expect(page1.totalPages).toBe(2);
    expect(page1.currentPage).toBe(1);
    expect(page1.items.length).toBe(2);
    expect(page1.items[0]?.id).toBe(receiptIds[2]);
    expect(page1.items[1]?.id).toBe(receiptIds[1]);

    // page 2: 残り 1 件 (i=0)
    const page2 = await getCustomerReceipts(customerId, {
      page: 2,
      pageSize: 2,
    });
    expect(page2.totalCount).toBe(3);
    expect(page2.totalPages).toBe(2);
    expect(page2.currentPage).toBe(2);
    expect(page2.items.length).toBe(1);
    expect(page2.items[0]?.id).toBe(receiptIds[0]);
  });
});
