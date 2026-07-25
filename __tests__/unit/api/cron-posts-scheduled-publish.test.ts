import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

// --- モック関数の定義（mock.module() より前）---
const mockFindRecentlyDueScheduledPostSlugs = mock<() => Promise<string[]>>(
  () => Promise.resolve([]),
);

const mockInvalidateSiteWideCacheFromRouteHandler = mock<
  (tags: readonly string[]) => void
>(() => undefined);

const mockLogError = mock<() => void>(() => undefined);

const mockAuthorizeCronRequest = mock<() => Promise<Response | null>>(() =>
  Promise.resolve(null),
);

const mockConnection = mock<() => Promise<void>>(() => Promise.resolve());

const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});

const mockIsFeatureEnabled = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);

// --- mock.module() は await import() より前 ---

mock.module("next/server", () => ({
  connection: () => mockConnection(),
  NextResponse,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/domain/posts/scheduled-publish", () => ({
  findRecentlyDueScheduledPostSlugs: (
    ...args: Parameters<typeof mockFindRecentlyDueScheduledPostSlugs>
  ) => mockFindRecentlyDueScheduledPostSlugs(...args),
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler: (
    ...args: Parameters<typeof mockInvalidateSiteWideCacheFromRouteHandler>
  ) => mockInvalidateSiteWideCacheFromRouteHandler(...args),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: Parameters<typeof mockLogError>) => mockLogError(...args),
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    AUTHORIZATION: "AUTHORIZATION",
    CACHE: "CACHE",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));

mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: (
    ...args: Parameters<typeof mockAuthorizeCronRequest>
  ) => mockAuthorizeCronRequest(...args),
}));

mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: (...args: Parameters<typeof mockIsFeatureEnabled>) =>
    mockIsFeatureEnabled(...args),
}));

mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (error: string, status = 400) =>
    NextResponse.json({ error }, { status }),
  jsonSuccess: <T>(data: T, status = 200) =>
    NextResponse.json(data, { status }),
}));

const { GET } = await import("@/app/api/cron/posts-scheduled-publish/route");

// --- テスト用ヘルパー ---

function makeRequest(authHeader?: string) {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/posts-scheduled-publish", {
    headers,
  });
}

function makeSchedulerRequest() {
  return makeRequest("Bearer cloud-scheduler-oidc-token");
}

describe("GET /api/cron/posts-scheduled-publish", () => {
  beforeEach(() => {
    mockFindRecentlyDueScheduledPostSlugs.mockReset();
    mockInvalidateSiteWideCacheFromRouteHandler.mockReset();
    mockLogError.mockReset();
    mockAuthorizeCronRequest.mockReset();
    mockConnection.mockReset();
    mockUnstableRethrow.mockReset();
    mockIsFeatureEnabled.mockReset();

    mockConnection.mockResolvedValue(undefined);
    mockAuthorizeCronRequest.mockResolvedValue(null);
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockFindRecentlyDueScheduledPostSlugs.mockResolvedValue([]);
    mockUnstableRethrow.mockImplementation((error) => {
      throw error;
    });
  });

  test("Cloud Scheduler OIDC 認証失敗 → authorizeCronRequest の返却値をそのまま返す (401)", async () => {
    const authErrorResponse = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    mockAuthorizeCronRequest.mockResolvedValue(authErrorResponse);

    const response = await GET(makeRequest("Bearer invalid-oidc-token"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(mockAuthorizeCronRequest).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "postsScheduledPublishCron" }),
    );
    expect(mockFindRecentlyDueScheduledPostSlugs).not.toHaveBeenCalled();
  });

  test("posts feature module OFF → skip して DB を触らない", async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ skipped: true, reason: "feature_disabled" });
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith("posts");
    expect(mockFindRecentlyDueScheduledPostSlugs).not.toHaveBeenCalled();
  });

  test("対象なし → revalidated=0 でキャッシュ無効化を呼ばない", async () => {
    mockFindRecentlyDueScheduledPostSlugs.mockResolvedValue([]);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ revalidated: 0, slugs: [] });
    expect(mockInvalidateSiteWideCacheFromRouteHandler).not.toHaveBeenCalled();
  });

  test("対象あり → POSTS/SIDEBAR_DATA/detail タグをまとめて revalidate する", async () => {
    mockFindRecentlyDueScheduledPostSlugs.mockResolvedValue([
      "post-a",
      "post-b",
    ]);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      revalidated: 2,
      slugs: ["post-a", "post-b"],
    });
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledTimes(
      1,
    );
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledWith([
      "posts",
      "sidebar-data",
      "posts-post-a",
      "posts-post-b",
    ]);
  });

  test("findRecentlyDueScheduledPostSlugs が例外をスロー → 500 + logError", async () => {
    const dbError = new Error("Database connection failed");
    mockFindRecentlyDueScheduledPostSlugs.mockRejectedValue(dbError);
    mockUnstableRethrow.mockImplementation(() => {});

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: "Posts scheduled-publish cache revalidation failed",
    });
    expect(mockLogError).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        context: expect.objectContaining({
          operation: "postsScheduledPublishCron",
        }),
      }),
    );
  });
});
