import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockHeaders = mock(() => new Headers());
const mockRedirect = mock((path: string): never => {
  throw new Error(`redirect:${path}`);
});
const mockSignUpEmail = mock(() => Promise.resolve({}));
const mockSignInEmail = mock(() => Promise.resolve({}));
const mockServerEnv: Record<string, string | undefined> = {
  NODE_ENV: undefined,
  E2E_RUNTIME: undefined,
  BETTER_AUTH_URL: undefined,
  ADMIN_APP_URL: undefined,
};

mock.module("next/headers", () => ({
  headers: mockHeaders,
}));

mock.module("next/navigation", () => ({
  redirect: mockRedirect,
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
  isLocalhostUrl: (value: string | null | undefined) => {
    if (!value) return false;
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  },
}));

mock.module("@/shared/lib/customer-auth", () => ({
  customerAuth: {
    api: {
      signUpEmail: mockSignUpEmail,
      signInEmail: mockSignInEmail,
    },
  },
}));

const originalEnv = { ...process.env };
const { devCustomerLoginAction } =
  await import("@/app/(public)/login/_components/dev-login-action");

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      Reflect.deleteProperty(process.env, key);
    }
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
}

function setProcessEnv(key: string, value: string): void {
  process.env[key] = value;
}

afterEach(() => {
  restoreEnv();
  mockHeaders.mockClear();
  mockRedirect.mockClear();
  mockSignUpEmail.mockClear();
  mockSignInEmail.mockClear();
  mockServerEnv["E2E_RUNTIME"] = undefined;
  mockServerEnv["NODE_ENV"] = undefined;
  mockServerEnv["BETTER_AUTH_URL"] = undefined;
  mockServerEnv["ADMIN_APP_URL"] = undefined;
});

describe("devCustomerLoginAction", () => {
  test("production では NEXT_PUBLIC_ENABLE_E2E_LOGIN=1 だけで dev customer login を許可しない", async () => {
    setProcessEnv("NODE_ENV", "production");
    setProcessEnv("NEXT_PUBLIC_ENABLE_E2E_LOGIN", "1");
    setProcessEnv("NEXT_PUBLIC_APP_URL", "https://rental-space.example.com");
    setProcessEnv("NEXT_PUBLIC_BASE_URL", "https://rental-space.example.com");
    mockServerEnv["E2E_RUNTIME"] = undefined;
    mockServerEnv["NODE_ENV"] = "production";
    mockServerEnv["BETTER_AUTH_URL"] = "https://rental-space.example.com";
    mockServerEnv["ADMIN_APP_URL"] = "https://admin.example.com";

    await expect(devCustomerLoginAction()).resolves.toEqual({
      error: "本番環境では利用できません",
    });

    expect(mockSignUpEmail).not.toHaveBeenCalled();
    expect(mockSignInEmail).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  test("localhost production-mode E2E では dev customer login を許可する", async () => {
    setProcessEnv("NODE_ENV", "production");
    setProcessEnv("NEXT_PUBLIC_ENABLE_E2E_LOGIN", "1");
    setProcessEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    setProcessEnv("NEXT_PUBLIC_BASE_URL", "http://localhost:3000");
    mockServerEnv["E2E_RUNTIME"] = "1";
    mockServerEnv["NODE_ENV"] = "production";
    mockServerEnv["BETTER_AUTH_URL"] = "http://localhost:3000";
    mockServerEnv["ADMIN_APP_URL"] = "http://localhost:3000";

    await expect(devCustomerLoginAction()).rejects.toThrow("redirect:/mypage");

    expect(mockSignUpEmail).toHaveBeenCalled();
    expect(mockSignInEmail).toHaveBeenCalled();
  });
});
