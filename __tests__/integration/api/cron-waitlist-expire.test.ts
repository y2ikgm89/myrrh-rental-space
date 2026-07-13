/**
 * `/api/cron/waitlist-expire` の実 Postgres 統合テスト。
 *
 * **このテストが守る不変条件**:
 *   1. 期限切れ（`expiresAt < now`）の WAITLISTED_OFFERED が atomic claim で
 *      実 Postgres 上でも確実に EXPIRED へ遷移する。
 *   2. 同じ (slotId, ticketId) の FIFO 先頭（`waitlistedAt` 最古）の WAITLISTED が
 *      WAITLISTED_OFFERED（offeredAt 設定・expiresAt = offeredAt + 24h）に昇格する。
 *   3. advisory session lock (728354) の acquire/release が単一 $transaction 内で
 *      完結し、cron route の JSON response body が実際の処理件数と一致する。
 *
 * OIDC 認可 / feature gate / next/cache invalidation は本テストの対象外（各々
 * `cron-auth-oidc.test.ts` / 他の real-DB 統合テストと同じ境界 mock パターンで
 * バイパスする。next/cache の updateTag/revalidateTag は Next.js request store 外
 * だと throw するため、site-wide.ts の唯一の cache-invalidation entry point を
 * 差し替える — google-calendar.test.ts と同型、PR #945 の判断を踏襲）。
 *
 * == 実行条件 ==
 *   ローカル: bun run test:integration
 *   CI: unit-tests job が postgres service + prisma migrate deploy 済みのため自動実行。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";
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

// cron 認可はこのテストの対象外（実 Google OIDC 検証は cron-auth-oidc.test.ts が
// カバー済み）。route.ts が呼ぶ形のまま丸ごとバイパスする。
mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: () => Promise.resolve(null),
}));

// feature gate も同様にバイパスする。実装は 'use cache' 付きの Settings 読取りを
// 経由するが、この real-DB テストは advisory lock / FIFO promote の実 Postgres
// 挙動検証が目的でテスト DB の Settings シーディングとは無関係なため、
// registration-overbooking.test.ts と同じ mock パターンで gate 自体をバイパスする。
mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: () => Promise.resolve(true),
}));

// 境界 mock: route.ts が使う唯一の cache-invalidation entry point を差し替える。
// これで next/cache (updateTag / revalidateTag)・firePurgeAsync・CDN tag purge の
// 全下位実装が touch されない（Next.js request store 外での revalidateTag は throw する）。
const mockInvalidateSiteWideCacheFromRouteHandler = mock<
  (tags: readonly string[]) => void
>(() => undefined);
mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler:
    mockInvalidateSiteWideCacheFromRouteHandler,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

const mockLogError = mock<() => void>(() => undefined);
mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: Parameters<typeof mockLogError>) => mockLogError(...args),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: { DATABASE: "DATABASE", EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { HIGH: "HIGH", LOW: "LOW" },
}));

// 静的 import (ファイル冒頭) は mock 適用前に評価されるため、real NextResponse を
// そのまま mock factory の中で再 export する（connection のみ差し替える）。
const mockConnection = mock(() => Promise.resolve());
mock.module("next/server", () => ({
  connection: mockConnection,
  NextResponse,
}));

type PrismaModule = typeof import("@/shared/db/prisma");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];

function makeCronRequest(): Request {
  const headers = new Headers();
  headers.set("authorization", "Bearer test-oidc-token");
  return new Request("http://localhost/api/cron/waitlist-expire", {
    headers,
  });
}

/** capacity=1 の PUBLISHED イベント + タイムスロット + 無料チケットを 1 セット作る。 */
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
        title: "Waitlist Expire Cron Test",
        slug: `waitlist-expire-cron-${suffix}`,
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

describeMaybe("GET /api/cron/waitlist-expire — real Postgres", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    // 接続プールをウォームアップ（コールドスタートで初回クエリがブレるのを防ぐ）。
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("期限切れ OFFERED を EXPIRED にし、FIFO 先頭の WAITLISTED を WAITLISTED_OFFERED に昇格する", async () => {
    const { eventId, slotId, ticketId } = await createTestEvent();

    try {
      const nowMs = Date.now();

      // 満員（capacity=1, CONFIRMED 1 件）
      await prisma.eventRegistration.create({
        data: {
          eventId,
          slotId,
          ticketId,
          name: "確定 太郎",
          email: `confirmed-${crypto.randomUUID()}@example.com`,
          quantity: 1,
          status: RegistrationStatus.CONFIRMED,
        },
      });

      // 期限切れ（100ms 前に expiresAt が過ぎた）WAITLISTED_OFFERED
      const offered = await prisma.eventRegistration.create({
        data: {
          eventId,
          slotId,
          ticketId,
          name: "繰上 花子",
          email: `offered-${crypto.randomUUID()}@example.com`,
          quantity: 1,
          status: RegistrationStatus.WAITLISTED_OFFERED,
          offeredAt: new Date(nowMs - 25 * 60 * 60 * 1000),
          expiresAt: new Date(nowMs - 100),
        },
        select: { id: true },
      });

      // FIFO 先頭候補（waitlistedAt が 12h 前）の WAITLISTED
      const waiting = await prisma.eventRegistration.create({
        data: {
          eventId,
          slotId,
          ticketId,
          name: "待機 次郎",
          email: `waiting-${crypto.randomUUID()}@example.com`,
          quantity: 1,
          status: RegistrationStatus.WAITLISTED,
          waitlistedAt: new Date(nowMs - 12 * 60 * 60 * 1000),
        },
        select: { id: true },
      });

      const { GET } = await import("@/app/api/cron/waitlist-expire/route");
      const response = await GET(makeCronRequest());

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ expired: 1, offered: 1 });

      const updatedOffered = await prisma.eventRegistration.findUniqueOrThrow({
        where: { id: offered.id },
        select: { status: true },
      });
      expect(updatedOffered.status).toBe(RegistrationStatus.EXPIRED);

      const updatedWaiting = await prisma.eventRegistration.findUniqueOrThrow({
        where: { id: waiting.id },
        select: { status: true, offeredAt: true, expiresAt: true },
      });
      expect(updatedWaiting.status).toBe(RegistrationStatus.WAITLISTED_OFFERED);
      expect(updatedWaiting.offeredAt).toBeInstanceOf(Date);
      expect(updatedWaiting.expiresAt).toBeInstanceOf(Date);
      if (updatedWaiting.offeredAt && updatedWaiting.expiresAt) {
        const diffMs =
          updatedWaiting.expiresAt.getTime() -
          updatedWaiting.offeredAt.getTime();
        expect(diffMs).toBe(24 * 60 * 60 * 1000);
      }

      expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledWith([
        "events",
      ]);
    } finally {
      await cleanupEvent(eventId);
    }
  }, 30_000);
});
