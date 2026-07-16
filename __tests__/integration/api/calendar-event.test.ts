import { describe, expect, test, mock, beforeEach } from "bun:test";

describe("GET /api/calendar/event/[registrationId]", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("returns 401 when not authenticated", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() => Promise.resolve(null)),
    }));
    const { GET } =
      await import("@/app/api/calendar/event/[registrationId]/route");
    const res = await GET(
      new Request("http://localhost/api/calendar/event/reg-456"),
      { params: Promise.resolve({ registrationId: "reg-456" }) },
    );
    expect(res.status).toBe(401);
  });

  test("rejects an invalid guest token before exposing path validation", async () => {
    mock.module("@/shared/lib/errors/server", () => ({
      ErrorCategory: { AUTHORIZATION: "AUTHORIZATION", DATABASE: "DATABASE" },
      ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM" },
      logError: mock(() => undefined),
      normalizeError: (error: unknown) =>
        error instanceof Error ? error : new Error(String(error)),
    }));

    const invalidRegistrationId = "x".repeat(41);
    const { GET } =
      await import("@/app/api/calendar/event/[registrationId]/route");
    const res = await GET(
      new Request(
        `http://localhost/api/calendar/event/${invalidRegistrationId}?token=not-a-token`,
      ),
      { params: Promise.resolve({ registrationId: invalidRegistrationId }) },
    );

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Invalid token");
  });

  test("returns 400 when registrationId is empty", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() =>
        Promise.resolve({ user: { id: "user-1" } }),
      ),
    }));
    mock.module("@/shared/domain/customers/queries", () => ({
      getCustomerByUserId: mock(() => Promise.resolve({ id: "cust-1" })),
    }));
    const { GET } =
      await import("@/app/api/calendar/event/[registrationId]/route");
    const res = await GET(new Request("http://localhost/api/calendar/event/"), {
      params: Promise.resolve({ registrationId: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 200 with METHOD:REQUEST when CONFIRMED", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() =>
        Promise.resolve({ user: { id: "user-1" } }),
      ),
    }));
    mock.module("@/shared/domain/customers/queries", () => ({
      getCustomerByUserId: mock(() => Promise.resolve({ id: "cust-1" })),
    }));
    mock.module("@/shared/domain/events/registration-queries", () => ({
      getEventRegistrationForCalendar: mock(() =>
        Promise.resolve({
          id: "reg-456",
          eventTitle: "ワークショップ",
          customerName: "山田 太郎",
          startTime: new Date("2026-05-01T10:00:00+09:00"),
          endTime: new Date("2026-05-01T12:00:00+09:00"),
          location: "東京",
          quantity: 2,
          icsSequence: 0,
          status: "CONFIRMED",
          // Phase B.1: buildEventCalendar が format / meetingUrl を要求 (Task 9)
          format: "OFFLINE" as const,
          meetingUrl: null,
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
    const { GET } =
      await import("@/app/api/calendar/event/[registrationId]/route");
    const res = await GET(
      new Request("http://localhost/api/calendar/event/reg-456"),
      { params: Promise.resolve({ registrationId: "reg-456" }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
    const body = await res.text();
    expect(body).toContain("UID:event-registration-reg-456@");
    expect(body).toContain("METHOD:REQUEST");
    expect(body).toContain("DTSTART:20260501T010000Z");
    expect(body).toContain("DTEND:20260501T030000Z");
    expect(body).not.toContain("TIMEZONE-ID:");
    expect(body).toContain("SUMMARY:ワークショップ");
  });
});
