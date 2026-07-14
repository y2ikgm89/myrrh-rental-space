/**
 * 公開イベント waitlist 登録フォーム Server Action 統合テスト（実 DB 必須）。
 *
 * src/app/(public)/_shared/actions/event-registration.ts の
 * registerForEventWaitlist をテストする。焦点は
 * registerWaitlistEntryCommand（advisory lock 728350 での直列化・
 * CONFLICT 判定・FIFO waitlistedAt）の実 DB 挙動であり、
 * Turnstile/rate-limit/bot-heuristics/terms/customer-auth/email/cache は
 * event-registration.test.ts と同型の mock で経路をバイパスする。
 *
 * == 実行条件 ==
 * registration-overbooking.test.ts と同じく実 Postgres を要求する
 * （advisory lock の直列化挙動は mock では再現不能）。TEST_DATABASE_URL 未設定時は
 * describe ごと skip する。
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";
import { expectSubmissionLike } from "../../../helpers/type-assertions";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す（静的 import は gateway を引かないため、
// この代入は動的 import より先に実行される）。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// =============================================================================
// モック設定（import より前に配置。event-registration.test.ts と同型）
// =============================================================================

const mockValidateTurnstile = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);
const mockCheckActionRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);
const mockCheckBotHeuristics = mock(
  (): { success: boolean; error?: string } => ({ success: true }),
);
const mockCheckEmailRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);

mock.module("@/shared/lib/action-helpers", () => ({
  validateTurnstile: mockValidateTurnstile,
  checkActionRateLimit: mockCheckActionRateLimit,
  checkBotHeuristics: mockCheckBotHeuristics,
  checkEmailRateLimit: mockCheckEmailRateLimit,
}));

mock.module("@/shared/domain/terms/queries", () => ({
  getRequiredTermsByScope: mock(() => Promise.resolve([])),
}));

mock.module("@/shared/domain/terms/commands", () => ({
  recordTermsAgreementsCommand: mock(() => Promise.resolve({ count: 0 })),
}));

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mock(() => Promise.resolve(null)),
}));

mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mock(() => Promise.resolve(null)),
}));

// registerWaitlistEntryCommand は isFeatureEnabled("events") を実際に呼ぶ
// (registration-overbooking.test.ts と同じ理由で bypass する — 'use cache' 付き
// Settings 読取りは advisory lock 直列化の検証と無関係)。
mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: () => Promise.resolve(true),
}));

const mockSendEventWaitlistRegistered = mock(() =>
  Promise.resolve({ ok: true as const }),
);
mock.module("@/shared/lib/email/event-waitlist-emails", () => ({
  sendEventWaitlistRegistered: mockSendEventWaitlistRegistered,
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => {});
  },
}));

// invalidateSiteWideCache は next/cache の updateTag + Cloudflare purge を内部で
// 呼ぶ。テスト環境では CLOUDFLARE_ZONE_ID 等が未設定のため purge 自体は
// silent no-op になるが、next/cache の updateTag は Server Action 実行コンテキスト
// 外（bun test）で呼ぶと throw するため、site-wide モジュール自体を mock する。
mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCache: mock(() => undefined),
  invalidateSiteWideCacheFromRouteHandler: mock(() => undefined),
}));

// 以下は event-registration.ts が同一ファイル内の registerForEvent /
// cancelEventRegistration のために top-level import している依存群。
// registerForEventWaitlist 自体は使わないが、ESM は import されたファイル全体を
// 即座に評価するため、mock しないと実体モジュールが読み込まれる
// （event-emails.ts は footer-data.ts 経由で terms/queries.getFooterTerms を
// 参照し、上の部分的な terms/queries mock と衝突して失敗する — 実体験済み）。
mock.module("@/shared/domain/events/registration-commands", () => ({
  createEventRegistrationCommand: mock(() => Promise.resolve(null)),
  cancelEventRegistrationCommand: mock(() => Promise.resolve(null)),
}));

mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventRegistrationConfirmation: mock(() => Promise.resolve()),
  sendEventAdminNotification: mock(() => Promise.resolve()),
}));

mock.module(
  "@/shared/domain/events/registration-cancellation-side-effects",
  () => ({
    applyEventRegistrationCancellationSideEffects: mock(() =>
      Promise.resolve(),
    ),
  }),
);

mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventRegistrationDetailsForEmail: mock(() => Promise.resolve(null)),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mock(() => Promise.resolve()),
}));

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: mock(() => undefined),
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

mock.module("next/headers", () => ({
  headers: mock(() =>
    Promise.resolve(new Headers({ "x-forwarded-for": "127.0.0.1" })),
  ),
  cookies: mock(() =>
    Promise.resolve({ get: () => undefined, getAll: () => [] }),
  ),
}));

mock.module("server-only", () => ({}));

// =============================================================================
// 動的 import の型（gateway / action を実行時に読み込む）
// =============================================================================

type PrismaModule = typeof import("@/shared/db/prisma");
type ActionsModule =
  typeof import("@/app/(public)/_shared/actions/event-registration");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let registerForEventWaitlist: ActionsModule["registerForEventWaitlist"];

// =============================================================================
// テストヘルパー
// =============================================================================

/** PUBLISHED イベント + タイムスロット + 無料チケットを 1 件作る。confirmedQuantity>0 なら CONFIRMED 申込を先に埋める。 */
async function createTestEvent(opts: {
  slotCapacity: number;
  confirmedQuantity: number;
}): Promise<{ eventId: string; ticketId: string; slotId: string }> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: "Waitlist Register Test",
        slug: `waitlist-register-test-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        // 本番不変条件 (PUBLISHED + slot あり → 非 NULL) に整合させるため明示注入
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
        capacity: opts.slotCapacity,
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

    if (opts.confirmedQuantity > 0) {
      await tx.eventRegistration.create({
        data: {
          eventId: event.id,
          slotId: slot.id,
          ticketId: ticket.id,
          name: "既存参加者",
          email: `existing-${suffix}@example.com`,
          quantity: opts.confirmedQuantity,
          status: RegistrationStatus.CONFIRMED,
        },
      });
    }

    return { eventId: event.id, ticketId: ticket.id, slotId: slot.id };
  });
}

/** テストイベントとその子レコードを削除する（restrict 回避のため順序固定）。 */
async function cleanupEvent(eventId: string): Promise<void> {
  await prisma.eventRegistration.deleteMany({ where: { eventId } });
  await prisma.eventTicket.deleteMany({ where: { eventId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
}

function buildFormData(input: {
  eventId: string;
  slotId: string;
  ticketId: string;
  email: string;
  quantity?: number;
}): FormData {
  const fd = new FormData();
  fd.append("eventId", input.eventId);
  fd.append("slotId", input.slotId);
  fd.append("ticketId", input.ticketId);
  fd.append("name", "テスト太郎");
  fd.append("email", input.email);
  fd.append("quantity", String(input.quantity ?? 1));
  fd.append("turnstileToken", "test-token-valid");
  return fd;
}

async function registerConcurrently(
  base: { eventId: string; slotId: string; ticketId: string },
  count: number,
  emailPrefix: string,
): Promise<Awaited<ReturnType<typeof registerForEventWaitlist>>[]> {
  return Promise.all(
    Array.from({ length: count }, (_unused, i) =>
      registerForEventWaitlist(
        undefined,
        buildFormData({
          ...base,
          email: `${emailPrefix}-${String(i)}@example.com`,
        }),
      ),
    ),
  );
}

// =============================================================================
// テスト本体
// =============================================================================

describeMaybe("registerForEventWaitlist（実 DB）", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ registerForEventWaitlist } =
      await import("@/app/(public)/_shared/actions/event-registration"));

    // 初回並行バーストのウォームアップ（registration-overbooking.test.ts と同方針。
    // cold connection では並行性が偶発的に直列化して隠れるため、本体テスト前に
    // 満員イベントへの waitlist 登録を並行実行して経路を温めておく）。
    const warmup = await createTestEvent({
      slotCapacity: 1,
      confirmedQuantity: 1,
    });
    await registerConcurrently(warmup, 3, "warmup");
    await cleanupEvent(warmup.eventId);
  });

  afterAll(async () => {
    // 実 DB 接続をクローズしてサブプロセスをハングさせない。
    await basePrisma.$disconnect();
  });

  test("満員イベントで registerForEventWaitlist → WAITLISTED 登録 + waitlistedAt 設定", async () => {
    const { eventId, slotId, ticketId } = await createTestEvent({
      slotCapacity: 1,
      confirmedQuantity: 1,
    });

    try {
      const email = "waitlist-success@example.com";
      const result = await registerForEventWaitlist(
        undefined,
        buildFormData({ eventId, slotId, ticketId, email }),
      );
      expectSubmissionLike(result);
      // 成功時は resetForm: true → { initialValue: null }
      expect(result.initialValue).toBeNull();

      const rows = await prisma.eventRegistration.findMany({
        where: { eventId, email },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe(RegistrationStatus.WAITLISTED);
      expect(rows[0]?.waitlistedAt).not.toBeNull();
    } finally {
      await cleanupEvent(eventId);
    }
  }, 30_000);

  test("定員残ありの状態で registerForEventWaitlist → CONFLICT エラーで拒否", async () => {
    const { eventId, slotId, ticketId } = await createTestEvent({
      slotCapacity: 5,
      confirmedQuantity: 0,
    });

    try {
      const email = "waitlist-conflict@example.com";
      const result = await registerForEventWaitlist(
        undefined,
        buildFormData({ eventId, slotId, ticketId, email }),
      );
      expectSubmissionLike(result);
      expect(result.status).toBe("error");
      const formErrors = result.error?.[""];
      expect(formErrors?.[0]).toContain("空きがあります");

      // CONFLICT は登録前に throw されるため EventRegistration 行は作られない
      const rows = await prisma.eventRegistration.findMany({
        where: { eventId, email },
      });
      expect(rows).toHaveLength(0);
    } finally {
      await cleanupEvent(eventId);
    }
  }, 30_000);

  test("並行 registerForEventWaitlist 5本 → 全成功、waitlistedAt が異なる（FIFO 保証）", async () => {
    const { eventId, slotId, ticketId } = await createTestEvent({
      slotCapacity: 1,
      confirmedQuantity: 1,
    });
    const CONCURRENCY = 5;

    try {
      const results = await registerConcurrently(
        { eventId, slotId, ticketId },
        CONCURRENCY,
        "fifo",
      );

      for (const result of results) {
        expectSubmissionLike(result);
        expect(result.initialValue).toBeNull();
      }

      const rows = await prisma.eventRegistration.findMany({
        where: { eventId, status: RegistrationStatus.WAITLISTED },
        select: { waitlistedAt: true },
      });
      expect(rows).toHaveLength(CONCURRENCY);

      const timestamps = rows.map((r) => r.waitlistedAt?.getTime());
      expect(timestamps.every((t) => t !== undefined)).toBe(true);

      // advisory lock 728350 による直列化で FIFO ordering key (waitlistedAt) が
      // 一意になることを検証する（同時 create でも同一ミリ秒に衝突しない）。
      const distinctTimestamps = new Set(timestamps);
      expect(distinctTimestamps.size).toBe(CONCURRENCY);
    } finally {
      await cleanupEvent(eventId);
    }
  }, 30_000);
});
