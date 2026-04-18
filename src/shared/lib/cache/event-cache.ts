import "server-only";

import { updateTag } from "next/cache";

import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

type InvalidateEventCachesOptions = {
  readonly registrations?: boolean;
  readonly notifications?: boolean;
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
  if (options.registrations) {
    updateTag(getCacheTag.eventRegistrations.list(id));
  }
  if (options.notifications) {
    updateTag(CACHE_TAGS.NOTIFICATIONS);
  }
}
