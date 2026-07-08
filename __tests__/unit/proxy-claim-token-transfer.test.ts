import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { createReservationClaimToken } from "@/shared/lib/reservation-claim-token";
import { createEventRegistrationClaimToken } from "@/shared/lib/event-registration-claim-token";

describe("claim token transfer", () => {
  test("/claim/reservation の ?token= を HttpOnly cookie に転写し URL から外す", async () => {
    const token = createReservationClaimToken(
      "11111111-1111-4111-8111-111111111111",
    );
    const req = new NextRequest(
      `https://example.com/claim/reservation?token=${token}`,
    );
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("token")).toBeNull();
    const cookie = res.cookies.get("reservation-claim-token");
    expect(cookie?.value).toBe(token);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.httpOnly).toBe(true);
  });

  test("/claim/event-registration の ?token= を HttpOnly cookie に転写する", async () => {
    const token = createEventRegistrationClaimToken(
      "22222222-2222-4222-8222-222222222222",
    );
    const req = new NextRequest(
      `https://example.com/claim/event-registration?token=${token}`,
    );
    const res = await proxy(req);
    const cookie = res.cookies.get("event-registration-claim-token");
    expect(cookie?.value).toBe(token);
    expect(cookie?.sameSite).toBe("lax");
  });

  test("不正形式の token は cookie に書かず ?token だけ外す", async () => {
    const req = new NextRequest(
      "https://example.com/claim/reservation?token=short",
    );
    const res = await proxy(req);
    expect(res.cookies.get("reservation-claim-token")).toBeUndefined();
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("token")).toBeNull();
  });

  test("token なしの /claim/reservation は素通り（redirect しない）", async () => {
    const req = new NextRequest("https://example.com/claim/reservation");
    const res = await proxy(req);
    expect(res.status).not.toBe(307);
  });
});
