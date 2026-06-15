import "server-only";

import { updateTag } from "next/cache";

import { CACHE_TAGS } from "@/shared/lib/constants";

type InvalidateEventCachesOptions = {
  readonly notifications?: boolean;
};

/**
 * イベント関連キャッシュを無効化する。
 *
 * イベント公開ページ（一覧・詳細）の cacheTag は collection タグ
 * `CACHE_TAGS.EVENTS` 一つのため、これだけで全イベントページが更新される。
 * `notifications` 指定時は管理通知キャッシュも併せて無効化する。
 */
export function invalidateEventCaches(
  options: InvalidateEventCachesOptions = {},
): void {
  updateTag(CACHE_TAGS.EVENTS);
  if (options.notifications) {
    updateTag(CACHE_TAGS.NOTIFICATIONS);
  }
}
