import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockCookieGet = mock<(name: string) => { value: string } | undefined>(
  (name) =>
    name === "status-token" ? { value: "valid-status-token" } : undefined,
);
mock.module("next/headers", () => ({
  cookies: mock(() => Promise.resolve({ get: mockCookieGet })),
}));

const mockCheckActionRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);
mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
}));

const mockUserRateLimitCheck = mock(() =>
  Promise.resolve({ success: true, remaining: 20, reset: Date.now() + 60000 }),
);
const mockReservationRateLimitCheck = mock(() =>
  Promise.resolve({ success: true, remaining: 2, reset: Date.now() + 60000 }),
);
mock.module("@/shared/lib/rate-limit", () => ({
  passcodeRevealByIpRateLimiter: {},
  passcodeRevealByUserRateLimiter: { check: mockUserRateLimitCheck },
  passcodeRevealByReservationRateLimiter: {
    check: mockReservationRateLimitCheck,
  },
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

const mockGetPasscodes = mock<
  (...args: unknown[]) => Promise<{
    status: string;
    revealed?: boolean;
    passcodes?: unknown[];
  }>
>(() =>
  Promise.resolve({
    status: "visible",
    revealed: true,
    passcodes: [{ deviceName: "Pad", passcode: "1234" }],
  }),
);
mock.module("@/shared/domain/smart-lock/customer-passcode-queries", () => ({
  getCustomerVisibleSmartLockPasscodesForReservation: mockGetPasscodes,
}));

const mockGetReservationCustomerId = mock(() => Promise.resolve("cust-victim"));
mock.module("@/shared/domain/reservations/customer-queries", () => ({
  getReservationCustomerId: mockGetReservationCustomerId,
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

const IMPORT_PATH =
  "@/app/(public)/_shared/actions/reveal-reservation-passcodes";

describe("revealReservationPasscodesAction", () => {
  beforeEach(() => {
    mockCheckActionRateLimit.mockReset();
    mockVerifyStatusToken.mockReset();
    mockGetPasscodes.mockReset();
    mockGetReservationCustomerId.mockReset();
    mockGetCustomerByUserId.mockReset();
    mockUserRateLimitCheck.mockReset();
    mockReservationRateLimitCheck.mockReset();
    mockGetCustomerSession.mockReset();
    mockCookieGet.mockReset();

    mockCheckActionRateLimit.mockResolvedValue({ success: true });
    mockVerifyStatusToken.mockReturnValue({
      valid: true,
      reservationId: VALID_UUID,
    });
    mockGetPasscodes.mockResolvedValue({
      status: "visible",
      revealed: true,
      passcodes: [{ deviceName: "Pad", passcode: "1234" }],
    });
    mockGetReservationCustomerId.mockResolvedValue("cust-victim");
    mockGetCustomerByUserId.mockResolvedValue(null);
    mockUserRateLimitCheck.mockResolvedValue({
      success: true,
      remaining: 20,
      reset: Date.now() + 60000,
    });
    mockReservationRateLimitCheck.mockResolvedValue({
      success: true,
      remaining: 2,
      reset: Date.now() + 60000,
    });
    mockGetCustomerSession.mockResolvedValue(null);
    mockCookieGet.mockImplementation((name) =>
      name === "status-token" ? { value: "valid-status-token" } : undefined,
    );
  });

  test("ゲスト（session 無し）+ 有効 status token で開示成功", async () => {
    const { revealReservationPasscodesAction } = await import(IMPORT_PATH);
    const result = await revealReservationPasscodesAction(VALID_UUID);
    expect(result).toEqual({
      status: "visible",
      passcodes: [{ deviceName: "Pad", passcode: "1234" }],
    });
    expect(mockGetPasscodes).toHaveBeenCalledWith(
      VALID_UUID,
      { kind: "status-token", reservationId: VALID_UUID },
      expect.objectContaining({ reveal: true }),
    );
    // 純ゲストでも紐付き customerId の active/BLACKLIST gate のため解決する
    expect(mockGetReservationCustomerId).toHaveBeenCalledWith(VALID_UUID);
    expect(mockReservationRateLimitCheck).toHaveBeenCalledWith(VALID_UUID);
  });

  test("ログイン会員 B + 別人予約の status token は ownership で拒否", async () => {
    mockGetCustomerSession.mockResolvedValue({
      user: { id: "user-attacker" },
    });
    mockGetCustomerByUserId.mockResolvedValue({
      id: "cust-attacker",
      userId: "user-attacker",
    });
    mockGetReservationCustomerId.mockResolvedValue("cust-victim");

    const { revealReservationPasscodesAction } = await import(IMPORT_PATH);
    const result = await revealReservationPasscodesAction(VALID_UUID);

    expect(result).toHaveProperty(
      "error",
      "このリンクは別のお客様のご予約です。マイページからご自身のご予約をご確認ください",
    );
    expect(mockGetPasscodes).not.toHaveBeenCalled();
    expect(mockUserRateLimitCheck).toHaveBeenCalledWith("user-attacker");
  });

  test("ログイン会員 + 自分の予約 status token は customer auth で開示", async () => {
    mockGetCustomerSession.mockResolvedValue({
      user: { id: "user-owner" },
    });
    mockGetCustomerByUserId.mockResolvedValue({
      id: "cust-owner",
      userId: "user-owner",
    });
    mockGetReservationCustomerId.mockResolvedValue("cust-owner");

    const { revealReservationPasscodesAction } = await import(IMPORT_PATH);
    const result = await revealReservationPasscodesAction(VALID_UUID);

    expect(result).toHaveProperty("status", "visible");
    expect(mockGetPasscodes).toHaveBeenCalledWith(
      VALID_UUID,
      { kind: "customer", customerId: "cust-owner" },
      expect.objectContaining({ reveal: true }),
    );
  });

  test("無効 status token + session 無しはエラー", async () => {
    mockVerifyStatusToken.mockReturnValue({ valid: false });
    mockCookieGet.mockImplementation((name) =>
      name === "status-token" ? { value: "expired-token" } : undefined,
    );

    const { revealReservationPasscodesAction } = await import(IMPORT_PATH);
    const result = await revealReservationPasscodesAction(VALID_UUID);

    expect(result).toHaveProperty("error", "リンクが無効または期限切れです");
    expect(mockGetPasscodes).not.toHaveBeenCalled();
    expect(mockReservationRateLimitCheck).not.toHaveBeenCalled();
  });

  test("認可通過後の per-reservation rate limit 超過は拒否", async () => {
    mockReservationRateLimitCheck.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 60000,
    });

    const { revealReservationPasscodesAction } = await import(IMPORT_PATH);
    const result = await revealReservationPasscodesAction(VALID_UUID);

    expect(result).toHaveProperty(
      "error",
      "この予約に対する解錠番号の表示試行が多すぎます。しばらく時間をおいてからお試しください",
    );
    expect(mockReservationRateLimitCheck).toHaveBeenCalledWith(VALID_UUID);
    expect(mockGetPasscodes).not.toHaveBeenCalled();
  });

  test("ownership 拒否時は per-reservation rate limit を消費しない", async () => {
    mockGetCustomerSession.mockResolvedValue({
      user: { id: "user-attacker" },
    });
    mockGetCustomerByUserId.mockResolvedValue({
      id: "cust-attacker",
      userId: "user-attacker",
    });
    mockGetReservationCustomerId.mockResolvedValue("cust-victim");

    const { revealReservationPasscodesAction } = await import(IMPORT_PATH);
    const result = await revealReservationPasscodesAction(VALID_UUID);

    expect(result).toHaveProperty(
      "error",
      "このリンクは別のお客様のご予約です。マイページからご自身のご予約をご確認ください",
    );
    expect(mockReservationRateLimitCheck).not.toHaveBeenCalled();
    expect(mockGetPasscodes).not.toHaveBeenCalled();
  });
});
