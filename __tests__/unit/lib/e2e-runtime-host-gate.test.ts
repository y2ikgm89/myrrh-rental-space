import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockServerEnv: Record<string, string | undefined> = {
  NODE_ENV: "production",
  E2E_RUNTIME: "1",
  ADMIN_APP_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
};

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
  isLocalhostUrl: (value: string | null | undefined) => {
    if (!value) return false;
    try {
      const { hostname } = new URL(value);
      return hostname === "localhost" || hostname === "127.0.0.1";
    } catch {
      return false;
    }
  },
}));

const originalNextPublicBaseUrl = process.env["NEXT_PUBLIC_BASE_URL"];
const originalNextPublicAppUrl = process.env["NEXT_PUBLIC_APP_URL"];
const originalEnableE2ELogin = process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"];

const {
  isCustomerE2ELoginEnabled,
  isE2ESecurityBypassAllowed,
  isLocalProductionE2EEnv,
} = await import("@/shared/lib/e2e-runtime");

function setLocalhostPublicUrls(): void {
  process.env["NEXT_PUBLIC_BASE_URL"] = "http://localhost:3000";
  process.env["NEXT_PUBLIC_APP_URL"] = "http://localhost:3000";
}

beforeEach(() => {
  mockServerEnv["NODE_ENV"] = "production";
  mockServerEnv["E2E_RUNTIME"] = "1";
  mockServerEnv["ADMIN_APP_URL"] = "http://localhost:3000";
  mockServerEnv["BETTER_AUTH_URL"] = "http://localhost:3000";
  setLocalhostPublicUrls();
  process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"] = "1";
});

afterEach(() => {
  if (originalNextPublicBaseUrl === undefined) {
    Reflect.deleteProperty(process.env, "NEXT_PUBLIC_BASE_URL");
  } else {
    process.env["NEXT_PUBLIC_BASE_URL"] = originalNextPublicBaseUrl;
  }
  if (originalNextPublicAppUrl === undefined) {
    Reflect.deleteProperty(process.env, "NEXT_PUBLIC_APP_URL");
  } else {
    process.env["NEXT_PUBLIC_APP_URL"] = originalNextPublicAppUrl;
  }
  if (originalEnableE2ELogin === undefined) {
    Reflect.deleteProperty(process.env, "NEXT_PUBLIC_ENABLE_E2E_LOGIN");
  } else {
    process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"] = originalEnableE2ELogin;
  }
});

describe("isE2ESecurityBypassAllowed host gate", () => {
  test("env が localhost でも Host が非 loopback なら bypass を拒否する", () => {
    expect(isLocalProductionE2EEnv()).toBe(true);
    expect(
      isE2ESecurityBypassAllowed(new Headers({ host: "preview.example.com" })),
    ).toBe(false);
  });

  test("env と Host がともに loopback なら bypass を許可する", () => {
    expect(
      isE2ESecurityBypassAllowed(new Headers({ host: "localhost:3000" })),
    ).toBe(true);
  });

  test("X-Forwarded-Host spoof だけでは bypass できない", () => {
    expect(
      isE2ESecurityBypassAllowed(
        new Headers({
          host: "preview.example.com",
          "x-forwarded-host": "localhost:3000",
        }),
      ),
    ).toBe(false);
  });
});

describe("isCustomerE2ELoginEnabled host gate", () => {
  test("env opt-in でも Host が非 loopback なら拒否する", () => {
    expect(
      isCustomerE2ELoginEnabled(new Headers({ host: "staging.example.com" })),
    ).toBe(false);
  });

  test("env opt-in + loopback Host で許可する", () => {
    expect(
      isCustomerE2ELoginEnabled(new Headers({ host: "127.0.0.1:3000" })),
    ).toBe(true);
  });
});
