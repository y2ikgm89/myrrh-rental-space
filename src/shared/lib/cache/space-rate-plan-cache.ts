import "server-only";

import { updateTag } from "next/cache";

import { CACHE_TAGS } from "@/shared/lib/constants";

/**
 * 指定 Space の rate plan キャッシュを無効化する。
 *
 * `getSpaceRatePlans`（rate-plan-queries.ts）が貼る id-keyed タグ
 * `CACHE_TAGS.SPACE_RATE_PLANS(spaceId)` のみを無効化する。予約ドメインの
 * invalidation（`reservation-cache.ts`）には寄せない — rate plan は
 * Space の付随設定であり、予約が rate plan の無効化を駆動する向きの
 * 依存を作ると domain 境界が逆流するため、専用ファイルに分離する。
 *
 * Server Action 経由の呼び出しのみ想定（`updateTag` は Route Handler で throw する。
 * cron / webhook から呼ぶ必要が生じたら `revalidateTag(tag, { expire: 0 })` を使う
 * 専用バリアントを追加する）。
 */
export function invalidateSpaceRatePlansCache(spaceId: string): void {
  updateTag(CACHE_TAGS.SPACE_RATE_PLANS(spaceId));
}
