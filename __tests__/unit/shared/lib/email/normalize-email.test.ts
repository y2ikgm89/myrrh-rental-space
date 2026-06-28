import { describe, expect, test } from "bun:test";

import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";

describe("normalizeEmailForIdentity", () => {
  test("trims surrounding whitespace and lowercases the address", () => {
    expect(normalizeEmailForIdentity("  USER.Name+tag@Example.COM  ")).toBe(
      "user.name+tag@example.com",
    );
  });

  test("does not apply provider-specific dot or plus normalization", () => {
    expect(normalizeEmailForIdentity("First.Last+tag@gmail.com")).toBe(
      "first.last+tag@gmail.com",
    );
  });
});
