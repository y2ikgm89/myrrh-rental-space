import { describe, expect, test } from "bun:test";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";

describe("cron-auth", () => {
  test("production で secret が未設定なら 500 を返す", async () => {
    const response = authorizeCronRequest({
      authorizationHeader: null,
      secret: undefined,
      nodeEnv: "production",
      operation: "cronTest",
    });

    expect(response?.status).toBe(500);
    expect(await response?.json()).toEqual({
      error: "Server configuration error",
    });
  });

  test("development で secret が未設定なら許可する", () => {
    const response = authorizeCronRequest({
      authorizationHeader: null,
      secret: undefined,
      nodeEnv: "development",
      operation: "cronTest",
    });

    expect(response).toBeNull();
  });

  test("secret がある場合は authorization を必須にする", async () => {
    const response = authorizeCronRequest({
      authorizationHeader: "Bearer wrong",
      secret: "expected-secret",
      nodeEnv: "production",
      operation: "cronTest",
    });

    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: "Unauthorized" });
  });

  test("正しい bearer token なら許可する", () => {
    const response = authorizeCronRequest({
      authorizationHeader: "Bearer expected-secret",
      secret: "expected-secret",
      nodeEnv: "production",
      operation: "cronTest",
    });

    expect(response).toBeNull();
  });
});
