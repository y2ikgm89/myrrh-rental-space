import { describe, expect, test } from "bun:test";
import {
  createMarketingUnsubscribeArtifacts,
  createMarketingUnsubscribeToken,
  verifyMarketingUnsubscribeToken,
} from "@/shared/lib/tokens/marketing-unsubscribe-token";

describe("marketing-unsubscribe-token", () => {
  test("create → verify で customerId が復元できる", () => {
    const token = createMarketingUnsubscribeToken(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(verifyMarketingUnsubscribeToken(token)).toEqual({
      customerId: "11111111-1111-1111-1111-111111111111",
    });
  });

  test("改ざんトークンは null", () => {
    const token = createMarketingUnsubscribeToken(
      "11111111-1111-1111-1111-111111111111",
    );
    const flipped =
      token.slice(0, 8) + (token[8] === "A" ? "B" : "A") + token.slice(9);
    expect(verifyMarketingUnsubscribeToken(flipped)).toBeNull();
    expect(verifyMarketingUnsubscribeToken("not-a-token")).toBeNull();
  });

  test("artifacts の URL と List-Unsubscribe ヘッダは同一 URL を指す", () => {
    const artifacts = createMarketingUnsubscribeArtifacts(
      "22222222-2222-2222-2222-222222222222",
    );
    const headerUrl = artifacts.headers["List-Unsubscribe"]?.replace(
      /^<|>$/g,
      "",
    );
    expect(headerUrl).toBe(artifacts.url);
    expect(artifacts.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(artifacts.url).toContain("/api/email/unsubscribe?token=");
  });
});
