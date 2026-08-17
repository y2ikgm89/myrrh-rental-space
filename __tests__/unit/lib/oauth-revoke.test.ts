/**
 * Google OAuth revoke が HTTP status を載せて `withGoogleApiRetry` で包まれていること。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockFetchPublicHttpResource = mock<
  (url: string, init?: RequestInit) => Promise<Response>
>(() => Promise.resolve(new Response(null, { status: 200 })));

mock.module("@/shared/lib/ssrf-guard", () => ({
  fetchPublicHttpResource: (
    url: string,
    init?: RequestInit,
  ): Promise<Response> => mockFetchPublicHttpResource(url, init),
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    LINE_CLIENT_ID: undefined,
    LINE_CLIENT_SECRET: undefined,
  },
}));

const mockLogError = mock(() => undefined);
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
}));

import { revokeGoogleOAuthGrant } from "@/shared/lib/oauth-revoke";

describe("revokeGoogleOAuthGrant", () => {
  beforeEach(() => {
    mockFetchPublicHttpResource.mockReset();
    mockLogError.mockReset();
  });

  test("503 のあと 200 なら retry して成功する", async () => {
    let calls = 0;
    mockFetchPublicHttpResource.mockImplementation(() => {
      calls += 1;
      return Promise.resolve(
        new Response(null, { status: calls < 2 ? 503 : 200 }),
      );
    });

    await revokeGoogleOAuthGrant("token-1");

    expect(calls).toBe(2);
    expect(mockLogError).not.toHaveBeenCalled();
  });
});
