/**
 * イベント参加費の領収書が、**発行時点の設定の標準税率**を焼くこと。
 *
 * ## 何が起きていたか
 *
 * `issue-core.ts` の event-registration 側は `const taxRate = 10;` と直書きしていた。
 * 管理画面の「税率設定」で標準税率を 8% や 12% に変えても、イベント参加費の領収書
 * だけが「対象額（10% 適用、税抜）」「消費税額（10%）」を印字し続ける。
 *
 * `Receipt` は append-only の証跡なので、**出た紙は後から直せない**。顧客の手元に
 * 残る適格請求書の税率区分・税額欄が実際の税制と食い違ったまま残る。
 *
 * 予約側は `reservation.taxRate`（決済時点のスナップショット）を使っていたので
 * 影響が無く、イベント側だけが非対称に壊れていた。
 *
 * ## このテストが「10 のまま」を検出できる理由
 *
 * 設定を **10 以外**（8）に変えてから発行する。10 のままだと `taxRate` も
 * `taxAmount`（税込からの逆算）も期待値と食い違うので、直書きに戻したら落ちる。
 *
 * ## 復元
 *
 * `settings_commerce` は単一行の共有設定なので、`afterEach` で必ず戻す
 * （try/finally だと fixture 作成が落ちたときに入らない）。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type IssueModule = typeof import("@/shared/domain/receipts/issue");

let prisma: PrismaModule["prisma"];
let issueReceiptForEventRegistration: IssueModule["issueReceiptForEventRegistration"];

/** 設定を変える前の値。afterEach で必ずここへ戻す。 */
let originalStandardRate: number | null = null;
let categoryId: string;
let nextFixtureSort = 42_000_000 + Math.floor(Math.random() * 1_000_000);

const PROBE_TAX_RATE = 8;
const PAID_AMOUNT = 3000;

describeMaybe("イベント参加費の領収書の税率", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ issueReceiptForEventRegistration } =
      await import("@/shared/domain/receipts/issue"));

    const category = await prisma.eventCategory.create({
      data: {
        name: `Receipt Tax Rate Category ${crypto.randomUUID()}`,
        sortOrder: nextFixtureSort++,
      },
      select: { id: true },
    });
    categoryId = category.id;
  });

  afterEach(async () => {
    if (originalStandardRate !== null) {
      await prisma.settingsCommerce.updateMany({
        data: { taxStandardRate: originalStandardRate },
      });
      originalStandardRate = null;
    }
  });

  afterAll(async () => {
    await prisma.eventCategory.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  test("設定の標準税率が 8% なら、8% で焼かれる（10 の直書きに戻すと落ちる）", async () => {
    const current = await prisma.settingsCommerce.findFirst({
      select: { taxStandardRate: true },
    });
    // 設定行が無い環境ではこのテストが証明したいこと（設定を読んでいる）を
    // 示せないので、その事実を明示して落とす。黙って skip しない。
    expect(current).not.toBeNull();
    originalStandardRate = current?.taxStandardRate ?? null;
    expect(originalStandardRate).not.toBe(PROBE_TAX_RATE);

    await prisma.settingsCommerce.updateMany({
      data: { taxStandardRate: PROBE_TAX_RATE },
    });

    const suffix = crypto.randomUUID().replace(/-/gu, "").slice(0, 12);
    const slotStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const fixture = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          title: `Receipt Tax Rate Event ${suffix}`,
          slug: `receipt-tax-rate-${suffix}`,
          descriptionJson: {},
          descriptionHtml: "",
          descriptionPlainText: "",
          status: "DRAFT",
          scheduleMode: "SINGLE_OCCURRENCE",
          categoryId,
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
          price: PAID_AMOUNT,
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
          email: `receipt-tax-${suffix}@example.com`,
          quantity: 1,
          status: "CONFIRMED",
          paymentStatus: "PAID",
          paidAmount: PAID_AMOUNT,
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

      // 税込 3,000 円・8% → 税抜 floor(3000*100/108) = 2777、税額 223。
      // 10% のままだと税抜 2727 / 税額 273 になるので、どちらの値も食い違う。
      expect({
        taxRate: receipt.taxRate,
        taxAmount: receipt.taxAmount,
      }).toEqual({
        taxRate: PROBE_TAX_RATE,
        taxAmount:
          PAID_AMOUNT -
          Math.floor((PAID_AMOUNT * 100) / (100 + PROBE_TAX_RATE)),
      });
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
  }, 30_000);
});
