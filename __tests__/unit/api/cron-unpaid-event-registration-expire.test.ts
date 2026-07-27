import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";
import { CACHE_TAGS } from "@/shared/lib/constants";

const mockExpireStaleUnpaidEventRegistrationsCommand = mock<
  () => Promise<{
    expired: {
      id: string;
      eventId: string;
      slotId: string;
      ticketId: string;
      ageMinutes: number;
    }[];
    total: number;
  }>
>(() => Promise.resolve({ expired: [], total: 0 }));

const mockInvalidateSiteWideCacheFromRouteHandler = mock<
  (tags: readonly string[]) => void
>(() => undefined);

const mockAuthorizeCronRequest = mock<() => Promise<Response | null>>(() =>
  Promise.resolve(null),
);

const mockIsFeatureEnabled = mock<(module: string) => Promise<boolean>>(() =>
  Promise.resolve(true),
);

const mockConnection = mock<() => Promise<void>>(() => Promise.resolve());
const mockLogError = mock(() => undefined);

const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});

mock.module("next/server", () => ({
  connection: () => mockConnection(),
  NextResponse,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/domain/events/unpaid-expiry", () => ({
  expireStaleUnpaidEventRegistrationsCommand: () =>
    mockExpireStaleUnpaidEventRegistrationsCommand(),
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler: (
    ...args: Parameters<typeof mockInvalidateSiteWideCacheFromRouteHandler>
  ) => mockInvalidateSiteWideCacheFromRouteHandler(...args),
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

mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { HIGH: "HIGH" },
}));

const { GET } =
  await import("@/app/api/cron/unpaid-event-registration-expire/route");

function cronRequest(): Request {
  return new Request(
    "http://localhost/api/cron/unpaid-event-registration-expire",
    {
      headers: { Authorization: "Bearer cloud-scheduler-oidc-token" },
    },
  );
}

describe("GET /api/cron/unpaid-event-registration-expire", () => {
  beforeEach(() => {
    mockExpireStaleUnpaidEventRegistrationsCommand.mockReset();
    mockInvalidateSiteWideCacheFromRouteHandler.mockReset();
    mockAuthorizeCronRequest.mockReset();
    mockIsFeatureEnabled.mockReset();
    mockConnection.mockClear();
    mockAuthorizeCronRequest.mockResolvedValue(null);
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockExpireStaleUnpaidEventRegistrationsCommand.mockResolvedValue({
      expired: [],
      total: 0,
    });
  });

  test("認可失敗時は domain command を呼ばない", async () => {
    mockAuthorizeCronRequest.mockResolvedValueOnce(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    await GET(cronRequest());

    expect(
      mockExpireStaleUnpaidEventRegistrationsCommand,
    ).not.toHaveBeenCalled();
  });

  test("events feature OFF なら skip し domain command を呼ばない", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);

    const response = await GET(cronRequest());
    const body = (await response.json()) as {
      skipped?: boolean;
      reason?: string;
    };

    expect(body).toMatchObject({
      skipped: true,
      reason: "feature_disabled",
    });
    expect(
      mockExpireStaleUnpaidEventRegistrationsCommand,
    ).not.toHaveBeenCalled();
  });

  test("expire 件数 > 0 なら EVENTS / EVENT_WAITLIST cache を無効化する", async () => {
    mockExpireStaleUnpaidEventRegistrationsCommand.mockResolvedValueOnce({
      total: 1,
      expired: [
        {
          id: "reg-1",
          eventId: "event-1",
          slotId: "slot-1",
          ticketId: "ticket-1",
          ageMinutes: 65,
        },
      ],
    });

    const response = await GET(cronRequest());
    const body = (await response.json()) as {
      expired: number;
    };

    expect(body.expired).toBe(1);
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledWith([
      CACHE_TAGS.EVENTS,
      CACHE_TAGS.EVENT_WAITLIST,
    ]);
  });
});
