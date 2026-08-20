import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

type HealthRow = {
  integration: string;
  status: string | null;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastErrorMessage: string | null;
};

const mockFindUnique = mock<(args: unknown) => Promise<HealthRow | null>>(() =>
  Promise.resolve(null),
);
const mockFindMany = mock<() => Promise<HealthRow[]>>(() =>
  Promise.resolve([]),
);
const mockUpsert = mock<(args: unknown) => Promise<HealthRow>>(() =>
  Promise.resolve({
    integration: "RESEND",
    status: "CONNECTED",
    consecutiveFailures: 0,
    lastSuccessAt: new Date(),
    lastFailureAt: null,
    lastErrorMessage: null,
  }),
);
const mockUpdate = mock<(args: unknown) => Promise<HealthRow>>(() =>
  Promise.resolve({
    integration: "GOOGLE_CALENDAR",
    status: "ERROR",
    consecutiveFailures: 3,
    lastSuccessAt: null,
    lastFailureAt: new Date(),
    lastErrorMessage: "boom",
  }),
);
const mockLogError = mock(() => undefined);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    integrationHealth: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      upsert: mockUpsert,
      update: mockUpdate,
    },
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { HIGH: "HIGH" },
}));

await installPrismaEnumsMock();

const {
  CONNECTION_FAILURE_THRESHOLD,
  clearConnectionHealth,
  getConnectionHealth,
  isPermanentConnectionFailure,
  recordConnectionApiResult,
  recordConnectionFailure,
  recordConnectionSuccess,
} = await import("@/shared/domain/settings/connection-health");
const { ConnectionStatus, IntegrationKey } =
  await import("@/shared/lib/validations/enums/prisma-types");

describe("isPermanentConnectionFailure", () => {
  test("Google 401 / invalid_grant は恒久、429 は一時", () => {
    expect(
      isPermanentConnectionFailure(IntegrationKey.GOOGLE_CALENDAR, {
        code: 401,
      }),
    ).toBe(true);
    expect(
      isPermanentConnectionFailure(IntegrationKey.GOOGLE_CALENDAR, {
        code: 400,
        message: "invalid_grant",
      }),
    ).toBe(true);
    expect(
      isPermanentConnectionFailure(IntegrationKey.GOOGLE_CALENDAR, {
        code: 429,
      }),
    ).toBe(false);
  });

  test("Stripe は authentication_error だけ恒久", () => {
    expect(
      isPermanentConnectionFailure(IntegrationKey.STRIPE, {
        type: "authentication_error",
      }),
    ).toBe(true);
    expect(
      isPermanentConnectionFailure(IntegrationKey.STRIPE, {
        type: "card_error",
      }),
    ).toBe(false);
  });

  test("Resend 401 と Instagram 190 と Turnstile secret は恒久", () => {
    expect(
      isPermanentConnectionFailure(IntegrationKey.RESEND, { statusCode: 401 }),
    ).toBe(true);
    expect(
      isPermanentConnectionFailure(IntegrationKey.INSTAGRAM, { code: 190 }),
    ).toBe(true);
    expect(
      isPermanentConnectionFailure(IntegrationKey.TURNSTILE, {
        "error-codes": ["invalid-input-secret"],
      }),
    ).toBe(true);
  });
});

describe("recordConnectionSuccess", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpsert.mockReset();
  });

  test("既に CONNECTED かつ failures=0 なら書かない", async () => {
    mockFindUnique.mockImplementation(() =>
      Promise.resolve({
        integration: "RESEND",
        status: ConnectionStatus.CONNECTED,
        consecutiveFailures: 0,
        lastSuccessAt: new Date(),
        lastFailureAt: null,
        lastErrorMessage: null,
      }),
    );

    await recordConnectionSuccess(IntegrationKey.RESEND);

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("ERROR からは CONNECTED に復帰する", async () => {
    mockFindUnique.mockImplementation(() =>
      Promise.resolve({
        integration: "RESEND",
        status: ConnectionStatus.ERROR,
        consecutiveFailures: 3,
        lastSuccessAt: null,
        lastFailureAt: new Date(),
        lastErrorMessage: "boom",
      }),
    );

    await recordConnectionSuccess(IntegrationKey.RESEND);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const args = mockUpsert.mock.calls[0]?.[0] as {
      update: { status: string; consecutiveFailures: number };
    };
    expect(args.update.status).toBe(ConnectionStatus.CONNECTED);
    expect(args.update.consecutiveFailures).toBe(0);
  });
});

