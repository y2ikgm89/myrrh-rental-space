import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import type { SpaceRatePlanForResolver } from "@/shared/lib/pricing/rate-plan-resolver";

/**
 * 指定 Space に紐づく rate plan 一覧を取得する。
 *
 * `resolveRateBreakdown`（rate-plan-resolver.ts）の last-updated-wins 優先度判定は
 * 呼び出し側の純粋関数が行うため、ここでは `updatedAt DESC` で安定した並び順を
 * 返すのみ（判定ロジックは持たない）。
 *
 * 予約コマンド（Task 8）の価格計算・admin 編集ページ（Task 12）の両方から
 * 呼ばれる。DB エラー時に `[]` へフォールバックすると「rate plan 無し」と
 * 誤認され space の基本料金で誤計算されるため、`safeFetch` は使わず
 * エラーをそのまま呼び出し側へ伝播させる。
 */
export async function getSpaceRatePlans(
  spaceId: string,
): Promise<SpaceRatePlanForResolver[]> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACE_RATE_PLANS(spaceId));

  const rows = await prisma.spaceRatePlan.findMany({
    where: { spaceId },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    hourlyPrice: r.hourlyPrice,
    daysOfWeek: r.daysOfWeek,
    holidayMode: r.holidayMode,
    startTime: r.startTime,
    endTime: r.endTime,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    updatedAt: r.updatedAt,
  }));
}
