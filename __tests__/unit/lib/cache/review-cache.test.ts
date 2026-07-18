import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
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

const { invalidateReviewCaches } =
  await import("@/shared/lib/cache/review-cache");

const SPACE_ID = "space-1";
const SPACE_SLUG = "studio-a";
const CUSTOMER_ID = "cust-1";

describe("invalidateReviewCaches", () => {
  beforeEach(() => {
    updateTagMock.mockClear();
    queueTagPurgeMock.mockClear();
  });

  test("基本: REVIEWS + space/stats + SPACES を無効化する（slug なし）", () => {
    invalidateReviewCaches(SPACE_ID, null);

    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.REVIEWS);
    expect(updateTagMock).toHaveBeenCalledWith(
      getCacheTag.reviews.space(SPACE_ID),
    );
    expect(updateTagMock).toHaveBeenCalledWith(
      getCacheTag.reviews.stats(SPACE_ID),
    );
    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.SPACES);
    expect(updateTagMock).toHaveBeenCalledTimes(4);
  });

  test("spaceSlug 指定時は spaces.detail も無効化する（公開スペース詳細用）", () => {
    invalidateReviewCaches(SPACE_ID, SPACE_SLUG);

    expect(updateTagMock).toHaveBeenCalledWith(
      getCacheTag.spaces.detail(SPACE_SLUG),
    );
    expect(updateTagMock).toHaveBeenCalledTimes(5);
  });

  test("options.customerId で CUSTOMERS + customers.detail を追加無効化する", () => {
    invalidateReviewCaches(SPACE_ID, null, { customerId: CUSTOMER_ID });

    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.CUSTOMERS);
    expect(updateTagMock).toHaveBeenCalledWith(
      getCacheTag.customers.detail(CUSTOMER_ID),
    );
    expect(updateTagMock).toHaveBeenCalledTimes(6);
  });

  test("全オプション + slug 有効時は 7 タグを無効化する", () => {
    invalidateReviewCaches(SPACE_ID, SPACE_SLUG, {
      customerId: CUSTOMER_ID,
    });

    expect(updateTagMock).toHaveBeenCalledWith(
      getCacheTag.spaces.detail(SPACE_SLUG),
    );
    expect(updateTagMock).toHaveBeenCalledWith(
      getCacheTag.customers.detail(CUSTOMER_ID),
    );
    expect(updateTagMock).toHaveBeenCalledTimes(7);
  });

  test("Cloudflare CDN の space-v1 と sitemap-v1 を purge queue に載せる (CACHE-INVALIDATE-05)", () => {
    // 従来は raw updateTag(CACHE_TAGS.SPACES) のみで Cloudflare edge に伝播せず、
    // `/spaces` と `/spaces/[slug]` に emit された `space-v1` Cache-Tag が最大
    // s-maxage 秒 stale で配信されていた。invalidateSiteWideCache 経由に切り替えたため、
    // CDN 側の tag purge も併発することを検証する
    // (sitemap は全 site-wide invalidation で常時 co-purge される)。
    invalidateReviewCaches(SPACE_ID, SPACE_SLUG);

    expect(queueTagPurgeMock).toHaveBeenCalledTimes(1);
    // spaces.detail(slug) は CDN mapping を持たない per-detail sub-tag なので
    // resolveCdnTag で filter され、CDN 側は SPACE 一つに集約される。
    expect(queueTagPurgeMock).toHaveBeenCalledWith(
      CDN_CACHE_TAGS.SPACE,
      CDN_CACHE_TAGS.SITEMAP,
    );
  });

  test("slug 無指定でも SPACES 経由で CDN purge が発火する", () => {
    invalidateReviewCaches(SPACE_ID, null);

    expect(queueTagPurgeMock).toHaveBeenCalledTimes(1);
    expect(queueTagPurgeMock).toHaveBeenCalledWith(
      CDN_CACHE_TAGS.SPACE,
      CDN_CACHE_TAGS.SITEMAP,
    );
  });
});
