import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const mockInfraCheck = mock<
  (token: string) => Promise<{
    success: boolean;
    remaining: number;
    reset: number;
  }>
>(() =>
  Promise.resolve({
    success: true,
    remaining: 299,
    reset: Date.now() + 60_000,
  }),
);

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    APP_SURFACE: "public",
    NODE_ENV: "production",
    R2_PUBLIC_URL: undefined,
  },
  isLocalhostUrl: () => false,
}));

mock.module("@/shared/lib/rate-limit", () => ({
  checkRateLimit: mock(() =>
    Promise.resolve({
      success: true,
      remaining: 99,
      reset: Date.now() + 60_000,
    }),
  ),
  getClientIp: () => "203.0.113.10",
  infraEndpointRateLimiter: {
    check: mockInfraCheck,
    reset: mock(() => Promise.resolve()),
  },
}));

const { proxy } = await import("@/proxy");

describe("proxy infra endpoint rate limit", () => {
  beforeEach(() => {
    mockInfraCheck.mockReset();
    mockInfraCheck.mockResolvedValue({
      success: true,
      remaining: 299,
      reset: Date.now() + 60_000,
    });
  });

  test.each([
    "/api/webhooks/stripe",
    "/api/webhooks/switchbot",
    "/api/cron/pending-reservation-expire",
  ])("webhook/cron は coarse infra limiter を通す (%s)", async (pathname) => {
    await proxy(new NextRequest(`https://example.com${pathname}`));

    expect(mockInfraCheck).toHaveBeenCalledWith(
      expect.stringMatching(/^203\.0\.113\.10:/),
    );
  });

  test("infra limiter 超過時は 429 を返す", async () => {
    mockInfraCheck.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: Date.now() + 30_000,
    });

    const response = await proxy(
      new NextRequest("https://example.com/api/webhooks/stripe"),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "Too many requests" });
  });

  test("/api/live は infra limiter を bypass する", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/api/live"),
    );

    expect(response.status).toBe(200);
    expect(mockInfraCheck).not.toHaveBeenCalled();
  });
});
