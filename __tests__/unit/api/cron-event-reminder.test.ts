import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";
import { installEmailRenderContextMock } from "../../support/email-render-context-mock";

// --- モック関数の定義（mock.module() より前）---
const mockFindEventRegistrationsForReminderWindow = mock<
  () => Promise<Record<string, unknown>[]>
>(() => Promise.resolve([]));

const mockSendEventReminderEmail = mock<
  () => Promise<{
    ok: boolean;
    messageId?: string;
    reason?: string;
    error?: string;
  }>
>(() => Promise.resolve({ ok: true, messageId: "re_test_id" }));

const mockClaimEventRegistrationReminder = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);

const mockReleaseEventRegistrationReminderClaim = mock<() => Promise<void>>(
  () => Promise.resolve(),
);

const mockGetEmailDeliverySettings = mock<
  () => Promise<{ notifyEventReminder: boolean }>
>(() => Promise.resolve({ notifyEventReminder: true }));

const mockGetEventEmailRenderContext = mock<
  () => Promise<{
    calendarSettings: {
      icalAttachmentEnabled: boolean;
      addToCalendarLinksEnabled: boolean;
    };
    organizer: { name: string; email: string };
  }>
>(() =>
  Promise.resolve({
    calendarSettings: {
      icalAttachmentEnabled: false,
      addToCalendarLinksEnabled: false,
    },
    organizer: { name: "Test Org", email: "org@example.com" },
  }),
);

const mockLogError = mock<() => void>(() => undefined);

const mockAuthorizeCronRequest = mock<() => Promise<Response | null>>(() =>
  Promise.resolve(null),
);

const mockIsFeatureEnabled = mock<(module: string) => Promise<boolean>>(() =>
  Promise.resolve(true),
);

const mockIsEmailEnabled = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);

const mockConnection = mock<() => Promise<void>>(() => Promise.resolve());

const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});

// --- mock.module() は await import() より前 ---

mock.module("next/server", () => ({
  connection: () => mockConnection(),
  NextResponse,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/domain/events/registration-queries", () => ({
  findEventRegistrationsForReminderWindow: (
    ...args: Parameters<typeof mockFindEventRegistrationsForReminderWindow>
  ) => mockFindEventRegistrationsForReminderWindow(...args),
}));

mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventReminderEmail: (
    ...args: Parameters<typeof mockSendEventReminderEmail>
  ) => mockSendEventReminderEmail(...args),
  buildEventRegistrationHubUrl: () => "https://example.com/events/hub",
  buildMemberEventRegistrationUrl: () => "https://example.com/mypage/events/x",
}));

mock.module("@/shared/domain/events/registration-commands", () => ({
  claimEventRegistrationReminder: (
    ...args: Parameters<typeof mockClaimEventRegistrationReminder>
  ) => mockClaimEventRegistrationReminder(...args),
  releaseEventRegistrationReminderClaim: (
    ...args: Parameters<typeof mockReleaseEventRegistrationReminderClaim>
  ) => mockReleaseEventRegistrationReminderClaim(...args),
}));

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: (
    ...args: Parameters<typeof mockGetEmailDeliverySettings>
  ) => mockGetEmailDeliverySettings(...args),
}));

installEmailRenderContextMock({
  getEventEmailRenderContext: (
    ...args: Parameters<typeof mockGetEventEmailRenderContext>
  ) => mockGetEventEmailRenderContext(...args),
  isEmailEnabled: (...args: Parameters<typeof mockIsEmailEnabled>) =>
    mockIsEmailEnabled(...args),
  resolveEmailSendContext: mock(async () => ({
    transport: { resendApiKey: "re_test_key" },
    delivery: {
      senderEmail: "noreply@example.com",
      senderName: "Test",
      replyToEmail: null,
    },
    suppressedEmailHashes: new Set<string>(),
  })),
});

mock.module("@/shared/lib/events/venue", () => ({
  formatEventVenue: (params: {
    location: { name: string } | null;
    space: { name: string } | null;
    addressDetail: string | null;
  }) => params.location?.name ?? params.space?.name ?? params.addressDetail,
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: Parameters<typeof mockLogError>) => mockLogError(...args),
  createErrorLogger: mock(() => ({
    error: mock(),
    warn: mock(),
    info: mock(),
  })),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  safeFetch: mock(async (opts: { fetch: () => unknown; fallback: unknown }) => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  }),
  criticalFetch: mock(async (opts: { fetch: () => unknown }) => opts.fetch()),
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

mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: (...args: Parameters<typeof mockIsFeatureEnabled>) =>
    mockIsFeatureEnabled(...args),
}));

mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (error: string, status = 400) =>
    NextResponse.json({ error }, { status }),
  jsonSuccess: <T>(data: T, status = 200) =>
    NextResponse.json(data, { status }),
}));

const { GET } = await import("@/app/api/cron/event-reminder/route");

// --- テスト用ヘルパー ---

function makeSchedulerRequest() {
  const headers = new Headers();
  headers.set("authorization", "Bearer cloud-scheduler-oidc-token");
  return new Request("http://localhost/api/cron/event-reminder", { headers });
}

function makeRegistration(overrides: Record<string, unknown> = {}) {
  return {
    id: "reg-1",
    name: "山田 太郎",
    email: "customer@example.com",
    quantity: 2,
    icsSequence: 0,
    slot: {
      startAt: new Date("2026-07-16T04:00:00Z"),
      endAt: new Date("2026-07-16T08:00:00Z"),
    },
    event: {
      title: "テストイベント",
      addressDetail: null,
      location: { name: "テスト会場" },
      space: null,
      format: "OFFLINE",
      meetingUrl: null,
    },
    ...overrides,
  };
}

describe("GET /api/cron/event-reminder", () => {
  beforeEach(() => {
    mockFindEventRegistrationsForReminderWindow.mockReset();
    mockSendEventReminderEmail.mockReset();
    mockClaimEventRegistrationReminder.mockReset();
    mockReleaseEventRegistrationReminderClaim.mockReset();
    mockGetEmailDeliverySettings.mockReset();
    mockGetEventEmailRenderContext.mockReset();
    mockLogError.mockReset();
    mockAuthorizeCronRequest.mockReset();
    mockIsFeatureEnabled.mockReset();
    mockIsEmailEnabled.mockReset();
    mockConnection.mockReset();
    mockUnstableRethrow.mockReset();

    mockConnection.mockResolvedValue(undefined);
    mockAuthorizeCronRequest.mockResolvedValue(null);
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockIsEmailEnabled.mockResolvedValue(true);
    mockGetEmailDeliverySettings.mockResolvedValue({
      notifyEventReminder: true,
    });
    mockGetEventEmailRenderContext.mockResolvedValue({
      calendarSettings: {
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: false,
      },
      organizer: { name: "Test Org", email: "org@example.com" },
    });
    mockFindEventRegistrationsForReminderWindow.mockResolvedValue([]);
    mockClaimEventRegistrationReminder.mockResolvedValue(true);
    mockReleaseEventRegistrationReminderClaim.mockResolvedValue(undefined);
    mockSendEventReminderEmail.mockResolvedValue({
      ok: true,
      messageId: "re_test_id",
    });
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

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(401);
    expect(mockFindEventRegistrationsForReminderWindow).not.toHaveBeenCalled();
  });

  test("events feature module OFF → skipped:feature_disabled", async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ skipped: true, reason: "feature_disabled" });
    expect(mockGetEmailDeliverySettings).not.toHaveBeenCalled();
  });

  test("Settings.notifyEventReminder OFF → skipped:notification_disabled（既定 OFF の確認）", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      notifyEventReminder: false,
    });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ skipped: true, reason: "notification_disabled" });
    expect(mockFindEventRegistrationsForReminderWindow).not.toHaveBeenCalled();
  });

  test("email disabled (isEmailEnabled=false) → skipped:email_disabled、claim 前に早期 return", async () => {
    mockIsEmailEnabled.mockResolvedValue(false);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ skipped: true, reason: "email_disabled" });
    expect(mockFindEventRegistrationsForReminderWindow).not.toHaveBeenCalled();
    expect(mockClaimEventRegistrationReminder).not.toHaveBeenCalled();
    expect(mockSendEventReminderEmail).not.toHaveBeenCalled();
  });

  test("申込なし → sent=0, skipped=0, total=0", async () => {
    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ sent: 0, skipped: 0, total: 0 });
  });

  test("申込あり + メール送信成功 → sent=1、claim を先に取得する", async () => {
    mockFindEventRegistrationsForReminderWindow.mockResolvedValue([
      makeRegistration(),
    ]);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ sent: 1, skipped: 0, total: 1 });
    expect(mockClaimEventRegistrationReminder).toHaveBeenCalledWith("reg-1");
    expect(mockSendEventReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: "reg-1",
        customerEmail: "customer@example.com",
        customerName: "山田 太郎",
        eventTitle: "テストイベント",
        quantity: 2,
      }),
      {
        calendarSettings: {
          icalAttachmentEnabled: false,
          addToCalendarLinksEnabled: false,
        },
        organizer: { name: "Test Org", email: "org@example.com" },
      },
      expect.objectContaining({
        transport: { resendApiKey: "re_test_key" },
      }),
    );
    expect(mockReleaseEventRegistrationReminderClaim).not.toHaveBeenCalled();
  });

  test("email なし → skipped=1", async () => {
    mockFindEventRegistrationsForReminderWindow.mockResolvedValue([
      makeRegistration({ email: null }),
    ]);

    const response = await GET(makeSchedulerRequest());

    const body = await response.json();
    expect(body).toEqual({ sent: 0, skipped: 1, total: 1 });
    expect(mockSendEventReminderEmail).not.toHaveBeenCalled();
  });

  test("claim 失敗（二重起動 / 既送信）→ メール送信せず skipped=1", async () => {
    mockFindEventRegistrationsForReminderWindow.mockResolvedValue([
      makeRegistration(),
    ]);
    mockClaimEventRegistrationReminder.mockResolvedValue(false);

    const response = await GET(makeSchedulerRequest());

    const body = await response.json();
    expect(body).toEqual({ sent: 0, skipped: 1, total: 1 });
    expect(mockSendEventReminderEmail).not.toHaveBeenCalled();
    expect(mockReleaseEventRegistrationReminderClaim).not.toHaveBeenCalled();
  });

  test("メール送信が例外をスロー → claim を release + skipped=1 + logError", async () => {
    mockFindEventRegistrationsForReminderWindow.mockResolvedValue([
      makeRegistration(),
    ]);
    const emailError = new Error("SMTP connection failed");
    mockSendEventReminderEmail.mockRejectedValue(emailError);

    const response = await GET(makeSchedulerRequest());

    const body = await response.json();
    expect(body).toEqual({ sent: 0, skipped: 1, total: 1 });
    expect(mockReleaseEventRegistrationReminderClaim).toHaveBeenCalledWith(
      "reg-1",
    );
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("メール送信が ok:false (disabled) → race defense-in-depth: claim を保持 + 集約 logError", async () => {
    mockFindEventRegistrationsForReminderWindow.mockResolvedValue([
      makeRegistration(),
    ]);
    mockSendEventReminderEmail.mockResolvedValue({
      ok: false,
      reason: "disabled",
    });

    const response = await GET(makeSchedulerRequest());

    const body = await response.json();
    expect(body).toEqual({ sent: 0, skipped: 1, total: 1 });
    expect(mockReleaseEventRegistrationReminderClaim).not.toHaveBeenCalled();
    // 実行中 disabled 化の race のみここに到達するため、集約 logError を発火する。
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        category: "EXTERNAL_API",
        severity: "HIGH",
        context: expect.objectContaining({
          operation: "eventReminderCron",
          disabledCount: 1,
        }),
      }),
    );
  });

  test("メール送信が ok:false (error) → claim を release + skipped=1", async () => {
    mockFindEventRegistrationsForReminderWindow.mockResolvedValue([
      makeRegistration(),
    ]);
    mockSendEventReminderEmail.mockResolvedValue({
      ok: false,
      reason: "error",
      error: "メール送信に失敗しました",
    });

    const response = await GET(makeSchedulerRequest());

    const body = await response.json();
    expect(body).toEqual({ sent: 0, skipped: 1, total: 1 });
    expect(mockReleaseEventRegistrationReminderClaim).toHaveBeenCalledWith(
      "reg-1",
    );
  });

  test("findEventRegistrationsForReminderWindow が例外をスロー → 500 を返す", async () => {
    const dbError = new Error("Database connection failed");
    mockFindEventRegistrationsForReminderWindow.mockRejectedValue(dbError);
    mockUnstableRethrow.mockImplementation(() => {});

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Internal error" });
  });
});
