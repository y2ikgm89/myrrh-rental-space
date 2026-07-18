/**
 * CRITIC-1: Better Auth `accountLinking.trustedProviders` regression gate.
 *
 * LINE Login は upstream で email 検証を必須化していない仕様のため、
 * `trustedProviders` に含めると victim の email で LINE アカウントを
 * 作成した attacker が既存 Google 紐付き Customer に silently attach 可能。
 *
 * 将来の PR で `"line"` を誤って追加すると本テストが fail する。
 *
 * @see src/shared/lib/customer-auth.ts CUSTOMER_TRUSTED_PROVIDERS
 */

import { describe, test, expect } from "bun:test";
import { CUSTOMER_TRUSTED_PROVIDERS } from "@/shared/lib/customer-auth";

describe("CUSTOMER_TRUSTED_PROVIDERS (CRITIC-1)", () => {
  test("LINE は含まない（upstream email 検証がないため）", () => {
    expect(CUSTOMER_TRUSTED_PROVIDERS).not.toContain("line");
  });

  test("Google のみ許可", () => {
    // Google は identity-provider 層で email verification を必須化しているため
    // trusted で安全。他 provider を追加する場合は upstream の email 検証仕様を
    // 個別に確認してから列挙すること。
    expect([...CUSTOMER_TRUSTED_PROVIDERS]).toStrictEqual(["google"]);
  });
});
