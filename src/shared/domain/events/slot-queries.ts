import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { RegistrationStatus } from "@generated/prisma/enums";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

export type SlotWithCount = {
  id: string;
  startAt: Date;
  endAt: Date;
  capacity: number;
  confirmedCount: number;
  remaining: number;
  isSoldOut: boolean;
};

/**
 * イベントのスロット一覧をキャッシュ付きで取得（スロット metadata のみ）。
 * 在庫カウントは含まない。公開ページのレイアウト/JSON-LD 用。
 */
export async function getSlotsByEventId(eventId: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.EVENTS);

  return safeFetch({
    fetch: () =>
      prisma.eventTimeSlot.findMany({
        where: { eventId },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          capacity: true,
        },
        orderBy: { startAt: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getSlotsByEventId",
  });
}

/**
 * イベントの全スロット在庫カウントを非キャッシュで取得。
 *
 * CONFIRMED 申込の quantity 合計を slot 単位で集計する。
 * リアルタイム在庫表示用のため `'use cache'` を使わない。
 * 呼び出し側は `Suspense + await connection()` で隔離すること。
 */
export async function getSlotRegistrationCounts(
  eventId: string,
): Promise<SlotWithCount[]> {
  const slots = await prisma.eventTimeSlot.findMany({
    where: { eventId },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      capacity: true,
      registrations: {
        where: { status: RegistrationStatus.CONFIRMED },
        select: { quantity: true },
      },
    },
    orderBy: { startAt: "asc" },
  });

  return slots.map((slot) => {
    const confirmedCount = slot.registrations.reduce(
      (sum, r) => sum + r.quantity,
      0,
    );
    const remaining = Math.max(0, slot.capacity - confirmedCount);
    return {
      id: slot.id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      capacity: slot.capacity,
      confirmedCount,
      remaining,
      isSoldOut: remaining <= 0,
    };
  });
}

/**
 * 管理画面用: イベントの全スロットを申込件数付きで取得（非キャッシュ）。
 */
export async function getAdminSlotsByEventId(eventId: string) {
  const slots = await prisma.eventTimeSlot.findMany({
    where: { eventId },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      capacity: true,
      googleCalendarEventId: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { registrations: true } },
    },
    orderBy: { startAt: "asc" },
  });

  return slots.map((s) => ({
    ...s,
    registrationCount: s._count.registrations,
  }));
}
