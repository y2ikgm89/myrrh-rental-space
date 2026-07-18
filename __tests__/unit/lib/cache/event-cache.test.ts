import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { CDN_CACHE_TAGS } from "@/shared/lib/constants/cdn-cache-tags";

const updateTagMock = mock<(tag: string) => void>(() => {});
const queueTagPurgeMock = mock<(...tags: readonly string[]) => void>(() => {});
const actualNextCache = await import("next/cache");
mock.module("next/cache", () => ({
  ...actualNextCache,
  updateTag: updateTagMock,
  cacheLife: mock(() => undefined),
  cacheTag: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));
mock.module("@/shared/lib/cache/batcher", () => ({
  queueTagPurge: queueTagPurgeMock,
  withPurgeBatch: async <T>(fn: () => Promise<T>) => fn(),
}));

const { invalidateEventCaches } =
  await import("@/shared/lib/cache/event-cache");

describe("invalidateEventCaches", () => {
  beforeEach(() => {
    updateTagMock.mockClear();
    queueTagPurgeMock.mockClear();
  });

  test("EVENTS collection タグを updateTag で無効化する", () => {
    invalidateEventCaches();

    // イベント公開ページ（一覧・詳細）の唯一の cacheTag が EVENTS のため、
    // これ一つで全イベントページが更新される。
    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.EVENTS);
    expect(updateTagMock).toHaveBeenCalledTimes(1);
  });

  test("Cloudflare CDN の event-v1 と sitemap-v1 も purge queue に載せる (CACHE-INVALIDATE-04)", () => {
    // 従来は updateTag のみで Cloudflare edge に伝播せず、`/events/:path*` に emit
    // された `event-v1` Cache-Tag が最大 s-maxage=3600 秒 stale で配信されていた。
    // invalidateSiteWideCache 経由に切り替えたため、CDN 側の tag purge も併発する
    // ことを検証する (sitemap は全 site-wide invalidation で常時 co-purge される)。
    invalidateEventCaches();

    expect(queueTagPurgeMock).toHaveBeenCalledTimes(1);
    expect(queueTagPurgeMock).toHaveBeenCalledWith(
      CDN_CACHE_TAGS.EVENT,
      CDN_CACHE_TAGS.SITEMAP,
    );
  });
});
