import "server-only";

import { updateTag } from "next/cache";

import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

type InvalidateEventCachesOptions = {
  readonly registrations?: boolean;
  readonly notifications?: boolean;
  /**
   * rename 前の slug。指定かつ現 slug と異なる場合、旧 slug の詳細タグも
   * 明示的に無効化する（旧 URL のキャッシュを確実に破棄）。
   */
  readonly previousSlug?: string | null;
};

export function invalidateEventCaches(
  id: string,
  slug: string | null | undefined,
  options: InvalidateEventCachesOptions = {},
): void {
  updateTag(CACHE_TAGS.EVENTS);
  updateTag(getCacheTag.events.detail(id));
  if (slug) {
    updateTag(getCacheTag.events.slug(slug));
  }
  if (options.previousSlug && options.previousSlug !== slug) {
    updateTag(getCacheTag.events.slug(options.previousSlug));
  }
  if (options.registrations) {
    updateTag(getCacheTag.eventRegistrations.list(id));
  }
  if (options.notifications) {
    updateTag(CACHE_TAGS.NOTIFICATIONS);
  }
}
