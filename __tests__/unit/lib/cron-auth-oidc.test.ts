import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockLogError = mock();
const mockServerEnv: {
  CRON_OIDC_AUDIENCE: string | undefined;
  CRON_SERVICE_ACCOUNT_EMAIL: string | undefined;
} = {
  CRON_OIDC_AUDIENCE: "https://www.myrrh.example",
  CRON_SERVICE_ACCOUNT_EMAIL:
    "myrrh-rental-space-scheduler@example-project.iam.gserviceaccount.com",
};

mock.module("@/shared/lib/errors/logger-core", () => ({
  logError: mockLogError,
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
}));

const { authorizeCronRequest } = await import("@/shared/lib/cron-auth");

function cronRequest(authorization: string | null): Request {
  const init: RequestInit = {};
  if (authorization !== null) {
    init.headers = { authorization };
  }
  return new Request("https://www.myrrh.example/api/cron/calendar-sync", {
    ...init,
  });
}

describe("authorizeCronRequest (Cloud Scheduler OIDC)", () => {
  beforeEach(() => {
    mockLogError.mockReset();
    mockServerEnv.CRON_OIDC_AUDIENCE = "https://www.myrrh.example";
    mockServerEnv.CRON_SERVICE_ACCOUNT_EMAIL =
      "myrrh-rental-space-scheduler@example-project.iam.gserviceaccount.com";
  });

  test("accepts a Cloud Scheduler OIDC token from the configured service account", async () => {
    const verifyToken = mock(async () => ({
      email:
        "myrrh-rental-space-scheduler@example-project.iam.gserviceaccount.com",
      subject: "scheduler-service-account-subject",
    }));

    const result = await authorizeCronRequest({
      request: cronRequest("Bearer scheduler-id-token"),
      operation: "calendar-sync",
      verifyToken,
    });

    expect(result).toBeNull();
    expect(verifyToken).toHaveBeenCalledWith(
      "scheduler-id-token",
      "https://www.myrrh.example",
    );
  });

  test("rejects valid Google ID tokens from any non-scheduler service account", async () => {
    const result = await authorizeCronRequest({
      request: cronRequest("Bearer other-id-token"),
      operation: "calendar-sync",
      verifyToken: mock(async () => ({
        email: "other@example-project.iam.gserviceaccount.com",
        subject: "other-subject",
      })),
    });

    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
  });

  test("rejects missing or non-Bearer authorization headers", async () => {
    const verifyToken = mock(async () => ({
      email:
        "myrrh-rental-space-scheduler@example-project.iam.gserviceaccount.com",
      subject: "scheduler-service-account-subject",
    }));

    for (const authorization of [null, "Basic abc", "Bearer "]) {
      const result = await authorizeCronRequest({
        request: cronRequest(authorization),
        operation: "calendar-sync",
        verifyToken,
      });

      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(401);
    }

    expect(verifyToken).not.toHaveBeenCalled();
  });
});
