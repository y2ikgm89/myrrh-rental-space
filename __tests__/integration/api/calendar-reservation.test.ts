import { describe, expect, test, mock, beforeEach } from "bun:test";

describe("GET /api/calendar/reservation/[id]", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("returns 401 when customer is not authenticated", async () => {
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() => Promise.resolve(null)),
    }));
    const { GET } = await import("@/app/api/calendar/reservation/[id]/route");
    const res = await GET(
      new Request(
        "http://localhost/api/calendar/reservation/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      ),
      {
        params: Promise.resolve({
          id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        }),
      },
    );
    expect(res.status).toBe(401);
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
        "http://localhost/api/calendar/reservation/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      ),
      {
        params: Promise.resolve({
          id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        }),
      },
    );
    expect(res.status).toBe(404);
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
          id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
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
        "http://localhost/api/calendar/reservation/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      ),
      {
        params: Promise.resolve({
          id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
    const body = await res.text();
    expect(body).toContain(
      "UID:reservation-a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11@",
    );
    expect(body).toContain("METHOD:REQUEST");
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
          id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
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
        "http://localhost/api/calendar/reservation/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      ),
      {
        params: Promise.resolve({
          id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
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
