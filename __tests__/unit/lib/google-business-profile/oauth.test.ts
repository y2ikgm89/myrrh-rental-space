/**
 * GBP OAuth token 交換 / revoke が `withGoogleApiRetry` で包まれていること。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockGetToken = mock<(code: string) => Promise<{ tokens: unknown }>>(() =>
  Promise.resolve({
    tokens: {
      access_token: "access-1",
      refresh_token: "refresh-1",
      expiry_date: 1_700_000_000_000,
    },
  }),
);
const mockRevokeToken = mock<(token: string) => Promise<void>>(() =>
  Promise.resolve(),
);

mock.module("@/shared/lib/google-business-profile/client", () => ({
  GBP_SCOPES: ["https://www.googleapis.com/auth/business.manage"],
  createOAuth2Client: () => ({
    getToken: mockGetToken,
    revokeToken: mockRevokeToken,
  }),
}));

const mockLogError = mock(() => undefined);
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { LOW: "LOW" },
}));

import {
  exchangeGbpAuthCode,
  revokeGbpToken,
} from "@/shared/lib/google-business-profile/oauth";

describe("exchangeGbpAuthCode", () => {
  beforeEach(() => {
    mockGetToken.mockReset();
    mockGetToken.mockImplementation(() =>
      Promise.resolve({
        tokens: {
          access_token: "access-1",
          refresh_token: "refresh-1",
          expiry_date: 1_700_000_000_000,
        },
      }),
    );
  });

  test("503 のあと成功したら token を返す（retry 経由）", async () => {
    let calls = 0;
    mockGetToken.mockImplementation(() => {
      calls += 1;
      if (calls < 2) {
        return Promise.reject({ code: 503, message: "Service Unavailable" });
      }
      return Promise.resolve({
        tokens: {
          access_token: "access-1",
          refresh_token: "refresh-1",
          expiry_date: 1_700_000_000_000,
        },
      });
    });

    const result = await exchangeGbpAuthCode("code-1");

    expect(result).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: 1_700_000_000_000,
    });
    expect(calls).toBe(2);
  });
});

describe("revokeGbpToken", () => {
  beforeEach(() => {
    mockRevokeToken.mockReset();
    mockRevokeToken.mockImplementation(() => Promise.resolve());
    mockLogError.mockReset();
  });

  test("503 のあと成功したら revoke を完了する（retry 経由）", async () => {
    let calls = 0;
    mockRevokeToken.mockImplementation(() => {
      calls += 1;
      if (calls < 2) {
        return Promise.reject({ code: 503, message: "Service Unavailable" });
      }
      return Promise.resolve();
    });

    await revokeGbpToken("refresh-1");

    expect(calls).toBe(2);
    expect(mockLogError).not.toHaveBeenCalled();
  });
});
