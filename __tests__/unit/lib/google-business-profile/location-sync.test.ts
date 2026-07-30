import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockLocationFindUnique = mock<
  (args: unknown) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockLocationUpdate = mock<(args: unknown) => Promise<unknown>>(() =>
  Promise.resolve({}),
);
const mockLocationUpdateMany = mock<(args: unknown) => Promise<unknown>>(() =>
  Promise.resolve({ count: 1 }),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    location: {
      findUnique: (args: unknown) => mockLocationFindUnique(args),
      update: (args: unknown) => mockLocationUpdate(args),
      updateMany: (args: unknown) => mockLocationUpdateMany(args),
    },
  },
}));

let stubModeValue = "false";
mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    get GBP_STUB_MODE() {
      return stubModeValue;
    },
  },
}));

const mockLogError = mock(() => undefined);
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
}));

mock.module("@/shared/lib/constants/urls", () => ({
  getAppUrl: () => "https://example.com",
}));

const mockBuildLocationPayload = mock(() => ({ title: "テスト拠点" }));
const mockBuildGbpFieldMask = mock(() => "title");
const mockFormatGbpError = mock(() => "GBP API エラー");
mock.module("@/shared/lib/google-business-profile/helpers", () => ({
  buildLocationPayload: () => mockBuildLocationPayload(),
  buildGbpFieldMask: () => mockBuildGbpFieldMask(),
  formatGbpError: () => mockFormatGbpError(),
}));

mock.module("@/shared/lib/google-business-profile/schemas", () => ({
  LocationSchema: { parse: (value: unknown) => value },
}));

const mockPatch = mock<(args: unknown) => Promise<unknown>>(() =>
  Promise.resolve({}),
);
const mockGetGbpClient = mock(() => ({
  locations: { patch: (args: unknown) => mockPatch(args) },
}));
mock.module("@/shared/lib/google-business-profile/client", () => ({
  getGbpClient: () => mockGetGbpClient(),
}));

mock.module("@/shared/lib/google-api/retry", () => ({
  withGoogleApiRetry: <T>(fn: () => Promise<T>) => fn(),
}));

const mockGetGbpAuthState = mock<() => Promise<unknown | null>>(() =>
  Promise.resolve(null),
);
const mockSaveGbpAuthState = mock<(state: unknown) => Promise<void>>(() =>
  Promise.resolve(),
);
mock.module("@/shared/domain/google-business-profile/settings", () => ({
  getGbpAuthState: () => mockGetGbpAuthState(),
  saveGbpAuthState: (state: unknown) => mockSaveGbpAuthState(state),
}));

const mockSyncLocationStub = mock(async (input: { locationId: string }) => ({
  locationId: input.locationId,
  syncedAt: new Date("2026-01-01T00:00:00.000Z"),
}));
mock.module("@/shared/lib/google-business-profile/stub", () => ({
  syncLocationStub: (input: { locationId: string }) =>
    mockSyncLocationStub(input),
}));

const { syncLocationToGbpCommand } =
  await import("@/shared/domain/locations/gbp-sync-commands");

const LOCATION_ID = "loc-1";
const AUTH_STATE = {
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: Date.now() + 3600_000,
  accountId: "acc-1",
  accountName: "テスト法人",
};
const BASE_LOCATION = {
  id: LOCATION_ID,
  name: "本館",
  postalCode: "150-0001",
  city: "渋谷区",
  streetAddress: "神宮前1-1-1",
  buildingName: null,
  phoneNumber: "03-1234-5678",
  businessHours: null,
  latitude: null,
  longitude: null,
  googleBusinessPlaceId: "locations/12345",
  gbpSyncEnabled: true,
};

