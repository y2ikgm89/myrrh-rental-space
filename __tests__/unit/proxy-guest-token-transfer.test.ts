import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { createCancelToken as createReservationCancelToken } from "@/shared/lib/reservation-cancel-token";
import { createCancelToken as createEventCancelToken } from "@/shared/lib/event-registration-cancel-token";
import { createCompleteToken } from "@/shared/lib/reservation-complete-token";

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
});
