import { describe, expect, test, mock, beforeEach } from "bun:test";

import { createCalendarToken } from "@/shared/lib/calendar/calendar-token";
import { CALENDAR_RESERVATION_TOKEN_COOKIE_NAME } from "@/shared/lib/constants/calendar-token-cookie-names";

const RESERVATION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

let mockCookieValue: string | undefined;

describe("GET /api/calendar/reservation/[id]", () => {
  beforeEach(() => {
    mock.restore();
    mockCookieValue = undefined;
    mock.module("next/headers", () => ({
      cookies: mock(() =>
        Promise.resolve({
          get: (name: string) =>
            name === CALENDAR_RESERVATION_TOKEN_COOKIE_NAME &&
            mockCookieValue !== undefined
              ? { value: mockCookieValue }
              : undefined,
        }),
      ),
    }));
    // route が冒頭で isFeatureEnabled('reservation') を呼ぶため (FEAT-3PLANE-04)、
    // features/check を feature ON で mock。個別 test はこの上に上書きできる。
    mock.module("@/shared/domain/features/check", () => ({
      isFeatureEnabled: () => Promise.resolve(true),
    }));
    // per-reservationId rate limiter は既定で success（429 は個別 test）。
    mock.module("@/shared/lib/rate-limit", () => ({
      calendarDownloadByReservationIdRateLimiter: {
        check: () => Promise.resolve({ success: true, remaining: 9, reset: 0 }),
      },
    }));
  });

  test("returns 401 when customer is not authenticated", async () => {
    const rateLimitCheckSpy = mock(() =>
      Promise.resolve({ success: true, remaining: 9, reset: 0 }),
    );
    mock.module("@/shared/lib/rate-limit", () => ({
      calendarDownloadByReservationIdRateLimiter: { check: rateLimitCheckSpy },
    }));
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() => Promise.resolve(null)),
    }));
    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request(
        `http://localhost/api/calendar/reservation/${RESERVATION_ID}`,
      ),
      {
        params: Promise.resolve({
          id: RESERVATION_ID,
        }),
      },
    );
    expect(res.status).toBe(401);
    // 匿名リクエストは shared bucket を消費しない (receipt HTTP-03 / Codex #1426 同型)。
    expect(rateLimitCheckSpy).not.toHaveBeenCalled();
  });

  test("rejects an invalid guest cookie token before exposing path validation", async () => {
    mockCookieValue = "not-a-token";
    mock.module("@/shared/lib/errors/server", () => ({
      ErrorCategory: { AUTHORIZATION: "AUTHORIZATION", DATABASE: "DATABASE" },
      ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM" },
      logError: mock(() => undefined),
      normalizeError: (error: unknown) =>
        error instanceof Error ? error : new Error(String(error)),
    }));

    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/calendar/reservation/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Invalid token");
  });

  test("ignores query token and requires session or cookie (clean-break)", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() => Promise.resolve(null)),
    }));
    const token = createCalendarToken("reservation", RESERVATION_ID);
    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request(
        `http://localhost/api/calendar/reservation/${RESERVATION_ID}?token=${token}`,
      ),
      { params: Promise.resolve({ id: RESERVATION_ID }) },
    );
    expect(res.status).toBe(401);
  });

  test("accepts a valid guest cookie token without session", async () => {
    mockCookieValue = createCalendarToken("reservation", RESERVATION_ID);
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() => Promise.resolve(null)),
    }));
    mock.module("@/shared/domain/reservations/customer-queries", () => ({
      getReservationForCalendar: mock(() =>
        Promise.resolve({
          id: RESERVATION_ID,
          spaceName: "Studio A",
          customerName: "山田 太郎",
          startTime: new Date("2026-05-01T10:00:00+09:00"),
          endTime: new Date("2026-05-01T12:00:00+09:00"),
          location: "東京都渋谷区",
          notes: null,
          icsSequence: 0,
          status: "CONFIRMED",
        }),
      ),
    }));
    mock.module("@/shared/domain/settings/queries/organization", () => ({
      getIcalOrganizer: mock(() =>
        Promise.resolve({
          name: "Myrrh Rental Space",
          email: "noreply@example.com",
        }),
      ),
    }));

    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request(
        `http://localhost/api/calendar/reservation/${RESERVATION_ID}`,
      ),
      { params: Promise.resolve({ id: RESERVATION_ID }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
  });

  test("returns 400 when id is not a valid uuid", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() =>
        Promise.resolve({ user: { id: "user-1" } }),
      ),
    }));
    mock.module("@/shared/domain/customers/queries", () => ({
      getCustomerByUserId: mock(() => Promise.resolve({ id: "cust-1" })),
    }));
    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/calendar/reservation/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(res.status).toBe(400);
  });

  test("returns 404 when reservation does not belong to customer", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() =>
        Promise.resolve({ user: { id: "user-1" } }),
      ),
    }));
    mock.module("@/shared/domain/customers/queries", () => ({
      getCustomerByUserId: mock(() => Promise.resolve({ id: "cust-1" })),
    }));
    mock.module("@/shared/domain/reservations/customer-queries", () => ({
      getReservationForCalendar: mock(() => Promise.resolve(null)),
    }));
    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request(
        `http://localhost/api/calendar/reservation/${RESERVATION_ID}`,
      ),
      {
        params: Promise.resolve({
          id: RESERVATION_ID,
        }),
      },
    );
    expect(res.status).toBe(404);
  });

  test("returns 429 when per-reservationId rate limit is exceeded", async () => {
    mock.module("@/shared/lib/rate-limit", () => ({
      calendarDownloadByReservationIdRateLimiter: {
        check: () =>
          Promise.resolve({ success: false, remaining: 0, reset: Date.now() }),
      },
    }));
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() =>
        Promise.resolve({ user: { id: "user-1" } }),
      ),
    }));
    mock.module("@/shared/domain/customers/queries", () => ({
      getCustomerByUserId: mock(() => Promise.resolve({ id: "cust-1" })),
    }));
    const getReservationForCalendar = mock(() => Promise.resolve(null));
    mock.module("@/shared/domain/reservations/customer-queries", () => ({
      getReservationForCalendar,
    }));

    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request(
        `http://localhost/api/calendar/reservation/${RESERVATION_ID}`,
      ),
      { params: Promise.resolve({ id: RESERVATION_ID }) },
    );

    expect(res.status).toBe(429);
    expect(await res.text()).toBe("Too many requests");
    // rate limit 超過時は DB fetch に進まない
    expect(getReservationForCalendar).not.toHaveBeenCalled();
  });

  test("returns 200 text/calendar with METHOD:REQUEST when reservation is CONFIRMED", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() =>
        Promise.resolve({ user: { id: "user-1" } }),
      ),
    }));
    mock.module("@/shared/domain/customers/queries", () => ({
      getCustomerByUserId: mock(() => Promise.resolve({ id: "cust-1" })),
    }));
    mock.module("@/shared/domain/reservations/customer-queries", () => ({
      getReservationForCalendar: mock(() =>
        Promise.resolve({
          id: RESERVATION_ID,
          spaceName: "Studio A",
          customerName: "山田 太郎",
          startTime: new Date("2026-05-01T10:00:00+09:00"),
          endTime: new Date("2026-05-01T12:00:00+09:00"),
          location: "東京都渋谷区",
          notes: null,
          icsSequence: 0,
          status: "CONFIRMED",
        }),
      ),
    }));
    mock.module("@/shared/domain/settings/queries/organization", () => ({
      getIcalOrganizer: mock(() =>
        Promise.resolve({
          name: "Myrrh Rental Space",
          email: "noreply@example.com",
        }),
      ),
    }));
    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request(
        `http://localhost/api/calendar/reservation/${RESERVATION_ID}`,
      ),
      {
        params: Promise.resolve({
          id: RESERVATION_ID,
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
    const body = await res.text();
    expect(body).toContain(`UID:reservation-${RESERVATION_ID}@`);
    expect(body).toContain("METHOD:REQUEST");
    expect(body).toContain("DTSTART:20260501T010000Z");
    expect(body).toContain("DTEND:20260501T030000Z");
    expect(body).not.toContain("TIMEZONE-ID:");
    expect(body).toContain("SUMMARY:【予約】Studio A");
  });

  test("returns METHOD:CANCEL when reservation is CANCELLED", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() =>
        Promise.resolve({ user: { id: "user-1" } }),
      ),
    }));
    mock.module("@/shared/domain/customers/queries", () => ({
      getCustomerByUserId: mock(() => Promise.resolve({ id: "cust-1" })),
    }));
    mock.module("@/shared/domain/reservations/customer-queries", () => ({
      getReservationForCalendar: mock(() =>
        Promise.resolve({
          id: RESERVATION_ID,
          spaceName: "Studio A",
          customerName: "山田 太郎",
          startTime: new Date("2026-05-01T10:00:00+09:00"),
          endTime: new Date("2026-05-01T12:00:00+09:00"),
          location: null,
          notes: null,
          icsSequence: 1,
          status: "CANCELLED",
        }),
      ),
    }));
    mock.module("@/shared/domain/settings/queries/organization", () => ({
      getIcalOrganizer: mock(() =>
        Promise.resolve({
          name: "Myrrh Rental Space",
          email: "noreply@example.com",
        }),
      ),
    }));
    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request(
        `http://localhost/api/calendar/reservation/${RESERVATION_ID}`,
      ),
      {
        params: Promise.resolve({
          id: RESERVATION_ID,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("METHOD:CANCEL");
    expect(body).toContain("STATUS:CANCELLED");
    expect(body).toContain("SEQUENCE:1");
  });
});