describe("syncLocationToGbpCommand", () => {
  beforeEach(() => {
    stubModeValue = "false";
    mockLocationFindUnique.mockReset();
    mockLocationUpdate.mockReset();
    mockLocationUpdateMany.mockReset();
    mockGetGbpAuthState.mockReset();
    mockGetGbpClient.mockClear();
    mockPatch.mockReset();
    mockLogError.mockClear();
    mockSyncLocationStub.mockClear();

    mockLocationFindUnique.mockResolvedValue({ ...BASE_LOCATION });
    mockLocationUpdate.mockResolvedValue({});
    mockLocationUpdateMany.mockResolvedValue({ count: 1 });
    mockGetGbpAuthState.mockResolvedValue(AUTH_STATE);
    mockPatch.mockResolvedValue({});
  });

  test("GBP_STUB_MODE=true のときはスタブ実装に委譲し DB へ直接触らない", async () => {
    stubModeValue = "true";

    const result = await syncLocationToGbpCommand({ locationId: LOCATION_ID });

    expect(mockSyncLocationStub).toHaveBeenCalledWith({
      locationId: LOCATION_ID,
    });
    expect(result.locationId).toBe(LOCATION_ID);
    expect(mockLocationFindUnique).not.toHaveBeenCalled();
  });

  test("対象拠点が存在しない場合は updateMany で gbpSyncError を記録する", async () => {
    mockLocationFindUnique.mockResolvedValueOnce(null);

    await syncLocationToGbpCommand({ locationId: LOCATION_ID });

    expect(mockLocationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LOCATION_ID },
        data: expect.objectContaining({
          gbpSyncError: expect.stringContaining("見つかりません"),
        }),
      }),
    );
    expect(mockGetGbpAuthState).not.toHaveBeenCalled();
  });

  test("gbpSyncEnabled=false のときは API を呼ばず gbpSyncError をクリアする", async () => {
    mockLocationFindUnique.mockResolvedValueOnce({
      ...BASE_LOCATION,
      gbpSyncEnabled: false,
    });

    await syncLocationToGbpCommand({ locationId: LOCATION_ID });

    expect(mockLocationUpdate).toHaveBeenCalledWith({
      where: { id: LOCATION_ID },
      data: { gbpSyncError: null },
    });
    expect(mockGetGbpAuthState).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("googleBusinessPlaceId 未設定のときは API を呼ばず gbpSyncError をクリアする", async () => {
    mockLocationFindUnique.mockResolvedValueOnce({
      ...BASE_LOCATION,
      googleBusinessPlaceId: null,
    });

    await syncLocationToGbpCommand({ locationId: LOCATION_ID });

    expect(mockLocationUpdate).toHaveBeenCalledWith({
      where: { id: LOCATION_ID },
      data: { gbpSyncError: null },
    });
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("GBP 未認証のときは gbpSyncError に '未設定' メッセージを記録する", async () => {
    mockGetGbpAuthState.mockResolvedValueOnce(null);

    await syncLocationToGbpCommand({ locationId: LOCATION_ID });

    expect(mockLocationUpdate).toHaveBeenCalledWith({
      where: { id: LOCATION_ID },
      data: { gbpSyncError: "GBP 連携未設定" },
    });
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("正常系: API 成功時に gbpSyncedAt を更新し gbpSyncError をクリアする", async () => {
    const result = await syncLocationToGbpCommand({ locationId: LOCATION_ID });

    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({ name: "locations/12345" }),
    );
    expect(mockLocationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LOCATION_ID },
        data: expect.objectContaining({
          gbpSyncError: null,
          gbpSyncedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.locationId).toBe(LOCATION_ID);
  });

  test("API 呼び出しが失敗した場合は throw せず gbpSyncError にエラーメッセージを記録する", async () => {
    mockPatch.mockRejectedValueOnce(new Error("API rate limit exceeded"));

    const result = await syncLocationToGbpCommand({ locationId: LOCATION_ID });

    expect(mockLocationUpdate).toHaveBeenCalledWith({
      where: { id: LOCATION_ID },
      data: { gbpSyncError: "GBP API エラー" },
    });
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(result.locationId).toBe(LOCATION_ID);
  });
});
