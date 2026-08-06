/**
 * イベント参加費の領収書が、**どの税率を根拠にするか**を固定する。
 *
 * ## 契約
 *
 *   1. `EventRegistration.taxRate`（決済確定時のスナップショット）があればそれ
 *   2. 無ければ設定の標準税率（刻む前の行・確定時に設定を読めなかった行）
 *   3. どちらも無ければ**発行しない**（推測値を証跡に焼かない）
 *
 * ## なぜ 1 が要るか
 *
 * 適格請求書に要るのは「取引年月日時点の税率」。発行時点の設定を読むと、決済と発行が
 * 離れる経路（取りこぼし救済 cron・再発行・後追い発行）で標準税率が変わっていた場合、
 * **その取引と無関係な税率区分**が append-only の証跡に焼かれる。出た紙は直せない。
 *
 * 元は `const taxRate = 10;` の直書きだった。管理画面で標準税率を 8% に変えても
 * イベント参加費の領収書だけが「10% 適用」を印字し続けていた（予約側は
 * `reservation.taxRate` のスナップショットを使っていたので影響が無く、
 * イベント側だけが非対称に壊れていた）。
 *
 * ## このテストが退行を検出できる理由
 *
 * 設定と行のスナップショットを**互いに違う値**にして発行する。どちらを読むかで
 * `taxRate` も `taxAmount`（税込からの逆算）も変わるので、優先順を取り違えたら落ちる。
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

import { ensureCommerceSettings } from "../../../support/commerce-settings";

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
/** 決済確定時に刻まれた税率。設定値（PROBE_TAX_RATE）と必ず違う値にする。 */
const SNAPSHOT_TAX_RATE = 10;
const PAID_AMOUNT = 3000;

describeMaybe("イベント参加費の領収書が根拠にする税率", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    // CI の test DB は未 seed。設定行が要る経路なので自分で用意する。
    await ensureCommerceSettings(prisma);
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

  type Fixture = {
    readonly eventId: string;
    readonly slotId: string;
    readonly ticketId: string;
    readonly registrationId: string;
  };

  /** 決済済みのイベント申込を 1 件作る。`snapshotTaxRate` を渡すと行に刻む。 */
  async function createPaidRegistration(
    snapshotTaxRate: number | null,
  ): Promise<Fixture> {
    const suffix = crypto.randomUUID().replace(/-/gu, "").slice(0, 12);
    const slotStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
    return prisma.$transaction(async (tx) => {
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
          ...(snapshotTaxRate !== null ? { taxRate: snapshotTaxRate } : {}),
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
  }

  async function cleanup(fixture: Fixture): Promise<void> {
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

  /** 税込 `PAID_AMOUNT` を税率 `rate` で分解したときの税額（発行側と同じ式）。 */
  function taxAmountFor(rate: number): number {
    return PAID_AMOUNT - Math.floor((PAID_AMOUNT * 100) / (100 + rate));
  }

  /** 設定の標準税率を `rate` にする（afterEach が元に戻す）。 */
  async function setStandardRate(rate: number): Promise<void> {
    const current = await prisma.settingsCommerce.findFirst({
      select: { taxStandardRate: true },
    });
    // 設定行が無い環境では証明したいこと（設定を読んでいる）を示せないので、
    // その事実を明示して落とす。黙って skip しない。
    expect(current).not.toBeNull();
    originalStandardRate = current?.taxStandardRate ?? null;
    expect(originalStandardRate).not.toBe(rate);
    await prisma.settingsCommerce.updateMany({
      data: { taxStandardRate: rate },
    });
  }

  test("行に刻まれていなければ設定の標準税率で焼く（10 の直書きに戻すと落ちる）", async () => {
    await setStandardRate(PROBE_TAX_RATE);
    const fixture = await createPaidRegistration(null);

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
        taxAmount: taxAmountFor(PROBE_TAX_RATE),
      });
    } finally {
      await cleanup(fixture);
    }
  }, 30_000);

  test("行に刻まれていれば、設定が変わっていてもそのスナップショットで焼く", async () => {
    // 決済時 10% → その後 設定を 8% に変更 → 発行。
    // 適格請求書に要るのは取引年月日時点の税率なので、10% で焼かれなければならない。
    await setStandardRate(PROBE_TAX_RATE);
    const fixture = await createPaidRegistration(SNAPSHOT_TAX_RATE);

    try {
      const receipt = await issueReceiptForEventRegistration(
        fixture.registrationId,
        { source: "stripe-webhook" },
      );

      expect({
        taxRate: receipt.taxRate,
        taxAmount: receipt.taxAmount,
      }).toEqual({
        taxRate: SNAPSHOT_TAX_RATE,
        taxAmount: taxAmountFor(SNAPSHOT_TAX_RATE),
      });
    } finally {
      await cleanup(fixture);
    }
  }, 30_000);
});
