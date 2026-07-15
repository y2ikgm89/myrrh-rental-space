import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CACHE_TAGS } from "@/shared/lib/constants";

const updateTagMock = mock<(tag: string) => void>(() => {});
const actualNextCache = await import("next/cache");
mock.module("next/cache", () => ({
  ...actualNextCache,
  updateTag: updateTagMock,
  cacheLife: mock(() => undefined),
  cacheTag: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

const { invalidateSpaceRatePlansCache } =
  await import("@/shared/lib/cache/space-rate-plan-cache");

const SPACE_ID = "space-1";
const OTHER_SPACE_ID = "space-2";

describe("invalidateSpaceRatePlansCache", () => {
  beforeEach(() => {
    updateTagMock.mockClear();
  });

  test("基本: 指定 spaceId の id-keyed タグのみを無効化する", () => {
    invalidateSpaceRatePlansCache(SPACE_ID);

    expect(updateTagMock).toHaveBeenCalledWith(
      CACHE_TAGS.SPACE_RATE_PLANS(SPACE_ID),
    );
    expect(updateTagMock).toHaveBeenCalledTimes(1);
  });

  test("spaceId ごとにタグが異なる（他 space を巻き込まない）", () => {
    invalidateSpaceRatePlansCache(SPACE_ID);

    expect(updateTagMock).toHaveBeenCalledWith(
      CACHE_TAGS.SPACE_RATE_PLANS(SPACE_ID),
    );
    expect(updateTagMock).not.toHaveBeenCalledWith(
      CACHE_TAGS.SPACE_RATE_PLANS(OTHER_SPACE_ID),
    );
  });
});
