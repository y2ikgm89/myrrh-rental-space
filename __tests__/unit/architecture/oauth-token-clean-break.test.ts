import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const absentFiles = [
  join(process.cwd(), "src", "shared", "domain", "auth", "queries.ts"),
  join(process.cwd(), "src", "shared", "domain", "auth", "commands.ts"),
  join(
    process.cwd(),
    "__tests__",
    "unit",
    "domain",
    "auth",
    "commands.test.ts",
  ),
  join(process.cwd(), "scripts", "backfill-oauth-token-encryption.ts"),
];

const sourceFiles = [
  join(process.cwd(), "src", "shared", "lib", "customer-auth.ts"),
  join(process.cwd(), "src", "shared", "lib", "crypto.ts"),
];

describe("OAuth token clean-break contract", () => {
  test("uses Better Auth token encryption without direct DB token helpers", () => {
    const source = sourceFiles
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(source).toContain("encryptOAuthTokens: true");
    expect(source).not.toContain("export function encryptOAuthToken");
    expect(source).not.toContain("encryptOAuthToken(");
    expect(source).not.toContain("reEncryptLegacyOAuthToken");
    for (const file of absentFiles) {
      expect(existsSync(file)).toBe(false);
    }
  });
});
