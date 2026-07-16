/**
 * Phase B.1 オンライン開催: Event.format / meetingUrl / meetingProvider の
 * 実 DB 検証（実 Postgres 必須、mock 不可）。
 *
 * 2 つの独立した契約を検証する:
 *
 * 1. DB CHECK 制約 `event_online_meeting_url_required`（migration
 *    20260716084951_add_event_online_format）: `format = 'OFFLINE' OR
 *    meetingProvider = 'GOOGLE_MEET' OR meetingUrl IS NOT NULL` を
 *    `prisma.event.create` の生 round-trip で検証する。
 * 2. Task 5 で拡張した select 群（`publicEventSelect` は type-check 経由、
 *    `adminEventSelect` 相当の `eventDetailSelect` / registration-queries の
 *    2 関数は実クエリ経由）が実際に format/meetingUrl を返すこと。brief 記載の
 *    4 ケースは `prisma.event.create` を直接叩くのみで select 層を一切通らない
 *    ため、select 拡張自体の regression は検知できない。「queries select 拡張」
 *    という Task 5 の主目的を実際に守るため、admin/customer/guest-claim の
 *    3 経路を追加で検証する（publicEventSelect は "use cache" producer のため
 *    Next.js request scope 外のプロセスから直接呼ぶ前例が本リポジトリに無く、
 *    ここでは対象外 — type-check の Prisma 型検証に委ねる）。
 *
 * ## なぜ「保存成功」ケースは $transaction 越しに EventTimeSlot も作るか
 *
 * `event_online_meeting_url_required` は DEFERRABLE 指定なしの immediate CHECK
 * のため単発 INSERT で即座に評価される。一方 `events_schedule_integrity_check`
 * (00000000000000_init migration) は `DEFERRABLE INITIALLY DEFERRED` の
 * constraint trigger で、scheduleMode に応じたスロット数
 * (SINGLE_OCCURRENCE ⇒ 正確に1件) を **commit 時**に強制する。単発の
 * `prisma.event.create()`（暗黙の単一ステートメント transaction）はスロット
 * 無しでその場 commit されるため、本テストの検証対象と無関係な理由で
 * reject される。`registration-overbooking.test.ts` の `createTestEvent` と
 * 同型で、event + slot を同一 `$transaction` 内で作成することで回避する。
 *
 * 実行条件は `registration-overbooking.test.ts` と同じ
 * （`bun run test:integration` が docker-compose test-db を注入、
 * `TEST_DATABASE_URL` 未設定での直接実行は describe.skip）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す（静的 import は gateway を引かないため、
// この代入は動的 import より先に実行される）。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// 動的 import の型（gateway / queries を実行時に読み込む）
type PrismaModule = typeof import("@/shared/db/prisma");
type AdminQueriesModule = typeof import("@/shared/domain/events/admin-queries");
type RegistrationQueriesModule =
  typeof import("@/shared/domain/events/registration-queries");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let getEventById: AdminQueriesModule["getEventById"];
let getCustomerEventRegistrations: RegistrationQueriesModule["getCustomerEventRegistrations"];
let getEventRegistrationForClaim: RegistrationQueriesModule["getEventRegistrationForClaim"];
let EventScheduleMode: (typeof import("@/shared/lib/validations/enums/prisma-types"))["EventScheduleMode"];
let EVENT_FORMAT: (typeof import("@/shared/lib/validations/enums/prisma-types"))["EVENT_FORMAT"];
let MEETING_PROVIDER: (typeof import("@/shared/lib/validations/enums/prisma-types"))["MEETING_PROVIDER"];

/** `prisma.event.create` が要求する `data` の実型（Prisma 名前空間を新規 import せず既存の gateway 型から導出）。 */
type EventCreateData = Parameters<
  PrismaModule["prisma"]["event"]["create"]
>[0]["data"];

const createdEventIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdUserIds: string[] = [];

/** 必須 field のみを埋めた Event.create 用の最小 data（scheduleMode は SINGLE_OCCURRENCE 固定）。 */
function baseEventData(label: string) {
  return {
    title: `Online format test ${label}`,
    slug: `online-format-${label}-${crypto.randomUUID()}`,
    descriptionJson: { type: "doc" },
    descriptionHtml: "<p>test</p>",
    descriptionPlainText: "test",
    scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
  };
}

