/**
 * イベント参加申込キャンセル → waitlist FIFO 自動昇格 → 繰り上げ当選メール送信、の
 * 一気通貫統合テスト（実 DB 必須）。
 *
 * **このテストが守る不変条件（final review Critical #1）**:
 *   `applyEventRegistrationCancellation`（Task 4）が同一 tx 内で
 *   `offerNextWaitlistEntryCommand` を呼んで FIFO 先頭の WAITLISTED を
 *   WAITLISTED_OFFERED に昇格させても、`registration-cancellation-side-effects.ts`
 *   がその `promoted` 結果を消費せず `sendEventWaitlistOffered` を送っていなかった
 *   （cron の自動昇格・admin の手動昇格は送るのに、cancel 駆動の自動昇格だけ
 *   送らない片手落ち）。個別タスクレビューでは各タスクの担当範囲内で正しく見えて
 *   しまい、この「3 つの cancel 経路すべてが convergence point の新フィールドを
 *   渡し忘れる」というオーケストレーション欠落は whole-branch review でのみ検出
 *   された。本テストは 3 経路のうち mypage 経路（`cancelEventRegistration`）を
 *   代表として実 DB + 実ドメイン層で end-to-end に検証する。
 *
 * Turnstile/rate-limit/customer-auth/cache/既存 3 種のメール（キャンセル確認・
 * 管理者通知・in-app 通知）/監査ログは `event-waitlist-register.test.ts` /
 * `mypage-event-registration.test.ts` と同型の境界 mock でバイパスする。
 * ドメイン層（registration-commands.ts → registration-cancel-core.ts →
 * waitlist-commands.ts → registration-cancellation-side-effects.ts →
 * waitlist-queries.ts）は一切 mock せず実 Postgres に対して実行する
 * （advisory lock による FIFO 昇格・atomic claim は mock では再現不能）。
 *
 * == 実行条件 ==
 *   ローカル: bun run test:integration
 *   CI: unit-tests job が postgres service + prisma migrate deploy 済みのため自動実行。
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  mock,
} from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す（静的 import は gateway を引かないため、
// この代入は動的 import より先に実行される）。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// =============================================================================
// モック設定（import より前に配置。event-waitlist-register.test.ts と同型）
// =============================================================================

mock.module("server-only", () => ({}));

mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: () => Promise.resolve({ success: true as const }),
  validateTurnstile: () => Promise.resolve({ success: true as const }),
  checkBotHeuristics: () => ({ success: true as const }),
  checkEmailRateLimit: () => Promise.resolve({ success: true as const }),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
  eventRegistrationSubmitRateLimiter: {},
  eventRegistrationByEmailRateLimiter: {},
  eventWaitlistRegistrationSubmitRateLimiter: {},
  eventWaitlistRegistrationByEmailRateLimiter: {},
  getClientIpFromHeaders: () => Promise.resolve("127.0.0.1"),
}));

const mockGetCustomerSession = mock<
  () => Promise<{ user: { id: string } } | null>
>(() => Promise.resolve(null));
mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetCustomerSession,
}));

const mockGetCustomerByUserId = mock<
  (userId: string) => Promise<{ id: string } | null>
>(() => Promise.resolve(null));
mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mockGetCustomerByUserId,
}));

// 既存 3 種の副作用（キャンセル確認メール・管理者通知メール）は実
// registration-cancellation-side-effects.ts から実際に呼ばれるが、本テストの
// 対象ではないため no-op 化する（Resend への実送信を避ける）。
mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventRegistrationCancelled: () => Promise.resolve({ ok: true }),
  sendEventAdminNotification: () => Promise.resolve({ ok: true }),
  // registerForEvent（同一ファイル、本テストでは未使用）が top-level import する。
  sendEventRegistrationConfirmation: () =>
    Promise.reject(new Error("not used in this test")),
}));

// 繰り上げ当選メール（本テストの主たる検証対象）。
const mockSendEventWaitlistOffered = mock<
  (args: {
    registrationId: string;
    to: string;
    expiresAt: Date;
    paymentContext:
      | { kind: "free"; confirmUrl: string }
      | { kind: "paid"; checkoutUrl: string; price: number };
  }) => Promise<{ ok: boolean }>
>(() => Promise.resolve({ ok: true }));
mock.module("@/shared/lib/email/event-waitlist-emails", () => ({
  sendEventWaitlistOffered: mockSendEventWaitlistOffered,
  // registerForEventWaitlist（同一ファイル、本テストでは未使用）が
  // top-level import する。
  sendEventWaitlistRegistered: () =>
    Promise.reject(new Error("not used in this test")),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: () => Promise.resolve(),
}));

// AuditLog の hash chain 整合性はこのテストの対象外（audit-log 系の別テストが
// カバー済み）。cancel 副作用の 1 つとして実際に呼ばれるが no-op 化する。
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: () => Promise.resolve(),
}));

// errors/server.ts はドメイン層の広い範囲（safeFetch/criticalFetch 含む）から
// 参照される barrel module のため、部分的な mock factory を書くと「本テストの
// 呼び出し経路が使わない export」を静的 import している未知の到達ファイルで
// `Export named 'X' not found` の SyntaxError になる（実測済み）。real module を
// spread して `logError` だけ差し替える（他の export は全部本物のまま）。
const realErrorsServer = await import("@/shared/lib/errors/server");
const mockLogError = mock<(error: unknown, opts?: unknown) => void>(
  () => undefined,
);
mock.module("@/shared/lib/errors/server", () => ({
  ...realErrorsServer,
  logError: (...args: Parameters<typeof mockLogError>) => mockLogError(...args),
}));

// fireAndForget を「発火した Promise を配列に集める」だけの同期的な mock に
// 差し替える。applyEventRegistrationCancellationSideEffects 内の各副作用
// （繰り上げ当選メール送信を含む）は fireAndForget され、呼び出し元
// cancelEventRegistration は完了を待たない。テスト側で
// `await Promise.all(firedPromises)` することで決定的に完了を待ち合わせる
// （event-waitlist-register.test.ts と同じ理由・同じパターン）。
let firedPromises: Promise<unknown>[] = [];
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    firedPromises.push(promise.catch(() => undefined));
  },
}));

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: () => undefined,
}));

// invalidateSiteWideCache は registerForEventWaitlist（同一ファイル、本テストでは
// 未使用）向け。cancelEventRegistration は next/cache の updateTag を直接呼ぶため
// 別途 next/cache も mock する。
mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCache: () => undefined,
  invalidateSiteWideCacheFromRouteHandler: () => undefined,
}));

mock.module("next/cache", () => ({
  updateTag: () => undefined,
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  revalidateTag: () => undefined,
}));

mock.module("next/headers", () => ({
  headers: () =>
    Promise.resolve(new Headers({ "x-forwarded-for": "127.0.0.1" })),
  cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

// =============================================================================
// 動的 import の型（gateway / action を実行時に読み込む）
// =============================================================================

type PrismaModule = typeof import("@/shared/db/prisma");
type ActionsModule =
  typeof import("@/app/(public)/_shared/actions/event-registration");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let cancelEventRegistration: ActionsModule["cancelEventRegistration"];

// =============================================================================
// テストヘルパー
// =============================================================================

/** PUBLISHED イベント + タイムスロット(capacity=1) + 無料チケットを 1 件作る。 */
async function createTestEvent(): Promise<{
  eventId: string;
  slotId: string;
  ticketId: string;
}> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: "Cancel Promotes Waitlist Test",
        slug: `cancel-promotes-waitlist-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: start,
        lastSlotEndAt: end,
      },
      select: { id: true },
    });

    const slot = await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt: start,
        endAt: end,
        capacity: 1,
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

async function cleanupEvent(eventId: string): Promise<void> {
  await prisma.eventRegistration.deleteMany({ where: { eventId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
}

/**
 * `EventRegistration.customerId` は Customer への FK（onDelete: SetNull）のため、
 * customerId を持つ CONFIRMED 申込を作るには実 Customer 行が必要。User への
 * リンクは不要（getCustomerSession/getCustomerByUserId は本テストで丸ごと mock
 * し、実際に DB を読まない）。
 */
async function createGuestCustomer(suffix: string) {
  const email = `cancel-promote-customer-${suffix}-${crypto.randomUUID()}@example.com`;
  return prisma.customer.create({
    data: {
      lastName: "会員",
      firstName: "太郎",
      email,
      emailCanonical: email,
    },
    select: { id: true },
  });
}

describeMaybe(
  "cancelEventRegistration が waitlist を自動昇格させる（実 DB）",
  () => {
    beforeAll(async () => {
      ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
      ({ cancelEventRegistration } =
        await import("@/app/(public)/_shared/actions/event-registration"));
      await prisma.$queryRaw`SELECT 1`;
    });

    afterAll(async () => {
      await basePrisma.$disconnect();
    });

    beforeEach(() => {
      firedPromises.length = 0;
      mockSendEventWaitlistOffered.mockClear();
      mockLogError.mockClear();
      mockGetCustomerSession.mockReset();
      mockGetCustomerByUserId.mockReset();
    });

    test("満員(cap=1)で CONFIRMED を cancel すると WAITLISTED が WAITLISTED_OFFERED に昇格し、sendEventWaitlistOffered が 1 回呼ばれる", async () => {
      const { eventId, slotId, ticketId } = await createTestEvent();
      const customer = await createGuestCustomer("happy-path");

      try {
        const confirmed = await prisma.eventRegistration.create({
          data: {
            eventId,
            slotId,
            ticketId,
            name: "確定 太郎",
            email: "confirmed-member@example.com",
            quantity: 1,
            status: RegistrationStatus.CONFIRMED,
            customerId: customer.id,
          },
          select: { id: true },
        });

        const waitlistEmail = `waiting-${crypto.randomUUID()}@example.com`;
        const waitlisted = await prisma.eventRegistration.create({
          data: {
            eventId,
            slotId,
            ticketId,
            name: "待機 花子",
            email: waitlistEmail,
            quantity: 1,
            status: RegistrationStatus.WAITLISTED,
            waitlistedAt: new Date(Date.now() - 60 * 60 * 1000),
          },
          select: { id: true },
        });

        mockGetCustomerSession.mockResolvedValue({
          user: { id: "user-under-test" },
        });
        mockGetCustomerByUserId.mockResolvedValue({ id: customer.id });

        const result = await cancelEventRegistration(
          confirmed.id,
          "turnstile-token",
        );
        expect(result).toBeNull();

        // applyEventRegistrationCancellationSideEffects 内の fireAndForget（繰り上げ
        // 当選メール送信を含む）が完了するまで待つ。
        await Promise.all(firedPromises);

        const updatedConfirmed =
          await prisma.eventRegistration.findUniqueOrThrow({
            where: { id: confirmed.id },
            select: { status: true },
          });
        expect(updatedConfirmed.status).toBe(RegistrationStatus.CANCELLED);

        const updatedWaitlisted =
          await prisma.eventRegistration.findUniqueOrThrow({
            where: { id: waitlisted.id },
            select: { status: true, offeredAt: true, expiresAt: true },
          });
        expect(updatedWaitlisted.status).toBe(
          RegistrationStatus.WAITLISTED_OFFERED,
        );
        expect(updatedWaitlisted.offeredAt).toBeInstanceOf(Date);
        expect(updatedWaitlisted.expiresAt).toBeInstanceOf(Date);

        expect(mockSendEventWaitlistOffered).toHaveBeenCalledTimes(1);
        expect(mockSendEventWaitlistOffered).toHaveBeenCalledWith(
          expect.objectContaining({
            registrationId: waitlisted.id,
            to: waitlistEmail,
            expiresAt: updatedWaitlisted.expiresAt,
            paymentContext: expect.objectContaining({ kind: "free" }),
          }),
        );
      } finally {
        await cleanupEvent(eventId);
        await prisma.customer.deleteMany({ where: { id: customer.id } });
      }
    }, 30_000);

    test("waitlist キューが空のまま cancel しても sendEventWaitlistOffered は呼ばれない（誤発火防止の回帰ガード）", async () => {
      const { eventId, slotId, ticketId } = await createTestEvent();
      const customer = await createGuestCustomer("no-waitlist");

      try {
        const confirmed = await prisma.eventRegistration.create({
          data: {
            eventId,
            slotId,
            ticketId,
            name: "確定 次郎",
            email: "confirmed-solo@example.com",
            quantity: 1,
            status: RegistrationStatus.CONFIRMED,
            customerId: customer.id,
          },
          select: { id: true },
        });

        mockGetCustomerSession.mockResolvedValue({
          user: { id: "user-under-test" },
        });
        mockGetCustomerByUserId.mockResolvedValue({ id: customer.id });

        const result = await cancelEventRegistration(
          confirmed.id,
          "turnstile-token",
        );
        expect(result).toBeNull();

        await Promise.all(firedPromises);

        const updatedConfirmed =
          await prisma.eventRegistration.findUniqueOrThrow({
            where: { id: confirmed.id },
            select: { status: true },
          });
        expect(updatedConfirmed.status).toBe(RegistrationStatus.CANCELLED);

        expect(mockSendEventWaitlistOffered).not.toHaveBeenCalled();
      } finally {
        await cleanupEvent(eventId);
        await prisma.customer.deleteMany({ where: { id: customer.id } });
      }
    }, 30_000);
  },
);