describe("recordConnectionFailure", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpsert.mockReset();
    mockUpdate.mockReset();
    mockLogError.mockReset();
  });

  test("一時失敗は increment を渡し、閾値未満なら ERROR にしない", async () => {
    mockUpsert.mockImplementation(() =>
      Promise.resolve({
        integration: "GOOGLE_CALENDAR",
        status: ConnectionStatus.CONNECTED,
        consecutiveFailures: 2,
        lastSuccessAt: new Date(),
        lastFailureAt: new Date(),
        lastErrorMessage: "unavailable",
      }),
    );

    await recordConnectionFailure(IntegrationKey.GOOGLE_CALENDAR, {
      code: 503,
    });

    const args = mockUpsert.mock.calls[0]?.[0] as {
      create: { consecutiveFailures: number };
      update: {
        status?: string | null;
        consecutiveFailures: { increment: number } | number;
      };
    };
    expect(args.create.consecutiveFailures).toBe(1);
    expect(args.update.consecutiveFailures).toEqual({ increment: 1 });
    expect(args.update.status).toBeUndefined();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockLogError).not.toHaveBeenCalled();
  });

  test("一時失敗が閾値に達したら ERROR になり HIGH ログする", async () => {
    mockUpsert.mockImplementation(() =>
      Promise.resolve({
        integration: "GOOGLE_CALENDAR",
        status: ConnectionStatus.CONNECTED,
        consecutiveFailures: CONNECTION_FAILURE_THRESHOLD,
        lastSuccessAt: new Date(),
        lastFailureAt: new Date(),
        lastErrorMessage: "unavailable",
      }),
    );

    await recordConnectionFailure(IntegrationKey.GOOGLE_CALENDAR, {
      code: 503,
    });

    const upsertArgs = mockUpsert.mock.calls[0]?.[0] as {
      update: { consecutiveFailures: { increment: number } | number };
    };
    expect(upsertArgs.update.consecutiveFailures).toEqual({ increment: 1 });
    const updateArgs = mockUpdate.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(updateArgs.data.status).toBe(ConnectionStatus.ERROR);
    expect(mockLogError).toHaveBeenCalled();
  });

  test("恒久失敗は即 ERROR", async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null));

    await recordConnectionFailure(IntegrationKey.STRIPE, {
      type: "authentication_error",
      message: "Invalid API Key",
    });

    const args = mockUpsert.mock.calls[0]?.[0] as {
      create: { status: string; consecutiveFailures: number };
    };
    expect(args.create.status).toBe(ConnectionStatus.ERROR);
    expect(args.create.consecutiveFailures).toBe(CONNECTION_FAILURE_THRESHOLD);
  });
});

describe("getConnectionHealth / clearConnectionHealth", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpsert.mockReset();
  });

  test("行が無ければ未接続スナップショット", async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null));
    await expect(
      getConnectionHealth(IntegrationKey.INSTAGRAM),
    ).resolves.toEqual({
      status: null,
      lastCheckedAt: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
    });
  });

  test("clear は status とカウンタを戻す", async () => {
    await clearConnectionHealth(IntegrationKey.RESEND);
    const args = mockUpsert.mock.calls[0]?.[0] as {
      update: { status: null; consecutiveFailures: number };
    };
    expect(args.update.status).toBeNull();
    expect(args.update.consecutiveFailures).toBe(0);
  });
});

describe("recordConnectionApiResult", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpsert.mockReset();
  });

  test("success は CONNECTED に復帰する", async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null));
    await recordConnectionApiResult(IntegrationKey.INSTAGRAM, {
      success: true,
    });
    const args = mockUpsert.mock.calls[0]?.[0] as {
      update: { status: string };
    };
    expect(args.update.status).toBe(ConnectionStatus.CONNECTED);
  });
});
