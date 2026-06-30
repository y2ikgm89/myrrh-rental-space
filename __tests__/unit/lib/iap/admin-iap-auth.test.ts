import { describe, expect, test } from "bun:test";
import {
  normalizeIapEmail,
  resolveIapIdentity,
} from "@/shared/lib/iap/admin-iap-auth";

describe("normalizeIapEmail", () => {
  test("IAP の account namespace を除去して小文字化する", () => {
    expect(normalizeIapEmail("accounts.google.com:Staff@Example.COM")).toBe(
      "staff@example.com",
    );
  });

  test("namespace がないメールアドレスも正規化する", () => {
    expect(normalizeIapEmail(" Staff@Example.COM ")).toBe("staff@example.com");
  });
});

describe("resolveIapIdentity", () => {
  test("署名付き IAP assertion を検証して正規化済み identity を返す", async () => {
    const headers = new Headers({
      "x-goog-iap-jwt-assertion": "signed.jwt",
    });

    const result = await resolveIapIdentity(headers, {
      verifyJwt: async () => ({
        email: "accounts.google.com:Staff@Example.COM",
        subject: "subject-123",
      }),
    });

    expect(result).toEqual({
      email: "staff@example.com",
      subject: "subject-123",
    });
  });

  test("assertion がない場合は null を返す", async () => {
    const result = await resolveIapIdentity(new Headers(), {
      verifyJwt: async () => {
        throw new Error("must not be called");
      },
    });

    expect(result).toBeNull();
  });

  test("検証済み payload に email がない場合は拒否する", async () => {
    const headers = new Headers({
      "x-goog-iap-jwt-assertion": "signed.jwt",
    });

    await expect(
      resolveIapIdentity(headers, {
        verifyJwt: async () => ({ email: "", subject: "subject-123" }),
      }),
    ).rejects.toThrow("IAP identity email is missing");
  });

  test("検証済み payload に subject がない場合は拒否する", async () => {
    const headers = new Headers({
      "x-goog-iap-jwt-assertion": "signed.jwt",
    });

    await expect(
      resolveIapIdentity(headers, {
        verifyJwt: async () => ({
          email: "accounts.google.com:staff@example.com",
          subject: "",
        }),
      }),
    ).rejects.toThrow("IAP identity subject is missing");
  });
});
