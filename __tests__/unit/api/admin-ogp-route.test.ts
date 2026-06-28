import { beforeEach, describe, expect, mock, test } from "bun:test";
import { expectErrorResult } from "../../helpers/type-assertions";

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

const mockFetchPublicHttpResource = mock((url: string, _init?: RequestInit) =>
  Promise.resolve(new Response(`<title>${url}</title>`, { status: 200 })),
);

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: mockCheckPermission,
  checkAdminAuth: mockCheckAdminAuth,
}));

mock.module("@/shared/lib/ssrf-guard", () => ({
  fetchPublicHttpResource: mockFetchPublicHttpResource,
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
  beforeEach(() => {
    mockCheckPermission.mockClear();
    mockCheckPermission.mockResolvedValue({
      success: true as const,
      user: { id: "admin-1", role: "ADMIN" },
    });
    mockCheckAdminAuth.mockClear();
    mockFetchPublicHttpResource.mockClear();
    mockFetchPublicHttpResource.mockImplementation(
      (url: string, _init?: RequestInit) =>
        Promise.resolve(new Response(`<title>${url}</title>`, { status: 200 })),
    );
  });

  test("管理者認証を要求する（checkPermission ではなく checkAdminAuth）", async () => {
    await POST(createOgpRequest("https://example.com/article"));

    expect(mockCheckAdminAuth).toHaveBeenCalledWith(expect.any(Headers));
    expect(mockCheckPermission).not.toHaveBeenCalled();
  });

  test("リダイレクト先 URL も pinned SSRF-safe fetch で検証する", async () => {
    mockFetchPublicHttpResource
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/latest/meta-data/" },
        }),
      )
      .mockRejectedValueOnce(new Error("blocked"));

    const response = await POST(createOgpRequest("https://example.com/post"));
    const body = await response.json();
    expectErrorResult(body);

    expect(response.status).toBe(400);
    expect(body.error).toContain("リダイレクト");
    expect(mockFetchPublicHttpResource).toHaveBeenCalledWith(
      "https://example.com/post",
      expect.objectContaining({ method: "GET" }),
    );
    expect(mockFetchPublicHttpResource).toHaveBeenCalledWith(
      "http://127.0.0.1/latest/meta-data/",
      expect.objectContaining({ method: "GET" }),
    );
    expect(mockFetchPublicHttpResource).toHaveBeenCalledTimes(2);
  });
});
