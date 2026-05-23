import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

type MockPermissionResult =
  | { success: true; user: { id: string; role: string } }
  | { success: false; error: { error: string } };

const mockCheckPermission = mock<() => Promise<MockPermissionResult>>(() =>
  Promise.resolve({
    success: true as const,
    user: { id: "admin-1", role: "ADMIN" },
  }),
);

const mockGetAdminSession = mock(() =>
  Promise.resolve({ user: { id: "viewer-1", role: "VIEWER" } }),
);
const mockGetAdminSessionUser = mock(() => ({
  id: "viewer-1",
  role: "VIEWER",
}));

const mockCookieDelete = mock((_name: string) => {});
const mockCookieGet = mock((_name: string) => ({ value: "state-1" }));

const mockExchangeGbpAuthCode = mock((_code: string) =>
  Promise.resolve({
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expiresAt: Date.now() + 3600,
  }),
);

const mockListGbpAccounts = mock(() =>
  Promise.resolve([{ accountId: "accounts/1", accountName: "Account 1" }]),
);
const mockCreateOAuth2Client = mock(() => ({
  setCredentials: mock(() => {}),
}));
const mockSaveGbpAuthState = mock((_state: unknown) => Promise.resolve());

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: mockCheckPermission,
}));

mock.module("@/shared/lib/admin-auth", () => ({
  getAdminSession: mockGetAdminSession,
  getAdminSessionUser: mockGetAdminSessionUser,
}));

mock.module("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: mockCookieGet,
      delete: mockCookieDelete,
    }),
}));

mock.module("@/shared/lib/google-business-profile/oauth", () => ({
  GBP_OAUTH_STATE_COOKIE: "gbp_oauth_state",
  exchangeGbpAuthCode: mockExchangeGbpAuthCode,
}));

mock.module("@/shared/lib/google-business-profile/account", () => ({
  listGbpAccounts: mockListGbpAccounts,
}));

mock.module("@/shared/lib/google-business-profile/client", () => ({
  createOAuth2Client: mockCreateOAuth2Client,
}));

mock.module("@/shared/domain/google-business-profile/settings", () => ({
  saveGbpAuthState: mockSaveGbpAuthState,
}));

import { GET } from "@/app/api/google-business-profile/oauth/callback/route";

function createCallbackRequest(): NextRequest {
  const url = new URL(
    "https://app.example.test/api/google-business-profile/oauth/callback?code=code-1&state=state-1",
  );
  return new NextRequest(url);
}

describe("GET /api/google-business-profile/oauth/callback", () => {
  beforeEach(() => {
    mockCheckPermission.mockClear();
    mockCheckPermission.mockResolvedValue({
      success: true as const,
      user: { id: "admin-1", role: "ADMIN" },
    });
    mockGetAdminSession.mockClear();
    mockGetAdminSessionUser.mockClear();
    mockCookieDelete.mockClear();
    mockCookieGet.mockClear();
    mockCookieGet.mockReturnValue({ value: "state-1" });
    mockExchangeGbpAuthCode.mockClear();
    mockListGbpAccounts.mockClear();
    mockCreateOAuth2Client.mockClear();
    mockSaveGbpAuthState.mockClear();
  });

  test("settings:update 権限がない場合は認証情報を保存しない", async () => {
    mockCheckPermission.mockResolvedValueOnce({
      success: false as const,
      error: { error: "settingsのupdate権限がありません" },
    });

    const response = await GET(createCallbackRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/admin/settings/integrations?gbp_error=forbidden",
    );
    expect(mockExchangeGbpAuthCode).not.toHaveBeenCalled();
    expect(mockSaveGbpAuthState).not.toHaveBeenCalled();
  });
});
