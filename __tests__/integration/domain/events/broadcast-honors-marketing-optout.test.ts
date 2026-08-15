/**
 * イベント一斉配信が marketingOptIn を守ることの検証。
 *
 * == なぜ要るのか ==
 *
 * 一斉配信のメールには `List-Unsubscribe` / `List-Unsubscribe-Post: One-Click` と
 * 本文の「配信停止はこちら」が付く。押すと `marketingOptIn=false` になり、
 * 確認画面は「今後、運営からのお知らせ・キャンペーンメールは配信されません」と
 * 表示する。
 *
 * ところが `getEventBroadcastPayload` の where は `status=CONFIRMED` だけで
 * `marketingOptIn` を見ておらず、**次の配信でまた届いていた**（監査 F-45）。
 * 顧客一斉配信（`findCustomersForBroadcast`）は `marketingOptIn: true` で絞って
 * おり、挙動が非対称だった。
 *
 * Gmail / Yahoo の bulk sender 要件（配信停止を honor すること）を満たさないと、
 * spam 報告 → COMPLAINED → `getSuppressedEmailSet` 経由で**予約確認や領収書など
 * 取引メールまで全停止**する。
 *
 * == 何を mock し、何を通すか ==
 *
 * mock は無し。欠陥は where 句にあった。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { RegistrationStatus } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type EmailQueriesModule = typeof import("@/shared/domain/events/email-queries");
type RegistrationQueriesModule =
  typeof import("@/shared/domain/events/registration-queries");

let prisma: PrismaModule["prisma"];
let getEventBroadcastPayload: EmailQueriesModule["getEventBroadcastPayload"];
let getEventBroadcastRecipientCounts: RegistrationQueriesModule["getEventBroadcastRecipientCounts"];

let categoryId: string;
let eventId: string;
let ticketId: string;
let slotId: string;
const createdCustomerIds: string[] = [];

/** 申込を 1 件作る。`customerId` を渡さないとゲスト（Customer 未解決）になる。 */
async function createRegistration(input: {
  email: string;
  customerId?: string;
}): Promise<string> {
  const row = await prisma.eventRegistration.create({
    data: {
      eventId,
      slotId,
      ticketId,
      name: "山田太郎",
      email: input.email,
      quantity: 1,
      status: RegistrationStatus.CONFIRMED,
      ...(input.customerId !== undefined && { customerId: input.customerId }),
    },
    select: { id: true },
  });
  return row.id;
}

async function createCustomer(input: {
  email: string;
  marketingOptIn: boolean;
}): Promise<string> {
  const row = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: input.email,
      emailCanonical: input.email,
      marketingOptIn: input.marketingOptIn,
    },
    select: { id: true },
  });
  createdCustomerIds.push(row.id);
  return row.id;
}

describeMaybe("イベント一斉配信は配信停止を守る", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ getEventBroadcastPayload } =
      await import("@/shared/domain/events/email-queries"));
    ({ getEventBroadcastRecipientCounts } =
      await import("@/shared/domain/events/registration-queries"));

    const suffix = crypto.randomUUID();
    const category = await prisma.eventCategory.create({
      data: {
        name: `Broadcast OptOut Category ${suffix}`,
        sortOrder: 50_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    categoryId = category.id;

    const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const created = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          title: `Broadcast OptOut ${suffix}`,
          slug: `broadcast-optout-${suffix}`,
          descriptionJson: {},
          descriptionHtml: "",
          descriptionPlainText: "",
          status: "PUBLISHED",
          scheduleMode: "SINGLE_OCCURRENCE",
          categoryId,
          firstSlotStartAt: start,
          lastSlotEndAt: new Date(start.getTime() + 60 * 60 * 1000),
        },
        select: { id: true },
      });
      const slot = await tx.eventTimeSlot.create({
        data: {
          eventId: event.id,
          startAt: start,
          endAt: new Date(start.getTime() + 60 * 60 * 1000),
          capacity: 100,
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
    eventId = created.eventId;
    slotId = created.slotId;
    ticketId = created.ticketId;
  });

  afterAll(async () => {
    await prisma.eventRegistration.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.eventCategory.deleteMany({ where: { id: categoryId } });
    await prisma.customer.deleteMany({
      where: { id: { in: createdCustomerIds } },
    });
    await prisma.$disconnect();
  });

  test("optIn=true の顧客だけが宛先に入る", async () => {
    const suffix = crypto.randomUUID();
    const optedIn = `optin-${suffix}@example.com`;
    const optedOut = `optout-${suffix}@example.com`;

    const optedInId = await createCustomer({
      email: optedIn,
      marketingOptIn: true,
    });
    const optedOutId = await createCustomer({
      email: optedOut,
      marketingOptIn: false,
    });
    const keptId = await createRegistration({
      email: optedIn,
      customerId: optedInId,
    });
    const droppedId = await createRegistration({
      email: optedOut,
      customerId: optedOutId,
    });

    const payload = await getEventBroadcastPayload(eventId);
    const counts = await getEventBroadcastRecipientCounts(eventId);

    expect(payload).not.toBeNull();
    if (!payload) return;

    const recipientIds = payload.recipients.map((r) => r.id);

    expect(recipientIds).toContain(keptId);
    // ここに入るのが F-45。配信停止を押した相手に、また届く。
    expect(recipientIds).not.toContain(droppedId);
    expect(payload.skipped).toBe(1);
    // UI 人数は送信 payload と同じ集合。別 Prisma count だと
    // eligible=2（CONFIRMED + email）と recipients=1（opt-in のみ）が drift する。
    expect(counts.eligible).toBe(payload.recipients.length);
    expect(counts.skipped).toBe(payload.skipped);
  });

  test("customerId が null でも email から解決して optOut を守る", async () => {
    const suffix = crypto.randomUUID();
    const email = `guest-optout-${suffix}@example.com`;
    await createCustomer({ email, marketingOptIn: false });
    const registrationId = await createRegistration({ email });

    const payload = await getEventBroadcastPayload(eventId);

    expect(payload?.recipients.map((r) => r.id)).not.toContain(registrationId);
  });

  test("Customer に解決できないゲストには送らない", async () => {
    // unsubscribe URL を出せない = 押されても記録できない。
    // 守れない配信停止を提示しないため、宛先から外す。
    const suffix = crypto.randomUUID();
    const registrationId = await createRegistration({
      email: `walkin-${suffix}@example.com`,
    });

    const payload = await getEventBroadcastPayload(eventId);

    expect(payload?.recipients.map((r) => r.id)).not.toContain(registrationId);
  });
});
