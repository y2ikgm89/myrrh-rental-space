import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";
import { installEmailLibDispatchMock } from "../../support/email-lib-dispatch-mock";

mock.module("server-only", () => ({}));

const mockGetCustomerSession = mock(() =>
  Promise.resolve({
    user: { id: "user-1", email: "guest@example.com", name: "Dev Test" },
  }),
);

const mockEnsureCustomerLinked = mock(() =>
  Promise.resolve({
    customer: {
      id: "member-1",
      email: "guest@example.com",
      lastName: "開発",
      firstName: "テスト",
      userId: "user-1",
      isActive: true,
      status: "REGULAR",
    },
    isNew: false,
  }),
);

const mockGetAccountProviders = mock(() => Promise.resolve(["google"]));
const mockAssertCustomerActive = mock(() => Promise.resolve(undefined));
const mockAssertLoginSignupReagreed = mock(() => Promise.resolve(undefined));
const mockFindUnlinkedGuest = mock(() =>
  Promise.resolve({ id: "guest-1", email: "guest@example.com" }),
);
const mockGetPreview = mock(() =>
  Promise.resolve({
    guestEmail: "guest@example.com",
    reservationCount: 1,
    inquiryCount: 0,
    reviewCount: 0,
    registrationCount: 0,
  }),
);
const mockRequestMerge = mock(() =>
  Promise.resolve({
    rawToken: "raw-token",
    expiresAt: new Date(),
    guestEmail: "guest@example.com",
  }),
);
const mockConsumeMerge = mock(() =>
  Promise.resolve({
    targetCustomerId: "member-1",
    sourceCustomerId: "guest-1",
    transferredReservations: 1,
    transferredSeries: 0,
    transferredInquiries: 0,
    transferredReviews: 0,
    transferredRegistrations: 0,
    preservedSuppression: false,
  }),
);

const mockCheckActionRateLimit = mock(() => Promise.resolve({ success: true }));
const mockCheckEmailRateLimit = mock(() => Promise.resolve({ success: true }));
const mockSendMergeEmail = mock(() => Promise.resolve({ ok: true }));
const mockCreateAuditLog = mock(() => Promise.resolve(undefined));
const mockBuildAuditContext = mock(() =>
  Promise.resolve({ ip: "127.0.0.1", userAgent: "test" }),
);
const mockUpdateTag = mock(() => undefined);
const mockInvalidateSiteWideCache = mock(() => undefined);
const mockRedirect = mock(() => {
  throw new Error("NEXT_REDIRECT");
});

mock.module("next/headers", () => ({
  headers: mock(() => new Headers()),
}));

mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
}));

mock.module("next/navigation", () => ({
  redirect: mockRedirect,
}));

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetCustomerSession,
  CUSTOMER_TRUSTED_PROVIDERS: ["google"],
}));

mock.module("@/shared/domain/customers/link", () => ({
  ensureCustomerLinked: mockEnsureCustomerLinked,
}));

mock.module("@/shared/domain/users/queries", () => ({
  getAccountProviders: mockGetAccountProviders,
}));

mock.module("@/shared/domain/customers/guard", () => ({
  assertCustomerActive: mockAssertCustomerActive,
}));

mock.module("@/shared/domain/terms/consent-gate", () => ({
  assertLoginSignupReagreed: mockAssertLoginSignupReagreed,
}));

mock.module("@/shared/domain/customers/customer-merge-commands", () => ({
  findUnlinkedGuestCustomerForMember: mockFindUnlinkedGuest,
  getCustomerMergePreviewForGuest: mockGetPreview,
  requestCustomerMergeCommand: mockRequestMerge,
  consumeCustomerMergeTokenCommand: mockConsumeMerge,
}));

mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  checkEmailRateLimit: mockCheckEmailRateLimit,
}));

installEmailLibDispatchMock({
  sendCustomerMergeVerificationEmail: mockSendMergeEmail,
});

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mockCreateAuditLog,
}));

mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: mockBuildAuditContext,
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCache: mockInvalidateSiteWideCache,
}));

mock.module("@/shared/lib/constants", () => ({
  CACHE_TAGS: {
    CUSTOMERS: "customers",
    RESERVATIONS: "reservations",
    INQUIRIES: "inquiries",
    REVIEWS: "reviews",
    SUPPRESSED_EMAILS: "suppressed-emails",
    EVENTS: "events",
  },
  getCacheTag: {
    customers: {
      detail: (id: string) => `customers:${id}`,
    },
  },
  getAppUrl: () => "https://example.com",
}));

const { requestCustomerMergeAction, confirmCustomerMergeAction } =
  await import("@/app/(public)/mypage/_shared/actions/customer-merge");

describe("customer-merge actions", () => {
  beforeEach(() => {
    mockGetCustomerSession.mockClear();
    mockGetAccountProviders.mockClear();
    mockRequestMerge.mockClear();
    mockSendMergeEmail.mockClear();
    mockConsumeMerge.mockClear();
    mockRedirect.mockClear();
    mockGetAccountProviders.mockResolvedValue(["google"]);
  });

  test("requestCustomerMergeAction sends verification email", async () => {
    const result = await requestCustomerMergeAction();
    expect(result).toEqual({
      successMessage:
        "確認メールを送信しました。メールに記載された URL をクリックして統合を完了してください。",
    });
    expect(mockRequestMerge).toHaveBeenCalledWith("member-1", "guest-1");
    expect(mockSendMergeEmail).toHaveBeenCalledTimes(1);
  });

  test("requestCustomerMergeAction rejects non-google providers", async () => {
    mockGetAccountProviders.mockResolvedValueOnce(["line"]);
    const result = await requestCustomerMergeAction();
    expect(result).toMatchObject({
      error: expect.stringContaining("Google"),
    });
  });

  test("confirmCustomerMergeAction consumes token and redirects", async () => {
    const formData = new FormData();
    formData.set("token", "raw-token");
    await expect(confirmCustomerMergeAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mockConsumeMerge).toHaveBeenCalledWith("raw-token", "member-1");
    expect(mockUpdateTag).toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/mypage?merged=ok");
    const redirected = String(mockRedirect.mock.calls[0]?.[0] ?? "");
    expect(redirected).not.toContain("mergeSuccess");
    expect(redirected).not.toMatch(/[^\x00-\x7F]/u);
  });

  test("confirmCustomerMergeAction redirects DomainError to an error sentinel", async () => {
    const domainMessage =
      "確認 URL が無効か有効期限が切れています。マイページから再度統合をリクエストしてください。";
    mockConsumeMerge.mockRejectedValueOnce(
      new DomainError(domainMessage, "VALIDATION"),
    );
    const formData = new FormData();
    formData.set("token", "raw-token");
    await expect(confirmCustomerMergeAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    const redirected = String(mockRedirect.mock.calls[0]?.[0] ?? "");
    expect(redirected).toMatch(/\/mypage\/merge\/confirm\?/u);
    expect(redirected).toMatch(/[?&]error=invalid(?:&|$)/u);
    expect(redirected).toContain("token=raw-token");
    expect(redirected).not.toContain(domainMessage);
    expect(redirected).not.toContain(encodeURIComponent(domainMessage));
  });
});