/**
 * event + 1 EventTimeSlot + 1 EventTicket を同一 tx 内で作成する。
 * CHECK 制約の「保存成功」ケースおよび queries select 検証で使い回す
 * （registration が要るテストは ticket も必要なため、常に 3 点セットで作る）。
 */
async function createEventWithSlotAndTicket(
  data: EventCreateData,
): Promise<{ eventId: string; slotId: string; ticketId: string }> {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({ data, select: { id: true } });
    const slot = await tx.eventTimeSlot.create({
      data: { eventId: event.id, startAt: start, endAt: end, capacity: 10 },
      select: { id: true },
    });
    const ticket = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: "一般",
        price: 0,
        capacity: null,
        isAvailable: true,
      },
      select: { id: true },
    });
    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
  });
}

/** User + Customer を 1 件作る（`claim-commands.test.ts` の createLinkedCustomer と同型）。 */
async function createLinkedCustomer(label: string) {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `online-format-${label}-${suffix}@example.com`,
      name: "会員太郎",
      emailVerified: true,
    },
  });
  createdUserIds.push(user.id);
  const customer = await prisma.customer.create({
    data: {
      email: user.email,
      emailCanonical: user.email,
      lastName: "会員",
      firstName: "太郎",
      userId: user.id,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

describeMaybe("Event online format (integration)", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ getEventById } = await import("@/shared/domain/events/admin-queries"));
    ({ getCustomerEventRegistrations, getEventRegistrationForClaim } =
      await import("@/shared/domain/events/registration-queries"));
    ({ EventScheduleMode, EVENT_FORMAT, MEETING_PROVIDER } =
      await import("@/shared/lib/validations/enums/prisma-types"));
  });

  afterAll(async () => {
    // EventRegistration は EventTicket/EventTimeSlot に対して onDelete: Restrict
    // を持つため、削除順序は固定: 登録 → チケット → スロット → イベント。
    // ticket/slot は Event の onDelete: Cascade で消えるが、registration を先に
    // 削除しないと ticket 削除時に FK 制約で失敗する。
    if (createdEventIds.length > 0) {
      await prisma.eventRegistration.deleteMany({
        where: { eventId: { in: createdEventIds } },
      });
      await prisma.eventTicket.deleteMany({
        where: { eventId: { in: createdEventIds } },
      });
      await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    }
    if (createdCustomerIds.length > 0) {
      await prisma.customer.deleteMany({
        where: { id: { in: createdCustomerIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    // 実 DB 接続をクローズしてサブプロセスをハングさせない。
    await basePrisma.$disconnect();
  });

  describe("DB CHECK 制約 event_online_meeting_url_required", () => {
    test("CHECK: ONLINE + MANUAL + meetingUrl null → DB reject", async () => {
      // 注意: `expect(promise).rejects.*` は実 DB の複数 await を経て解決する
      // Promise（Prisma の `PrismaPromise`）に対して機能しない（bun 1.3.14 実測、
      // `blacklist-guard.test.ts` と同じ既知の問題）。明示的な try/catch で検証する。
      let thrown: unknown = null;
      try {
        await prisma.event.create({
          data: {
            ...baseEventData("check-violation"),
            format: EVENT_FORMAT.ONLINE,
            meetingProvider: MEETING_PROVIDER.MANUAL,
            meetingUrl: null,
          },
        });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain(
        "event_online_meeting_url_required",
      );
    });

    test("ONLINE + MANUAL + meetingUrl 指定 → 保存成功、round-trip", async () => {
      const { eventId } = await createEventWithSlotAndTicket({
        ...baseEventData("online-manual"),
        format: EVENT_FORMAT.ONLINE,
        meetingProvider: MEETING_PROVIDER.MANUAL,
        meetingUrl: "https://meet.google.com/example",
      });
      createdEventIds.push(eventId);

      const event = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      expect(event.format).toBe("ONLINE");
      expect(event.meetingProvider).toBe("MANUAL");
      expect(event.meetingUrl).toBe("https://meet.google.com/example");
    });

    test("ONLINE + GOOGLE_MEET + meetingUrl null → 保存成功 (write-back 待ち状態)", async () => {
      const { eventId } = await createEventWithSlotAndTicket({
        ...baseEventData("online-gmeet"),
        format: EVENT_FORMAT.ONLINE,
        meetingProvider: MEETING_PROVIDER.GOOGLE_MEET,
        meetingUrl: null,
      });
      createdEventIds.push(eventId);

      const event = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      expect(event.format).toBe("ONLINE");
      expect(event.meetingProvider).toBe("GOOGLE_MEET");
      expect(event.meetingUrl).toBeNull();
    });

    test("デフォルト値 → format=OFFLINE, meetingProvider=MANUAL, meetingUrl=null", async () => {
      const { eventId } = await createEventWithSlotAndTicket(
        baseEventData("defaults"),
      );
      createdEventIds.push(eventId);

      const event = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      expect(event.format).toBe("OFFLINE");
      expect(event.meetingProvider).toBe("MANUAL");
      expect(event.meetingUrl).toBeNull();
    });
  });

  describe("queries select 拡張（Task 5 の producer 契約）", () => {
    test("adminEventSelect 相当 (getEventById) が format/meetingUrl/meetingProvider を返す", async () => {
      const { eventId } = await createEventWithSlotAndTicket({
        ...baseEventData("admin-select"),
        format: EVENT_FORMAT.ONLINE,
        meetingProvider: MEETING_PROVIDER.MANUAL,
        meetingUrl: "https://meet.google.com/admin-select",
      });
      createdEventIds.push(eventId);

      const detail = await getEventById(eventId);
      expect(detail?.format).toBe("ONLINE");
      expect(detail?.meetingProvider).toBe("MANUAL");
      expect(detail?.meetingUrl).toBe("https://meet.google.com/admin-select");
    });

    test("getCustomerEventRegistrations の event に format/meetingUrl を含む", async () => {
      const { eventId, slotId, ticketId } = await createEventWithSlotAndTicket({
        ...baseEventData("customer-select"),
        format: EVENT_FORMAT.ONLINE,
        meetingProvider: MEETING_PROVIDER.MANUAL,
        meetingUrl: "https://meet.google.com/customer-select",
      });
      createdEventIds.push(eventId);
      const customer = await createLinkedCustomer("customer-select");

      const registration = await prisma.eventRegistration.create({
        data: {
          eventId,
          slotId,
          ticketId,
          name: "テスト太郎",
          email: `online-format-customer-reg-${crypto.randomUUID()}@example.com`,
          quantity: 1,
          customerId: customer.id,
        },
      });

      const { active } = await getCustomerEventRegistrations(customer.id);
      const found = active.find((r) => r.id === registration.id);
      expect(found).toBeDefined();
      expect(found?.event.format).toBe("ONLINE");
      expect(found?.event.meetingUrl).toBe(
        "https://meet.google.com/customer-select",
      );
    });

    test("getEventRegistrationForClaim の返却に format/meetingUrl を含む", async () => {
      const { eventId, slotId, ticketId } = await createEventWithSlotAndTicket({
        ...baseEventData("claim-select"),
        format: EVENT_FORMAT.ONLINE,
        meetingProvider: MEETING_PROVIDER.GOOGLE_MEET,
        meetingUrl: null,
      });
      createdEventIds.push(eventId);

      const registration = await prisma.eventRegistration.create({
        data: {
          eventId,
          slotId,
          ticketId,
          name: "ゲスト太郎",
          email: `online-format-claim-reg-${crypto.randomUUID()}@example.com`,
          quantity: 1,
          customerId: null,
        },
      });

      const claimDetail = await getEventRegistrationForClaim(registration.id);
      expect(claimDetail?.format).toBe("ONLINE");
      // GOOGLE_MEET write-back 待ち状態（CHECK 制約が許容する null）もそのまま
      // 素通しで返ることを確認する。
      expect(claimDetail?.meetingUrl).toBeNull();
    });
  });

  describe("writeBackMeetingUrl", () => {
    test("Event.meetingUrl を上書き保存する", async () => {
      const { eventId } = await createEventWithSlotAndTicket({
        ...baseEventData("writeback"),
        format: EVENT_FORMAT.ONLINE,
        meetingProvider: MEETING_PROVIDER.GOOGLE_MEET,
        meetingUrl: null,
      });
      createdEventIds.push(eventId);

      const { writeBackMeetingUrl } =
        await import("@/shared/domain/events/calendar-sync");
      await writeBackMeetingUrl({
        eventId,
        meetingUrl: "https://meet.google.com/generated",
      });

      const updated = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      expect(updated.meetingUrl).toBe("https://meet.google.com/generated");
    });
  });
});
