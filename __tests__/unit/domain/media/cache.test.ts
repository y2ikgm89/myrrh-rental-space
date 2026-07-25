import { beforeEach, describe, expect, mock, test } from "bun:test";

const updateTagMock = mock<(tag: string) => void>(() => {});
const firePurgeAsyncMock = mock<
  (purge: () => Promise<unknown>, ctx: unknown) => Promise<void>
>(() => Promise.resolve());
const purgeCloudflareCacheMock = mock<() => Promise<{ success: boolean }>>(() =>
  Promise.resolve({ success: true }),
);

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({
  updateTag: updateTagMock,
}));
mock.module("@/shared/lib/cache/fire-purge", () => ({
  firePurgeAsync: (...args: Parameters<typeof firePurgeAsyncMock>) =>
    firePurgeAsyncMock(...args),
}));
mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareCache: (
    ...args: Parameters<typeof purgeCloudflareCacheMock>
  ) => purgeCloudflareCacheMock(...args),
}));

const { revalidateMedia, purgeMediaUrls, finalizeMediaMutation } =
  await import("@/shared/domain/media/cache");
const { CACHE_TAGS, getCacheTag } = await import("@/shared/lib/constants");

describe("revalidateMedia", () => {
  beforeEach(() => {
    updateTagMock.mockClear();
  });

  test("MEDIA タグと detail タグを invalidate する", () => {
    revalidateMedia("a", "b", "a");

    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.MEDIA);
    expect(updateTagMock).toHaveBeenCalledWith(getCacheTag.media.detail("a"));
    expect(updateTagMock).toHaveBeenCalledWith(getCacheTag.media.detail("b"));
    expect(updateTagMock).toHaveBeenCalledTimes(3);
  });
});

describe("purgeMediaUrls", () => {
  beforeEach(() => {
    firePurgeAsyncMock.mockClear();
    purgeCloudflareCacheMock.mockClear();
  });

  test("空 / 空文字のみは purge しない", () => {
    purgeMediaUrls([]);
    purgeMediaUrls(["", ""]);
    expect(firePurgeAsyncMock).not.toHaveBeenCalled();
  });

  test("重複を除いて firePurgeAsync する", () => {
    purgeMediaUrls(["https://a.example/1", "https://a.example/1", ""]);

    expect(firePurgeAsyncMock).toHaveBeenCalledTimes(1);
    const [purgeFn, ctx] = firePurgeAsyncMock.mock.calls[0] ?? [];
    expect(ctx).toMatchObject({
      operation: "purgeMediaUrls",
      urls: ["https://a.example/1"],
    });
    expect(typeof purgeFn).toBe("function");
  });
});

describe("finalizeMediaMutation", () => {
  beforeEach(() => {
    updateTagMock.mockClear();
    firePurgeAsyncMock.mockClear();
  });

  test("ids の revalidate と任意 urls の purge を行う", () => {
    finalizeMediaMutation(["m1"], ["https://cdn.example/m1.jpg"]);

    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.MEDIA);
    expect(updateTagMock).toHaveBeenCalledWith(getCacheTag.media.detail("m1"));
    expect(firePurgeAsyncMock).toHaveBeenCalledTimes(1);
  });

  test("urls 省略時は purge しない", () => {
    finalizeMediaMutation(["m1"]);
    expect(firePurgeAsyncMock).not.toHaveBeenCalled();
  });
});
