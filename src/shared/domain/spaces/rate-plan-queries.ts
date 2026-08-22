import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { SpaceRatePlanForResolver } from "@/shared/lib/pricing/rate-plan-resolver";

/**
 * 指定 Space に紐づく rate plan 一覧を取得する。
 *
 * `resolveRateBreakdown`（rate-plan-resolver.ts）の last-updated-wins 優先度判定は
 * 呼び出し側の純粋関数が行うため、ここでは `updatedAt DESC` で安定した並び順を
 * 返すのみ（判定ロジックは持たない）。
 *
 * DB エラー時に `[]` へフォールバックすると「rate plan 無し」と誤認され space の
 * 基本料金で誤計算されるため、`safeFetch` は使わずエラーをそのまま伝播させる。
 *
 * ## `"use cache"` を付けない（監査 A-02）
 *
 * この関数の戻り値は**実際に課金する金額**を決める。呼出 8 箇所のうち 7 箇所が
 * 予約の作成・変更・見積（`public-commands` / `admin-commands` / `customer-commands` /
 * `series-commands` / `calendar-sync-inbound-mutations` / `pricing-preview`）で、
 * 表示専用は admin のスペース編集ページ 1 枚だけ。
 *
 * admin と public は**別の Cloud Run サービス**で、既定キャッシュハンドラは
 * プロセス内メモリ（共有 cacheHandler は未配線）。つまり admin 側の書込が撃つ
 * `updateTag` は public コンテナに一切届かない。以前はここに
 * `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)`（= `hours` プロファイル、revalidate 3600）が
 * 付いていたため、**管理画面で料金プランを変えても公開予約は最大 1 時間 旧価格で
 * 確定していた**。
 *
 * 同じ理由で uncached にしている先例が `settings/queries/tax-rate-snapshot.ts`。
 *
 * コストは `@@index([spaceId, updatedAt(sort: Desc)])`（schema.prisma）に乗る
 * 1 クエリで、`pricing-preview.ts` は元から `space.findUnique` と
 * `getReservationSettings()` を同じ `Promise.all` で未キャッシュ実行している。
 *
 * 回帰防止: `__tests__/unit/architecture-boundaries.test.ts` の
 * 「rate plan の読み取りはキャッシュしない」テスト。
 */
export async function getSpaceRatePlans(
  spaceId: string,
): Promise<SpaceRatePlanForResolver[]> {
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
