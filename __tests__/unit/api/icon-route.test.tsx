import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockConnection = mock(() => Promise.resolve());
const mockGetFaviconUrl = mock(() =>
  Promise.resolve("https://assets.example.test/favicon.png"),
);
const mockFetchPublicHttpResource = mock(() =>
  Promise.resolve(
    new Response("icon-bytes", {
      status: 200,
      headers: { "content-type": "image/png" },
    }),
  ),
);

mock.module("next/server", () => ({
  connection: mockConnection,
}));

mock.module("next/og", () => ({
  ImageResponse: class ImageResponse extends Response {
    constructor(
      _element: unknown,
      init?: ResponseInit & { width?: number; height?: number },
    ) {
      super("fallback-icon", init);
    }
  },
}));

mock.module("@/shared/domain/settings/queries/display", () => ({
  getFaviconUrl: mockGetFaviconUrl,
}));

mock.module("@/shared/lib/ssrf-guard", () => ({
  fetchPublicHttpResource: mockFetchPublicHttpResource,
}));

import { GET } from "@/app/icon/route";

describe("GET /icon", () => {
  beforeEach(() => {
    mockConnection.mockClear();
    mockGetFaviconUrl.mockClear();
    mockFetchPublicHttpResource.mockClear();
    mockGetFaviconUrl.mockResolvedValue(
      "https://assets.example.test/favicon.png",
    );
    mockFetchPublicHttpResource.mockResolvedValue(
      new Response("icon-bytes", {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
  });

  test("fetches configured favicon through the SSRF-safe public HTTP helper", async () => {
    const response = await GET();

    expect(mockConnection).toHaveBeenCalledTimes(1);
    expect(mockFetchPublicHttpResource).toHaveBeenCalledWith(
      "https://assets.example.test/favicon.png",
    );
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(await response.text()).toBe("icon-bytes");
  });

  test("falls back when the public HTTP helper rejects the configured URL", async () => {
    mockFetchPublicHttpResource.mockRejectedValueOnce(new Error("blocked"));

    const response = await GET();

    expect(mockFetchPublicHttpResource).toHaveBeenCalledWith(
      "https://assets.example.test/favicon.png",
    );
    expect(await response.text()).toBe("fallback-icon");
  });
});
