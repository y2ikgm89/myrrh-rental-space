/**
 * `processPendingReservationConfirmationEmails` の実 DB 統合テスト。
 *
 * 検証したいのは**クエリの意味論**（猶予窓・status 絞り・マーカーの上げ下げ）で、
 * mock された prisma では再現できない。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { ReservationStatus, TaxRateType } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

const mockSend = mock<(data: Record<string, unknown>) => Promise<unknown>>(
  async () => ({ ok: true }),
);
const noop = mock(async () => ({ ok: true }));

mock.module("@/shared/lib/email/reservation-emails", () => ({
  buildMemberReservationUrl: () => "",
  buildBookingHubUrl: () => "",
  sendReservationConfirmationEmail: mockSend,
  sendReservationUpdatedEmail: noop,
  sendReservationCancelledEmail: noop,
  sendReservationStatusChangedEmail: noop,
  sendReservationRefundEmail: noop,
  sendReservationAdminNotification: noop,
  sendBulkReservationCancelledEmail: noop,
  sendBulkAdminNotification: noop,
}));

mock.module("@/shared/domain/settings/queries/email-render-context", () => ({
  isReservationConfirmationEmailEnabled: () => Promise.resolve(true),
  getReservationEmailRenderContext: () =>
    Promise.resolve({
      calendarSettings: {},
      deadlineSettings: {},
      organizer: {},
      cancellationPolicyUrl: "",
    }),
  resolveEmailSendContext: () => Promise.resolve({ transport: {} }),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type PendingModule =
  typeof import("@/shared/domain/reservations/confirmation-email-pending");

let prisma: PrismaModule["prisma"];
let processPendingReservationConfirmationEmails: PendingModule["processPendingReservationConfirmationEmails"];

const PRICING = {
  basePrice: 1000,
  totalPrice: 1000,
  totalPriceWithTax: 1100,
  taxRateType: TaxRateType.STANDARD,
  taxRate: 10,
  taxAmount: 100,
  rateBreakdownJson: {
    schemaVersion: 1,
    segments: [],
    totalHours: 0,
    totalBasePrice: 0,
    holidayFlags: {},
  },
};

const GRACE_MS = 10 * 60 * 1000;
const created: {
  locationIds: string[];
  spaceIds: string[];
  customerIds: string[];
} = { locationIds: [], spaceIds: [], customerIds: [] };

async function createReservation(pendingAt: Date | null): Promise<string> {
  const suffix = crypto.randomUUID();
  const location = await prisma.location.create({
    data: {
      slug: `conf-backfill-loc-${suffix}`,
      name: `Conf Backfill Loc ${suffix}`,
      address: "test",
      imageUrl: "https://example.com/x.jpg",
      isActive: false,
    },
    select: { id: true },
  });
  const space = await prisma.space.create({
    data: {
      slug: `conf-backfill-space-${suffix}`,
      name: `Conf Backfill Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>t</p>",
      descriptionPlainText: "t",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/x.jpg",
      locationId: location.id,
      isPublished: true,
      isActive: true,
    },
    select: { id: true },
  });
  const customer = await prisma.customer.create({
    data: {
      lastName: "確認",
      firstName: "太郎",
      email: `conf-backfill-${suffix}@example.com`,
      emailCanonical: `conf-backfill-${suffix}@example.com`,
    },
    select: { id: true },
  });
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const reservation = await prisma.reservation.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      ...PRICING,
      startTime: start,
      endTime: new Date(start.getTime() + 60 * 60 * 1000),
      status: ReservationStatus.CONFIRMED,
      confirmationEmailPendingAt: pendingAt,
    },
    select: { id: true },
  });
  created.locationIds.push(location.id);
  created.spaceIds.push(space.id);
  created.customerIds.push(customer.id);
  return reservation.id;
}

describeMaybe("processPendingReservationConfirmationEmails", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ processPendingReservationConfirmationEmails } =
      await import("@/shared/domain/reservations/confirmation-email-pending"));
  });

  afterAll(async () => {
    await prisma.reservation.deleteMany({
      where: { spaceId: { in: created.spaceIds } },
    });
    await prisma.space.deleteMany({ where: { id: { in: created.spaceIds } } });
    await prisma.location.deleteMany({
      where: { id: { in: created.locationIds } },
    });
    await prisma.customer.deleteMany({
      where: { id: { in: created.customerIds } },
    });
    await prisma.$disconnect();
  });

  test("猶予を過ぎた送信待ちを送り、マーカーを下ろす", async () => {
    mockSend.mockClear();
    mockSend.mockImplementation(async () => ({ ok: true }));
    const id = await createReservation(new Date(Date.now() - GRACE_MS - 1000));

    const result = await processPendingReservationConfirmationEmails();

    expect(result.sent).toBeGreaterThanOrEqual(1);
    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id },
      select: { confirmationEmailPendingAt: true },
    });
    expect(after.confirmationEmailPendingAt).toBeNull();
  }, 20_000);

  test("猶予内の送信待ちは拾わない", async () => {
    // 通常経路（最大 150 秒の poll）がまだ走っているかもしれない窓。
    // ここで拾うと、cron が正規の送信を横から追い越す。
    mockSend.mockClear();
    mockSend.mockImplementation(async () => ({ ok: true }));
    const id = await createReservation(new Date(Date.now() - 60 * 1000));

    await processPendingReservationConfirmationEmails();

    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id },
      select: { confirmationEmailPendingAt: true },
    });
    expect(after.confirmationEmailPendingAt).not.toBeNull();
  }, 20_000);

  test("送信に失敗した行はマーカーが残る", async () => {
    // **この 1 本が回収の生命線。** 失敗で下ろすと二度と拾われない。
    mockSend.mockClear();
    mockSend.mockImplementation(async () => {
      throw new Error("resend down");
    });
    const id = await createReservation(new Date(Date.now() - GRACE_MS - 1000));

    await processPendingReservationConfirmationEmails();

    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id },
      select: { confirmationEmailPendingAt: true },
    });
    expect(after.confirmationEmailPendingAt).not.toBeNull();
  }, 20_000);
});
