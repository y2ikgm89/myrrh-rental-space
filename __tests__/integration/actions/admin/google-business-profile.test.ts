/**
 * Google Business Profile Server Actions 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-business-profile.ts のテスト
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  GbpAuthState,
  GbpSyncResult,
} from "@/shared/lib/google-business-profile";
import type {
  SyncLocationToGbpInput,
  ToggleLocationGbpSyncInput,
  ToggleLocationGbpSyncResult,
} from "@/shared/domain/locations/gbp-sync-commands";
import { isMutationError } from "@/shared/lib/mutation-result";

// --- mocks ---

const mockGetGbpAuthorizeUrl = mock<(state: string) => string>(
  () => "https://accounts.google.com/o/oauth2/v2/auth?test=1",
);
const mockRevokeGbpToken = mock<(refreshToken: string) => Promise<void>>(() =>
  Promise.resolve(),
);
const mockClearGbpAuthState = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);
const mockGetGbpAuthState = mock<() => Promise<GbpAuthState | null>>(() =>
  Promise.resolve(null),
);
const mockSaveGbpAuthState = mock<(state: GbpAuthState) => Promise<void>>(() =>
  Promise.resolve(),
);
const mockListGbpAccounts = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockExchangeGbpAuthCode = mock<(code: string) => Promise<unknown>>(() =>
  Promise.resolve({}),
);
const mockSyncLocationToGbp = mock<
  (input: { locationId: string }) => Promise<GbpSyncResult>
>(() =>
  Promise.resolve({
    locationId: "loc-1",
    syncedAt: new Date("2026-04-28T00:00:00Z"),
  }),
);
const mockCreateOAuth2Client = mock<() => unknown>(() => null);
const mockGetGbpClient = mock<() => unknown>(() => null);

mock.module("@/shared/lib/google-business-profile", () => ({
  getGbpAuthorizeUrl: mockGetGbpAuthorizeUrl,
  revokeGbpToken: mockRevokeGbpToken,
  clearGbpAuthState: mockClearGbpAuthState,
  getGbpAuthState: mockGetGbpAuthState,
  saveGbpAuthState: mockSaveGbpAuthState,
  listGbpAccounts: mockListGbpAccounts,
  exchangeGbpAuthCode: mockExchangeGbpAuthCode,
  syncLocationToGbp: mockSyncLocationToGbp,
  createOAuth2Client: mockCreateOAuth2Client,
  getGbpClient: mockGetGbpClient,
  GBP_SCOPES: ["https://www.googleapis.com/auth/business.manage"] as const,
  GBP_OAUTH_STATE_COOKIE: "gbp_oauth_state",
  GBP_OAUTH_STATE_COOKIE_MAX_AGE_SECONDS: 600,
}));

const mockCookieStoreSet = mock<
  (name: string, value: string, options: unknown) => void
>(() => {});
const mockCookieStoreDelete = mock<(name: string) => void>(() => {});
const mockCookieStoreGet = mock<(name: string) => { value: string } | null>(
  () => null,
);

mock.module("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: mockCookieStoreSet,
      delete: mockCookieStoreDelete,
      get: mockCookieStoreGet,
    }),
  headers: () => Promise.resolve(new Headers()),
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: { NODE_ENV: "test" },
}));

const mockSyncLocationToGbpCommand = mock<
  (input: SyncLocationToGbpInput) => Promise<GbpSyncResult>
>(() =>
  Promise.resolve({
    locationId: "loc-1",
    syncedAt: new Date("2026-04-28T00:00:00Z"),
  }),
);
const mockToggleLocationGbpSyncCommand = mock<
  (input: ToggleLocationGbpSyncInput) => Promise<ToggleLocationGbpSyncResult>
>(() => Promise.resolve({ id: "loc-1", gbpSyncEnabled: false }));

mock.module("@/shared/domain/locations/gbp-sync-commands", () => ({
  syncLocationToGbpCommand: mockSyncLocationToGbpCommand,
  toggleLocationGbpSyncCommand: mockToggleLocationGbpSyncCommand,
}));

const mockVerifyAdminSession = mock<
  () => Promise<{ id: string; role: string }>
>(() => Promise.resolve({ id: "user-1", role: "ADMIN" }));

mock.module("@/shared/lib/admin-auth", () => ({
  verifyAdminSession: mockVerifyAdminSession,
  DASHBOARD_ROLES: ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"] as const,
}));

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async <T>(options: {
    execute: (user: { id: string; role: string }) => Promise<T>;
    afterSuccess?: (data: T) => void | Promise<void>;
  }): Promise<T> => {
    const data = await options.execute({ id: "user-1", role: "ADMIN" });
    await options.afterSuccess?.(data);
    return data;
  },
}));

const mockUpdateTag = mock<(tag: string) => void>(() => {});

mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

const mockRedirect = mock<(url: string) => never>((_url: string) => {
  // Next.js redirect throws a special error
  const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
  error.digest = `NEXT_REDIRECT;replace;${_url};307;`;
  throw error;
});

mock.module("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: mock(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// テスト対象（mock 設定後に import）
import {
  initiateGbpAuth,
  revokeGbpAuth,
  toggleLocationGbpSync,
  triggerGbpSync,
} from "@/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-business-profile";

describe("Google Business Profile Server Actions", () => {
  beforeEach(() => {
    mockGetGbpAuthorizeUrl.mockClear();
    mockRevokeGbpToken.mockClear();
    mockClearGbpAuthState.mockClear();
    mockGetGbpAuthState.mockClear();
    mockSyncLocationToGbpCommand.mockClear();
    mockToggleLocationGbpSyncCommand.mockClear();
    mockVerifyAdminSession.mockClear();
    mockUpdateTag.mockClear();
    mockRedirect.mockClear();
    mockCookieStoreSet.mockClear();
    mockCookieStoreDelete.mockClear();
    mockCookieStoreGet.mockClear();
  });

  describe("initiateGbpAuth", () => {
    test("verifyAdminSession を呼び、state cookie 設定後 redirect をスローする", async () => {
      let caught: unknown = null;
      try {
        await initiateGbpAuth();
      } catch (error) {
        caught = error;
      }

      expect(mockVerifyAdminSession).toHaveBeenCalledTimes(1);

      // CSRF state cookie が httpOnly + sameSite: lax + maxAge: 600 で設定される
      expect(mockCookieStoreSet).toHaveBeenCalledTimes(1);
      expect(mockCookieStoreSet).toHaveBeenCalledWith(
        "gbp_oauth_state",
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          maxAge: 600,
          path: "/",
        }),
      );

      // 生成した state が getGbpAuthorizeUrl に渡される
      expect(mockGetGbpAuthorizeUrl).toHaveBeenCalledTimes(1);
      expect(mockGetGbpAuthorizeUrl).toHaveBeenCalledWith(
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      );

      expect(mockRedirect).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/v2/auth?test=1",
      );
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe("NEXT_REDIRECT");
    });
  });

  describe("revokeGbpAuth", () => {
    test("auth state が存在する場合 revokeGbpToken と clearGbpAuthState を呼ぶ", async () => {
      mockGetGbpAuthState.mockResolvedValueOnce({
        accessToken: "access-1",
        refreshToken: "refresh-1",
        expiresAt: 9999999999,
        accountId: "acc-1",
        accountName: "accounts/acc-1",
      });

      const result = await revokeGbpAuth();

      expect(isMutationError(result)).toBe(false);
      expect(mockGetGbpAuthState).toHaveBeenCalledTimes(1);
      expect(mockRevokeGbpToken).toHaveBeenCalledWith("refresh-1");
      expect(mockClearGbpAuthState).toHaveBeenCalledTimes(1);
      expect(mockUpdateTag).toHaveBeenCalledWith("integration-settings");
    });

    test("auth state が null でも clearGbpAuthState を呼ぶ", async () => {
      mockGetGbpAuthState.mockResolvedValueOnce(null);

      const result = await revokeGbpAuth();

      expect(isMutationError(result)).toBe(false);
      expect(mockRevokeGbpToken).not.toHaveBeenCalled();
      expect(mockClearGbpAuthState).toHaveBeenCalledTimes(1);
    });
  });

  describe("triggerGbpSync", () => {
    test("成功時 MutationResult<{ locationId, syncedAt }> を返す", async () => {
      const syncedAt = new Date("2026-04-28T12:00:00Z");
      mockSyncLocationToGbpCommand.mockResolvedValueOnce({
        locationId: "loc-1",
        syncedAt,
      });

      const result = await triggerGbpSync("loc-1");

      expect(isMutationError(result)).toBe(false);
      if (isMutationError(result)) {
        throw new Error("Expected success");
      }
      expect(result.locationId).toBe("loc-1");
      expect(result.syncedAt).toEqual(syncedAt);
      expect(mockSyncLocationToGbpCommand).toHaveBeenCalledWith({
        locationId: "loc-1",
      });
      expect(mockUpdateTag).toHaveBeenCalledWith("locations");
    });
  });

  describe("toggleLocationGbpSync", () => {
    test("enabled: false で同期を無効化する", async () => {
      mockToggleLocationGbpSyncCommand.mockResolvedValueOnce({
        id: "loc-1",
        gbpSyncEnabled: false,
      });

      const result = await toggleLocationGbpSync("loc-1", false);

      expect(isMutationError(result)).toBe(false);
      if (isMutationError(result)) {
        throw new Error("Expected success");
      }
      expect(result.gbpSyncEnabled).toBe(false);
      expect(mockToggleLocationGbpSyncCommand).toHaveBeenCalledWith({
        locationId: "loc-1",
        enabled: false,
      });
      expect(mockUpdateTag).toHaveBeenCalledWith("locations");
    });

    test("enabled: true で同期を有効化する", async () => {
      mockToggleLocationGbpSyncCommand.mockResolvedValueOnce({
        id: "loc-1",
        gbpSyncEnabled: true,
      });

      const result = await toggleLocationGbpSync("loc-1", true);

      expect(isMutationError(result)).toBe(false);
      if (isMutationError(result)) {
        throw new Error("Expected success");
      }
      expect(result.gbpSyncEnabled).toBe(true);
      expect(mockToggleLocationGbpSyncCommand).toHaveBeenCalledWith({
        locationId: "loc-1",
        enabled: true,
      });
    });
  });
});
