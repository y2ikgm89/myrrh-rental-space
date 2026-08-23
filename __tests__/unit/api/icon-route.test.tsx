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

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: { R2_PUBLIC_URL: "https://assets.example.test" },
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
  /**
   * 監査 A-46: 以前は上流の Content-Type を無検査で転送していたので、
   * `faviconUrl` の指す先が `text/html` を返せば公開 origin 上で
   * 攻撃者の HTML が描画された（nosniff は明示の Content-Type を止めない）。
   * しかも 1 日の SWR で edge に残る。
   */
  test("画像でない Content-Type は pass-through せず fallback を返す", async () => {
    mockFetchPublicHttpResource.mockResolvedValueOnce(
      new Response("<script>alert(1)</script>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const response = await GET();

    expect(response.headers.get("content-type")).not.toBe("text/html");
    expect(await response.text()).toBe("fallback-icon");
  });

  test("SVG も pass-through しない（R2 の upload は SVG を作らない）", async () => {
    mockFetchPublicHttpResource.mockResolvedValueOnce(
      new Response("<svg/>", {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
    );

    expect(await (await GET()).text()).toBe("fallback-icon");
  });

  test("Content-Type の parameter 付きは正規化して通す", async () => {
    mockFetchPublicHttpResource.mockResolvedValueOnce(
      new Response("icon-bytes", {
        status: 200,
        headers: { "content-type": "image/png; charset=utf-8" },
      }),
    );

    const response = await GET();

    expect(response.headers.get("content-type")).toBe("image/png");
    expect(await response.text()).toBe("icon-bytes");
  });

  test("管理メディア origin 外の URL は fetch すらしない", async () => {
    mockGetFaviconUrl.mockResolvedValue("https://attacker.example/pwn");

    const response = await GET();

    expect(mockFetchPublicHttpResource).not.toHaveBeenCalled();
    expect(await response.text()).toBe("fallback-icon");
  });
});
