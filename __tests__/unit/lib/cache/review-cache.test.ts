import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

const updateTagMock = mock<(tag: string) => void>(() => {});
const actualNextCache = await import("next/cache");
mock.module("next/cache", () => ({
  ...actualNextCache,
  updateTag: updateTagMock,
}));

const { invalidateReviewCaches } =
  await import("@/shared/lib/cache/review-cache");

const SPACE_ID = "space-1";
const SPACE_SLUG = "studio-a";
const CUSTOMER_ID = "cust-1";

describe("invalidateReviewCaches", () => {
  beforeEach(() => {
    updateTagMock.mockClear();
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
});
