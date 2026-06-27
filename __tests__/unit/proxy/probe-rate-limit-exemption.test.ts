import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const mockCheckRateLimit = mock(async () => ({
  success: true,
  remaining: 99,
  reset: Date.now() + 60_000,
}));
const mockGetClientIp = mock(() => "203.0.113.10");

mock.module("@/shared/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp: mockGetClientIp,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const { proxy } = await import("@/proxy");

describe("proxy probe rate-limit exemptions", () => {
  beforeEach(() => {
    mockCheckRateLimit.mockClear();
    mockGetClientIp.mockClear();
  });

  test("/api/live is exempt from API rate limiting for Cloud Run liveness probes", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/api/live"),
    );

    expect(response.status).toBe(200);
    expect(mockGetClientIp).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  test("/api/health is rate limited because it performs a database health check", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/api/health"),
    );

    expect(response.status).toBe(200);
    expect(mockGetClientIp).toHaveBeenCalledTimes(1);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "/api/health",
      "203.0.113.10",
    );
  });
});
