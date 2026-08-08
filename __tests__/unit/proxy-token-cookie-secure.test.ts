import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

/**
 * Cookie Secure が spoofed `Host: localhost` を信頼しないことの回帰。
 * NODE_ENV を差し替えるため env/server を mock してから proxy を dynamic import する。
 */

const envState = {
  NODE_ENV: "production" as "production" | "development" | "test",
};

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    get APP_SURFACE() {
      return "public";
    },
    get NODE_ENV() {
      return envState.NODE_ENV;
    },
    R2_PUBLIC_URL: undefined,
  },
  isLocalhostUrl: () => false,
}));

const { proxy } = await import("@/proxy");

const { createCancelToken } =
  await import("@/shared/lib/reservation-cancel-token");

const { createEventRegistrationPaymentToken } =
  await import("@/shared/lib/tokens/event-registration-payment-token");

const { EVENT_REGISTRATION_PAYMENT_TOKEN_COOKIE_NAME } =
  await import("@/shared/lib/constants/event-registration-payment-token-cookie-name");

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

describe("proxy token cookie Secure", () => {
  test("production では Host: localhost でも Secure=true（spoof 耐性）", async () => {
    envState.NODE_ENV = "production";
    const token = createCancelToken(
      "11111111-1111-4111-8111-111111111111",
      FUTURE,
    );
    const req = new NextRequest(
      `http://localhost:3000/reservation/cancel?token=${token}`,
      { headers: { host: "localhost:3000" } },
    );
    const res = await proxy(req);
    const cookie = res.cookies.get("cancel-token");
    expect(cookie?.value).toBe(token);
    expect(cookie?.secure).toBe(true);
  });

  test("development + loopback では Secure=false", async () => {
    envState.NODE_ENV = "development";
    const token = createCancelToken(
      "22222222-2222-4222-8222-222222222222",
      FUTURE,
    );
    const req = new NextRequest(
      `http://127.0.0.1:3000/reservation/cancel?token=${token}`,
      { headers: { host: "127.0.0.1:3000" } },
    );
    const res = await proxy(req);
    const cookie = res.cookies.get("cancel-token");
    expect(cookie?.value).toBe(token);
    expect(cookie?.secure).toBe(false);
  });

  test("development でも非 loopback Host では Secure=true", async () => {
    envState.NODE_ENV = "development";
    const token = createCancelToken(
      "33333333-3333-4333-8333-333333333333",
      FUTURE,
    );
    const req = new NextRequest(
      `https://staging.example.com/reservation/cancel?token=${token}`,
      { headers: { host: "staging.example.com" } },
    );
    const res = await proxy(req);
    const cookie = res.cookies.get("cancel-token");
    expect(cookie?.value).toBe(token);
    expect(cookie?.secure).toBe(true);
  });

  test("/events/registrations/checkout の ?token= を HttpOnly cookie に転写する", async () => {
    envState.NODE_ENV = "production";
    const token = createEventRegistrationPaymentToken({
      registrationId: "reg_payment_cookie_transfer",
    });
    const req = new NextRequest(
      `https://example.com/events/registrations/checkout?token=${token}`,
    );
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/events/registrations/checkout");
    expect(location.searchParams.get("token")).toBeNull();
    const cookie = res.cookies.get(
      EVENT_REGISTRATION_PAYMENT_TOKEN_COOKIE_NAME,
    );
    expect(cookie?.value).toBe(token);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.secure).toBe(true);
    expect(cookie?.path).toBe("/events/registrations/checkout");
  });
});
