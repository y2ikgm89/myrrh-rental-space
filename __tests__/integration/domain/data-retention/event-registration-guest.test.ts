/**
 * ゲストのイベント申込 PII が、保持期限を過ぎたら実 DB 上で本当に消えることの検査。
 *
 * ## なぜ実 DB でやるのか
 *
 * `anonymizeExpiredGuestEventRegistrations` の WHERE は
 * `slot: { endAt: { lt: cutoff } }` という **リレーション越しの条件**を
 * `updateMany` に渡す。unit テストは Prisma へ渡す引数の形しか固定できないので、
 * 「その形が実際にサブクエリへ落ちて、正しい行だけを更新するか」は実 DB でしか
 * 証明できない。関係のない行まで巻き込む変異は、形の検査では素通りする。
 *
 * ## 何を固定するか
 *
 * 1. 期限切れのゲスト申込 → 氏名が placeholder になり、連絡先と備考が NULL になる
 * 2. **会員申込は触らない** — 会員の PII は Customer 匿名化に連動するため
 *    （両方で消すと、退会前の会員の名前が受付名簿から消える）
 * 3. **期限内の申込は触らない** — cutoff の左右で挙動が分かれること
 * 4. 2 回流しても 2 回目は 0 件（冪等）
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（`bun run test:integration` が docker-compose の
 * test-db 既定値を注入する）。gateway は import 時の `process.env.DATABASE_URL` を
 * 読むため動的 import より前に上書きする。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule = typeof import("@/shared/domain/data-retention/commands");
type LifecycleModule =
  typeof import("@/shared/domain/customers/customer-lifecycle-commands");

let prisma: PrismaModule["prisma"];
let anonymizeExpiredGuestEventRegistrations: CommandsModule["anonymizeExpiredGuestEventRegistrations"];
let placeholderName: LifecycleModule["CUSTOMER_ANONYMIZE_PLACEHOLDER_LAST_NAME"];

let testCategoryId: string;

const NOW = new Date("2027-01-15T00:00:00.000Z");
/** NOW から 12 ヶ月前 = 2026-01-15。これより前に終わった枠が対象。 */
const RETENTION_MONTHS = 12;

async function createEventWithSlot(
  label: string,
  slotStart: Date,
  slotEnd: Date,
): Promise<{ eventId: string; slotId: string; ticketId: string }> {
  const suffix = crypto.randomUUID();
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `Data Retention Test ${label}`,
        slug: `data-retention-${label}-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: false,
        firstSlotStartAt: slotStart,
        lastSlotEndAt: slotEnd,
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

describeMaybe("ゲスト申込の保持ポリシー — 実 Postgres", () => {
  const createdEventIds: string[] = [];
  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ anonymizeExpiredGuestEventRegistrations } =
      await import("@/shared/domain/data-retention/commands"));
    ({ CUSTOMER_ANONYMIZE_PLACEHOLDER_LAST_NAME: placeholderName } =
      await import("@/shared/domain/customers/customer-lifecycle-commands"));
    await prisma.$queryRaw`SELECT 1`;

    const category = await prisma.eventCategory.create({
      data: {
        name: `Data Retention Test Category ${crypto.randomUUID()}`,
        // sortOrder はテーブル全体で一意。並行する他ファイルと衝突しない乱数域を使う。
        sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
  });

  afterAll(async () => {
    await prisma.eventRegistration.deleteMany({
      where: { eventId: { in: createdEventIds } },
    });
    await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    // EventCategory は onDelete: Restrict なので Event の後に消す。
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await prisma.customer.deleteMany({
      where: { id: { in: createdCustomerIds } },
    });
    await prisma.$disconnect();
  });

  test("期限切れのゲスト申込だけを匿名化し、会員申込と期限内の申込は触らない", async () => {
    // 2025-06-01 に終わった枠 → cutoff (2026-01-15) より前。対象。
    const expired = await createEventWithSlot(
      "expired",
      new Date("2025-06-01T01:00:00.000Z"),
      new Date("2025-06-01T03:00:00.000Z"),
    );
    // 2026-12-01 に終わる枠 → cutoff より後。対象外。
    const fresh = await createEventWithSlot(
      "fresh",
      new Date("2026-12-01T01:00:00.000Z"),
      new Date("2026-12-01T03:00:00.000Z"),
    );
    createdEventIds.push(expired.eventId, fresh.eventId);

    const memberEmail = `retention-member-${crypto.randomUUID()}@example.com`;
    const member = await prisma.customer.create({
      data: {
        email: memberEmail,
        // UNIQUE 制約付きの正規化列。生成済みの小文字メールをそのまま使う。
        emailCanonical: memberEmail.toLowerCase(),
        lastName: "会員",
        firstName: "太郎",
      },
      select: { id: true },
    });
    createdCustomerIds.push(member.id);

    const guestOnExpired = await prisma.eventRegistration.create({
      data: {
        eventId: expired.eventId,
        slotId: expired.slotId,
        ticketId: expired.ticketId,
        name: "ゲスト 期限切れ",
        email: "guest-expired@example.com",
        phone: "090-0000-0001",
        note: "アレルギー: そば",
        status: RegistrationStatus.CONFIRMED,
      },
      select: { id: true },
    });
    const memberOnExpired = await prisma.eventRegistration.create({
      data: {
        eventId: expired.eventId,
        slotId: expired.slotId,
        ticketId: expired.ticketId,
        customerId: member.id,
        name: "会員 期限切れ",
        email: "member-expired@example.com",
        phone: "090-0000-0002",
        note: "会員の備考",
        status: RegistrationStatus.CONFIRMED,
      },
      select: { id: true },
    });
    const guestOnFresh = await prisma.eventRegistration.create({
      data: {
        eventId: fresh.eventId,
        slotId: fresh.slotId,
        ticketId: fresh.ticketId,
        name: "ゲスト 期限内",
        email: "guest-fresh@example.com",
        phone: "090-0000-0003",
        note: "期限内の備考",
        status: RegistrationStatus.CONFIRMED,
      },
      select: { id: true },
    });

    const anonymized = await anonymizeExpiredGuestEventRegistrations(
      NOW,
      RETENTION_MONTHS,
    );
    expect(anonymized).toBe(1);

    const rows = await prisma.eventRegistration.findMany({
      where: {
        id: { in: [guestOnExpired.id, memberOnExpired.id, guestOnFresh.id] },
      },
      select: { id: true, name: true, email: true, phone: true, note: true },
      orderBy: { id: "asc" },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(guestOnExpired.id)).toEqual({
      id: guestOnExpired.id,
      name: placeholderName,
      email: null,
      phone: null,
      note: null,
    });
    expect(byId.get(memberOnExpired.id)).toEqual({
      id: memberOnExpired.id,
      name: "会員 期限切れ",
      email: "member-expired@example.com",
      phone: "090-0000-0002",
      note: "会員の備考",
    });
    expect(byId.get(guestOnFresh.id)).toEqual({
      id: guestOnFresh.id,
      name: "ゲスト 期限内",
      email: "guest-fresh@example.com",
      phone: "090-0000-0003",
      note: "期限内の備考",
    });

    // 2 回目は対象ゼロ（cron は at-least-once なので冪等でないと件数が嘘になる）。
    expect(
      await anonymizeExpiredGuestEventRegistrations(NOW, RETENTION_MONTHS),
    ).toBe(0);
  });
});
