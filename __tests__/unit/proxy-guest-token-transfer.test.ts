import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { createCancelToken as createReservationCancelToken } from "@/shared/lib/reservation-cancel-token";
import { createCancelToken as createEventCancelToken } from "@/shared/lib/event-registration-cancel-token";
import { createCompleteToken } from "@/shared/lib/reservation-complete-token";
import { createStatusToken } from "@/shared/lib/reservation-status-token";
import { createEventRegistrationStatusToken } from "@/shared/lib/event-registration-status-token";
import { RESERVATION_STATUS_TOKEN_COOKIE_NAME } from "@/shared/lib/constants/reservation-status-token-cookie-name";
import { EVENT_REGISTRATION_STATUS_TOKEN_COOKIE_NAME } from "@/shared/lib/constants/event-registration-status-token-cookie-name";
import {
  CALENDAR_RESERVATION_TOKEN_COOKIE_NAME,
  CALENDAR_EVENT_TOKEN_COOKIE_NAME,
} from "@/shared/lib/constants/calendar-token-cookie-names";
import { createCalendarToken } from "@/shared/lib/calendar/calendar-token";

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

describe("guest token transfer", () => {
  test("/reservation/cancel の ?token= を HttpOnly cookie に転写し URL から外す", async () => {
    const token = createReservationCancelToken(
      "11111111-1111-4111-8111-111111111111",
      FUTURE,
    );
    const req = new NextRequest(
      `https://example.com/reservation/cancel?token=${token}`,
    );
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("token")).toBeNull();
    const cookie = res.cookies.get("cancel-token");
    expect(cookie?.value).toBe(token);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.httpOnly).toBe(true);
  });

  test("/events/cancel の ?token= を HttpOnly cookie に転写する", async () => {
    const token = createEventCancelToken(
      "22222222-2222-4222-8222-222222222222",
      FUTURE,
    );
    const req = new NextRequest(
      `https://example.com/events/cancel?token=${token}`,
    );
    const res = await proxy(req);
    const cookie = res.cookies.get("event-cancel-token");
    expect(cookie?.value).toBe(token);
    expect(cookie?.sameSite).toBe("strict");
  });

  test("/reservation/complete の ?token= を HttpOnly cookie に転写する", async () => {
    const token = createCompleteToken(
      "33333333-3333-4333-8333-333333333333",
      FUTURE,
    );
    const req = new NextRequest(
      `https://example.com/reservation/complete?token=${token}`,
    );
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("token")).toBeNull();
    const cookie = res.cookies.get("complete-token");
    expect(cookie?.value).toBe(token);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.httpOnly).toBe(true);
  });

  test("/reservation/status の ?token= を HttpOnly cookie に転写する", async () => {
    const token = createStatusToken(
      "55555555-5555-4555-8555-555555555555",
      FUTURE,
    );
    const req = new NextRequest(
      `https://example.com/reservation/status?token=${token}`,
    );
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("token")).toBeNull();
    const cookie = res.cookies.get(RESERVATION_STATUS_TOKEN_COOKIE_NAME);
    expect(cookie?.value).toBe(token);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.httpOnly).toBe(true);
  });

  test("token なしの /reservation/status は素通り（redirect しない）", async () => {
    const req = new NextRequest("https://example.com/reservation/status");
    const res = await proxy(req);
    expect(res.status).not.toBe(307);
  });

  test("/reservation/status/edit の ?token= を HttpOnly cookie に転写する", async () => {
    const token = createStatusToken(
      "66666666-6666-4666-8666-666666666666",
      FUTURE,
    );
    const req = new NextRequest(
      `https://example.com/reservation/status/edit?token=${token}`,
    );
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("token")).toBeNull();
    const cookie = res.cookies.get(RESERVATION_STATUS_TOKEN_COOKIE_NAME);
    expect(cookie?.value).toBe(token);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.httpOnly).toBe(true);
  });

  test("/events/registrations/status の ?token= を HttpOnly cookie に転写する", async () => {
    const token = createEventRegistrationStatusToken(
      "clxxxxxxxxxxxxxxxxxxxxxxxxx",
      FUTURE,
    );
    const req = new NextRequest(
      `https://example.com/events/registrations/status?token=${token}`,
    );
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("token")).toBeNull();
    const cookie = res.cookies.get(EVENT_REGISTRATION_STATUS_TOKEN_COOKIE_NAME);
    expect(cookie?.value).toBe(token);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.httpOnly).toBe(true);
  });

  test("token なしの /events/registrations/status は素通り（redirect しない）", async () => {
    const req = new NextRequest(
      "https://example.com/events/registrations/status",
    );
    const res = await proxy(req);
    expect(res.status).not.toBe(307);
  });

  test("不正形式の token は cookie に書かず ?token だけ外す", async () => {
    const req = new NextRequest(
      "https://example.com/reservation/complete?token=short",
    );
    const res = await proxy(req);
    expect(res.cookies.get("complete-token")).toBeUndefined();
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("token")).toBeNull();
  });

  test("token なしの /reservation/complete は素通り（redirect しない）", async () => {
    const req = new NextRequest("https://example.com/reservation/complete");
    const res = await proxy(req);
    expect(res.status).not.toBe(307);
  });

  test("token なしの /reservation/cancel は素通り（redirect しない）", async () => {
    const req = new NextRequest("https://example.com/reservation/cancel");
    const res = await proxy(req);
    expect(res.status).not.toBe(307);
  });

  test("/api/calendar/reservation/:id の ?token= を HttpOnly cookie に転写し URL から外す", async () => {
    const reservationId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const token = createCalendarToken("reservation", reservationId);
    const req = new NextRequest(
      `https://example.com/api/calendar/reservation/${reservationId}?token=${token}`,
    );
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe(
      `/api/calendar/reservation/${reservationId}`,
    );
    expect(location.searchParams.get("token")).toBeNull();
    const cookie = res.cookies.get(CALENDAR_RESERVATION_TOKEN_COOKIE_NAME);
    expect(cookie?.value).toBe(token);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/api/calendar/reservation");
  });

  test("/api/calendar/event/:id の ?token= を HttpOnly cookie に転写する", async () => {
    const registrationId = "clxxxxxxxxxxxxxxxxxxxxxxxxx";
    const token = createCalendarToken("event", registrationId);
    const req = new NextRequest(
      `https://example.com/api/calendar/event/${registrationId}?token=${token}`,
    );
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("token")).toBeNull();
    const cookie = res.cookies.get(CALENDAR_EVENT_TOKEN_COOKIE_NAME);
    expect(cookie?.value).toBe(token);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/api/calendar/event");
  });

  test("token なしの /api/calendar/reservation/:id は素通り（redirect しない）", async () => {
    const req = new NextRequest(
      "https://example.com/api/calendar/reservation/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    );
    const res = await proxy(req);
    expect(res.status).not.toBe(307);
  });
});
