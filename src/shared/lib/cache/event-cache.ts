import "server-only";

import { updateTag } from "next/cache";

import { CACHE_TAGS } from "@/shared/lib/constants";

/**
 * イベント関連キャッシュを無効化する。
 *
 * イベント公開ページ（一覧・詳細）の cacheTag は collection タグ
 * `CACHE_TAGS.EVENTS` 一つのため、これだけで全イベントページが更新される。
 */
export function invalidateEventCaches(): void {
  updateTag(CACHE_TAGS.EVENTS);
}
