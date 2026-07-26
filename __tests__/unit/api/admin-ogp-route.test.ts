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

const mockLogError = mock<() => void>(() => undefined);

const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  // Next.js の実装は内部制御フロー例外 (NEXT_REDIRECT 等) のみ rethrow するが、
  // テストではこの mock 自体は無条件で通す (呼ばれたことだけを確認する)。
  void error;
});

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

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: Parameters<typeof mockLogError>) => mockLogError(...args),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API", UNKNOWN: "UNKNOWN" },
  ErrorSeverity: { MEDIUM: "MEDIUM", HIGH: "HIGH", LOW: "LOW" },
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    ADMIN_APP_URL: "http://localhost:3000",
    BETTER_AUTH_URL: undefined,
  },
}));

mock.module("@/shared/lib/constants/urls", () => ({
  getAppUrl: () => "http://localhost:3000",
}));

import { POST } from "@/app/(admin)/admin/api/ogp/route";

function createOgpRequest(url: string, headers?: HeadersInit): Request {
  return new Request("https://app.example.test/admin/api/ogp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost:3000",
      ...headers,
    },
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
    mockLogError.mockClear();
    mockUnstableRethrow.mockClear();
    mockUnstableRethrow.mockImplementation(() => {});
  });

  test("管理者認証を要求する（checkPermission ではなく checkAdminAuth）", async () => {
    await POST(createOgpRequest("https://example.com/article"));

    expect(mockCheckAdminAuth).toHaveBeenCalledWith(expect.any(Headers));
    expect(mockCheckPermission).not.toHaveBeenCalled();
  });

  test("same-origin 不一致は 403 で拒否する", async () => {
    const response = await POST(
      createOgpRequest("https://example.com/article", {
        origin: "https://evil.example.com",
      }),
    );
    const body = await response.json();
    expectErrorResult(body);

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockCheckAdminAuth).not.toHaveBeenCalled();
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

  test("OgpFetchError 以外の予期しない例外 → unstable_rethrow + logError の後 502", async () => {
    // extractTitle 等パーサー側で予期しない TypeError が起きるケースを模倣する
    // (Round-4 audit Finding #23: 旧実装は unstable_rethrow も logError も
    // 呼ばずに無条件で 502 を返していた)。
    const unexpected = new TypeError("Cannot read properties of undefined");
    mock.module("@/admin/lib/ogp-parser", () => ({
      extractTitle: () => {
        throw unexpected;
      },
      extractDescription: () => "Example description",
      extractImage: () => "/og.png",
      extractSiteName: () => "Example",
      getFaviconUrl: (url: string) => new URL("/favicon.ico", url).toString(),
      resolveUrl: (base: string, raw: string) => new URL(raw, base).toString(),
    }));

    const { POST: postWithBrokenParser } =
      await import("@/app/(admin)/admin/api/ogp/route");
    const response = await postWithBrokenParser(
      createOgpRequest("https://example.com/article"),
    );
    const body = await response.json();
    expectErrorResult(body);

    expect(response.status).toBe(502);
    expect(body.error).toBe("OGP の取得に失敗しました");
    expect(mockUnstableRethrow).toHaveBeenCalledWith(unexpected);
    expect(mockLogError).toHaveBeenCalledWith(
      unexpected,
      expect.objectContaining({
        category: "EXTERNAL_API",
        severity: "MEDIUM",
        context: expect.objectContaining({ operation: "adminOgpFetch" }),
      }),
    );
  });
});
