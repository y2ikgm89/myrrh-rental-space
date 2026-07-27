import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockCookieGet = mock<(name: string) => { value: string } | undefined>(
  (name) =>
    name === "status-token" ? { value: "valid-status-token" } : undefined,
);
mock.module("next/headers", () => ({
  cookies: mock(() => Promise.resolve({ get: mockCookieGet })),
  headers: mock(() => Promise.resolve(new Headers())),
}));
mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

const mockCheckActionRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);
const mockValidateTurnstile = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);
mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  validateTurnstile: mockValidateTurnstile,
}));

mock.module("@/shared/domain/settings/maintenance-guard", () => ({
  checkPublicSiteWritable: mock(() => Promise.resolve({ ok: true as const })),
  getPublicMaintenanceBlockMutation: mock(() => Promise.resolve(null)),
}));

const mockPerReservationCheck = mock(() =>
  Promise.resolve({ success: true, remaining: 3, reset: Date.now() + 3600000 }),
);
mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
  editByReservationRateLimiter: { check: mockPerReservationCheck },
  getClientIpFromHeaders: mock(() => Promise.resolve("127.0.0.1")),
}));

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const mockVerifyStatusToken = mock<
  (
    token: string,
    now: Date,
  ) => { valid: true; reservationId: string } | { valid: false }
>(() => ({
  valid: true,
  reservationId: VALID_UUID,
}));
mock.module("@/shared/lib/reservation-status-token", () => ({
  verifyStatusToken: mockVerifyStatusToken,
}));

mock.module("@/shared/lib/tokens/fingerprint", () => ({
  tokenFingerprint: () => "abcd1234abcd1234",
}));

mock.module("@/shared/domain/settings/public-queries", () => ({
  getReservationDeadlineSettings: mock(() =>
    Promise.resolve({
      cancellationDeadlineHours: 24,
      modificationDeadlineHours: 24,
    }),
  ),
}));

const mockUpdateGuest = mock<
  (
    ...args: unknown[]
  ) => Promise<{ success: boolean; error?: string; payload?: unknown }>
>(() =>
  Promise.resolve({
    success: true,
    payload: { reservationId: VALID_UUID, googleCalendarEventId: null },
  }),
);
mock.module("@/shared/domain/reservations/customer-commands", () => ({
  updateGuestReservationByToken: mockUpdateGuest,
  cancelReservationByToken: mock(() =>
    Promise.resolve({ success: false, error: "not used" }),
  ),
  cancelCustomerReservation: mock(() =>
    Promise.resolve({ success: false, error: "not used" }),
  ),
  updateCustomerReservation: mock(() =>
    Promise.resolve({ success: false, error: "not used" }),
  ),
  cancelCustomerReservationSeries: mock(() =>
    Promise.resolve({ success: false, error: "not used" }),
  ),
}));

mock.module("@/shared/domain/reservations/edit-side-effects", () => ({
  getReservationSnapshotForGuestEdit: mock(() =>
    Promise.resolve({
      spaceId: "space-1",
      startTime: new Date("2026-12-01T00:00:00.000Z"),
      endTime: new Date("2026-12-01T02:00:00.000Z"),
    }),
  ),
  applyReservationEditSideEffects: mock(() =>
    Promise.resolve({ passcodes: [], issuanceFailed: false }),
  ),
}));

const mockGetReservationForGuestEdit = mock(() =>
  Promise.resolve({
    id: VALID_UUID,
    customerId: "cust-victim",
  }),
);
mock.module("@/shared/domain/reservations/customer-queries", () => ({
  getReservationForGuestEdit: mockGetReservationForGuestEdit,
}));

const mockGetCustomerByUserId = mock<
  () => Promise<{ id: string; userId: string } | null>
>(() => Promise.resolve(null));
mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mockGetCustomerByUserId,
}));

mock.module("@/shared/domain/customers/guard", () => ({
  assertCustomerActive: mock(() => Promise.resolve(undefined)),
}));
mock.module("@/shared/domain/customers/guest-token-gates", () => ({
  assertGuestTokenCustomerGates: mock(() => Promise.resolve(undefined)),
}));

const mockGetCustomerSession = mock<
  () => Promise<{ user: { id: string } } | null>
>(() => Promise.resolve(null));
mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetCustomerSession,
}));

mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: mock(() => Promise.resolve(true)),
}));

mock.module("@/shared/lib/cache/reservation-cache", () => ({
  invalidateReservationCaches: mock(() => undefined),
}));

mock.module("@/shared/domain/reservations/payloads", () => ({
  fetchReservationEmailData: mock(() => Promise.resolve(null)),
}));

mock.module(
  "@/shared/domain/reservations/reservation-calendar-outbound",
  () => ({
    syncReservationToCalendar: mock(() => Promise.resolve({ success: true })),
    updateCalendarSync: mock(() => Promise.resolve({ success: true })),
  }),
);

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mock(() => Promise.resolve()),
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mock(() => Promise.resolve()),
}));

mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationUpdatedEmail: mock(() => Promise.resolve()),
  sendReservationAdminNotification: mock(() => Promise.resolve()),
}));

const mockFireAndForget = mock(() => undefined);
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mockFireAndForget,
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: { AUTHORIZATION: "AUTHORIZATION", DATABASE: "DATABASE" },
  ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" },
}));

