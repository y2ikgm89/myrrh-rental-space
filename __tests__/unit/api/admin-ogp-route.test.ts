import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockCheckPermission = mock(() =>
  Promise.resolve({
    success: true as const,
    user: { id: "admin-1", role: "ADMIN" },
  }),
);

const mockCheckAdminAuth = mock(() =>
  Promise.resolve({
    success: true as const,
    user: { id: "admin-1", role: "ADMIN" },
  }),
);

const mockIsUrlSafe = mock((url: string) =>
  Promise.resolve(!url.includes("127.0.0.1")),
);

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: mockCheckPermission,
  checkAdminAuth: mockCheckAdminAuth,
}));

mock.module("@/admin/lib/ssrf-guard", () => ({
  isUrlSafe: mockIsUrlSafe,
}));

mock.module("@/admin/lib/ogp-parser", () => ({
  extractTitle: () => "Example title",
  extractDescription: () => "Example description",
  extractImage: () => "/og.png",
  extractSiteName: () => "Example",
  getFaviconUrl: (url: string) => new URL("/favicon.ico", url).toString(),
  resolveUrl: (base: string, raw: string) => new URL(raw, base).toString(),
}));

import { POST } from "@/app/(admin)/admin/api/ogp/route";

function createOgpRequest(url: string): Request {
  return new Request("https://app.example.test/admin/api/ogp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

describe("POST /admin/api/ogp", () => {
  const originalFetch = globalThis.fetch;

  function createFetchMock(response: Response) {
    const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(response),
    );

    return Object.assign(fetchMock, { preconnect: originalFetch.preconnect });
  }

  beforeEach(() => {
    mockCheckPermission.mockClear();
    mockCheckPermission.mockResolvedValue({
      success: true as const,
      user: { id: "admin-1", role: "ADMIN" },
    });
    mockCheckAdminAuth.mockClear();
    mockIsUrlSafe.mockClear();
    mockIsUrlSafe.mockImplementation((url: string) =>
      Promise.resolve(!url.includes("127.0.0.1")),
    );
    globalThis.fetch = originalFetch;
  });

  test("管理者認証を要求する（checkPermission ではなく checkAdminAuth）", async () => {
    globalThis.fetch = createFetchMock(
      new Response("<title>ok</title>", { status: 200 }),
    );

    await POST(createOgpRequest("https://example.com/article"));

    expect(mockCheckAdminAuth).toHaveBeenCalledWith(expect.any(Headers));
    expect(mockCheckPermission).not.toHaveBeenCalled();
  });

  test("リダイレクト先 URL も SSRF guard で検証する", async () => {
    const fetchMock = createFetchMock(
      new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1/latest/meta-data/" },
      }),
    );
    globalThis.fetch = fetchMock;

    const response = await POST(createOgpRequest("https://example.com/post"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("リダイレクト");
    expect(mockIsUrlSafe).toHaveBeenCalledWith("https://example.com/post");
    expect(mockIsUrlSafe).toHaveBeenCalledWith(
      "http://127.0.0.1/latest/meta-data/",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});
