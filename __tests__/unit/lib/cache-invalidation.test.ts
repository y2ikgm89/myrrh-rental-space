import { describe, test, expect, beforeEach, mock } from "bun:test";

const mockUpdateTag = mock<(tag: string) => void>(() => {});
const mockRevalidateTag = mock<(tag: string, profile?: unknown) => void>(
  () => {},
);
const mockPurgeByTags = mock<
  (tags: string[]) => Promise<{ success: boolean; error?: string }>
>(async () => ({ success: true }));
const mockQueueTagPurge = mock<(...tags: readonly string[]) => void>(() => {});
const mockLogError = mock<(err: Error, ctx: Record<string, unknown>) => void>(
  () => {},
);
const mockFireAndForget = mock<(p: Promise<unknown>, opts: unknown) => void>(
  (p) => {
    void (p as Promise<unknown>).catch(() => {});
  },
);

const actualNextCache = await import("next/cache");
mock.module("next/cache", () => ({
  ...actualNextCache,
  updateTag: mockUpdateTag,
  revalidateTag: mockRevalidateTag,
}));
mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareCacheByTags: mockPurgeByTags,
}));
mock.module("@/shared/lib/cache/batcher", () => ({
  queueTagPurge: mockQueueTagPurge,
  withPurgeBatch: async <T>(fn: () => Promise<T>) => fn(),
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" },
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mockFireAndForget,
}));

const { invalidateSiteWideCache, invalidateSiteWideCacheFromRouteHandler } =
  await import("@/shared/lib/cache/site-wide");
const { firePurgeAsync } = await import("@/shared/lib/cache/fire-purge");
const { CACHE_TAGS } = await import("@/shared/lib/constants");

beforeEach(() => {
  mockUpdateTag.mockClear();
  mockRevalidateTag.mockClear();
  mockPurgeByTags.mockClear();
  mockQueueTagPurge.mockClear();
  mockLogError.mockClear();
  mockFireAndForget.mockClear();
});

describe("invalidateSiteWideCache (Server Action)", () => {
  test("calls updateTag with the live Next.js tag string", () => {
    invalidateSiteWideCache(CACHE_TAGS.LAYOUT_SETTINGS, { skipCdnPurge: true });
    expect(mockUpdateTag).toHaveBeenCalledWith("layout-settings");
  });

  test("multi-tag input queues all CDN-mapped tags into the batcher (with SITEMAP co-purge)", () => {
    invalidateSiteWideCache([
      CACHE_TAGS.LAYOUT_SETTINGS,
      CACHE_TAGS.NAVIGATION,
    ]);
    expect(mockUpdateTag).toHaveBeenCalledTimes(2);
    expect(mockUpdateTag).toHaveBeenNthCalledWith(1, "layout-settings");
    expect(mockUpdateTag).toHaveBeenNthCalledWith(2, "navigation");
    // Every site-wide invalidation auto-appends SITEMAP so /sitemap.xml is
    // purged immediately (Google discovery latency collapse).
    expect(mockQueueTagPurge).toHaveBeenCalledTimes(1);
    expect(mockQueueTagPurge).toHaveBeenCalledWith(
      "layout-v1",
      "navigation-v1",
      "sitemap-v1",
    );
  });

  test("zero-mapped input still purges SITEMAP (sitemap is the universal co-purge target)", () => {
    invalidateSiteWideCache("posts-some-slug"); // per-detail tag, no CDN mapping
    expect(mockQueueTagPurge).toHaveBeenCalledTimes(1);
    expect(mockQueueTagPurge).toHaveBeenCalledWith("sitemap-v1");
  });

  test("skipCdnPurge:true skips queueTagPurge", () => {
    invalidateSiteWideCache(CACHE_TAGS.INTEGRATION_SETTINGS, {
      skipCdnPurge: true,
    });
    expect(mockUpdateTag).toHaveBeenCalledWith("integration-settings");
    expect(mockQueueTagPurge).not.toHaveBeenCalled();
  });
});

describe("invalidateSiteWideCacheFromRouteHandler", () => {
  test("uses revalidateTag(tag, {expire:0}), NOT updateTag", () => {
    invalidateSiteWideCacheFromRouteHandler(CACHE_TAGS.INTEGRATION_SETTINGS, {
      skipCdnPurge: true,
    });
    expect(mockUpdateTag).not.toHaveBeenCalled();
    expect(mockRevalidateTag).toHaveBeenCalledWith("integration-settings", {
      expire: 0,
    });
  });

  test("without skipCdnPurge, fires purgeCloudflareCacheByTags directly (no batcher)", async () => {
    invalidateSiteWideCacheFromRouteHandler(CACHE_TAGS.NAVIGATION);
    expect(mockRevalidateTag).toHaveBeenCalledWith("navigation", { expire: 0 });
    // fireAndForget invoked, purge thunk queued
    expect(mockFireAndForget).toHaveBeenCalled();
  });
});

describe("firePurgeAsync body-failure surfacing", () => {
  test("logs MEDIUM error when purge body returns success:false", async () => {
    await firePurgeAsync(
      async () => ({ success: false, error: "rate-limited" }),
      { operation: "test.op", tags: ["layout-v1"] },
    );
    expect(mockLogError).toHaveBeenCalledTimes(1);
    const callArgs = mockLogError.mock.calls[0];
    expect(callArgs).toBeDefined();
    const [err, ctx] = callArgs as unknown as [
      Error,
      { category: string; severity: string; context: Record<string, unknown> },
    ];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/test\.op/);
    expect(ctx).toMatchObject({
      category: "EXTERNAL_API",
      severity: "MEDIUM",
      context: {
        operation: "test.op",
        tags: ["layout-v1"],
      },
    });
  });

  test("does NOT log when purge body returns success:true", async () => {
    await firePurgeAsync(async () => ({ success: true }), {
      operation: "test.ok",
    });
    expect(mockLogError).not.toHaveBeenCalled();
  });
});