const IMPORT_PATH = "@/app/(public)/reservation/status/edit/_actions/update";

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("reservationId", VALID_UUID);
  fd.set("spaceId", "22222222-2222-4222-8222-222222222222");
  fd.set("date", "2026-12-01");
  fd.set("startTime", "10:00");
  fd.set("endTime", "12:00");
  fd.set("numberOfGuests", "1");
  fd.set("version", "1");
  fd.set("turnstileToken", "ts-token");
  for (const [key, value] of Object.entries(overrides)) {
    fd.set(key, value);
  }
  return fd;
}

describe("updateGuestReservationAction", () => {
  beforeEach(() => {
    mockCheckActionRateLimit.mockReset();
    mockValidateTurnstile.mockReset();
    mockVerifyStatusToken.mockReset();
    mockUpdateGuest.mockReset();
    mockCookieGet.mockReset();
    mockPerReservationCheck.mockReset();
    mockGetCustomerSession.mockReset();
    mockGetCustomerByUserId.mockReset();
    mockGetReservationForGuestEdit.mockReset();
    mockFireAndForget.mockReset();
    mockCheckActionRateLimit.mockResolvedValue({ success: true });
    mockValidateTurnstile.mockResolvedValue({ success: true });
    mockVerifyStatusToken.mockReturnValue({
      valid: true,
      reservationId: VALID_UUID,
    });
    mockUpdateGuest.mockResolvedValue({
      success: true,
      payload: { reservationId: VALID_UUID, googleCalendarEventId: null },
    });
    mockPerReservationCheck.mockResolvedValue({
      success: true,
      remaining: 3,
      reset: Date.now() + 3600000,
    });
    mockGetCustomerSession.mockResolvedValue(null);
    mockGetCustomerByUserId.mockResolvedValue(null);
    mockGetReservationForGuestEdit.mockResolvedValue({
      id: VALID_UUID,
      customerId: "cust-victim",
    });
    mockCookieGet.mockImplementation((name) =>
      name === "status-token" ? { value: "valid-status-token" } : undefined,
    );
  });

  test("有効 status token（cookie）で更新成功", async () => {
    const { updateGuestReservationAction } = await import(IMPORT_PATH);
    const result = await updateGuestReservationAction(
      undefined,
      buildFormData(),
    );
    expect(result.initialValue).toBeNull();
    expect(mockUpdateGuest).toHaveBeenCalledTimes(1);
    expect(mockFireAndForget).toHaveBeenCalled();
  });

  test("無効 status token はエラー", async () => {
    mockVerifyStatusToken.mockReturnValue({ valid: false });
    const { updateGuestReservationAction } = await import(IMPORT_PATH);
    const result = await updateGuestReservationAction(
      undefined,
      buildFormData(),
    );
    expect(result.status).toBe("error");
    expect(mockUpdateGuest).not.toHaveBeenCalled();
  });

  test("ログイン会員 B + 別人予約 token は ownership で拒否", async () => {
    mockGetCustomerSession.mockResolvedValue({
      user: { id: "user-attacker" },
    });
    mockGetCustomerByUserId.mockResolvedValue({
      id: "cust-attacker",
      userId: "user-attacker",
    });
    mockGetReservationForGuestEdit.mockResolvedValue({
      id: VALID_UUID,
      customerId: "cust-victim",
    });

    const { updateGuestReservationAction } = await import(IMPORT_PATH);
    const result = await updateGuestReservationAction(
      undefined,
      buildFormData(),
    );
    expect(result.status).toBe("error");
    expect(mockUpdateGuest).not.toHaveBeenCalled();
  });

  test("per-reservation rate-limit 超過時はドメインを呼ばない", async () => {
    mockPerReservationCheck.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: Date.now() + 3600000,
    });
    const { updateGuestReservationAction } = await import(IMPORT_PATH);
    const result = await updateGuestReservationAction(
      undefined,
      buildFormData(),
    );
    expect(result.status).toBe("error");
    expect(mockUpdateGuest).not.toHaveBeenCalled();
  });

  test("cookie に status token が無いとエラー", async () => {
    mockCookieGet.mockImplementation(() => undefined);
    const { updateGuestReservationAction } = await import(IMPORT_PATH);
    const result = await updateGuestReservationAction(
      undefined,
      buildFormData(),
    );
    expect(result.status).toBe("error");
    expect(mockUpdateGuest).not.toHaveBeenCalled();
  });

  test("Turnstile 失敗時はドメインを呼ばない", async () => {
    mockValidateTurnstile.mockResolvedValue({
      success: false,
      error: "認証に失敗しました",
    });
    const { updateGuestReservationAction } = await import(IMPORT_PATH);
    const result = await updateGuestReservationAction(
      undefined,
      buildFormData(),
    );
    expect(result.status).toBe("error");
    expect(mockUpdateGuest).not.toHaveBeenCalled();
  });

  test("reservationId 不一致は stale-tab で拒否", async () => {
    const { updateGuestReservationAction } = await import(IMPORT_PATH);
    const result = await updateGuestReservationAction(
      undefined,
      buildFormData({
        reservationId: "33333333-3333-4333-8333-333333333333",
      }),
    );
    expect(result.status).toBe("error");
    expect(mockUpdateGuest).not.toHaveBeenCalled();
  });

  test("ドメイン UNPAID gate エラーを返す", async () => {
    mockUpdateGuest.mockResolvedValue({
      success: false,
      error:
        "決済処理が開始された予約は変更できません。キャンセル後に新規予約をお願いいたします。",
    });
    const { updateGuestReservationAction } = await import(IMPORT_PATH);
    const result = await updateGuestReservationAction(
      undefined,
      buildFormData(),
    );
    expect(result.status).toBe("error");
  });
});
