import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockPurgeDetailUrls = mock<
  (paths: readonly string[]) => Promise<{ success: boolean }>
>(async () => ({ success: true }));
mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareDetailUrls: mockPurgeDetailUrls,
}));

const mockFirePurgeAsync = mock(
  async (purge: () => Promise<{ success: boolean }>) => {
    await purge();
  },
);
const mockInvalidateSiteWideCache = mock(() => {});
const mockPurgeMarketingHomeTag = mock(() => {});
mock.module("@/shared/lib/cache", () => ({
  firePurgeAsync: mockFirePurgeAsync,
  invalidateSiteWideCache: mockInvalidateSiteWideCache,
  purgeMarketingHomeTag: mockPurgeMarketingHomeTag,
}));

const { purgePostArchive, invalidatePostCollectionCaches } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/post/cache-helpers");

function getFirstPurgeDetailPaths(): readonly string[] {
  const firstCall = mockPurgeDetailUrls.mock.calls[0];
  expect(firstCall).toBeDefined();
  if (firstCall === undefined) {
    throw new Error("purgeCloudflareDetailUrls must be called");
  }
  return firstCall[0];
}

describe("post cache-helpers URL purge lists", () => {
  beforeEach(() => {
    mockPurgeDetailUrls.mockClear();
    mockFirePurgeAsync.mockClear();
    mockInvalidateSiteWideCache.mockClear();
    mockPurgeMarketingHomeTag.mockClear();
  });

  test("purgePostArchive は /blog と /feed.xml を purge する", async () => {
    await purgePostArchive();

    expect(mockFirePurgeAsync).toHaveBeenCalledTimes(1);
    expect(getFirstPurgeDetailPaths()).toEqual(["/blog", "/feed.xml"]);
  });

  test("invalidatePostCollectionCaches は /feed.xml を URL purge する", async () => {
    await invalidatePostCollectionCaches();

    expect(mockInvalidateSiteWideCache).toHaveBeenCalledTimes(1);
    expect(mockPurgeMarketingHomeTag).toHaveBeenCalledTimes(1);
    expect(mockFirePurgeAsync).toHaveBeenCalledTimes(1);
    expect(getFirstPurgeDetailPaths()).toEqual(["/feed.xml"]);
  });
});
