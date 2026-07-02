import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const sourceFiles = [
  join(process.cwd(), "src", "shared", "lib", "crypto.ts"),
  join(process.cwd(), "src", "shared", "lib", "env", "encryption.ts"),
  join(process.cwd(), "src", "shared", "lib", "env", "server.ts"),
];

describe("crypto clean-break contract", () => {
  test("keeps only current v2 encryption key handling in production source", () => {
    const source = sourceFiles
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(source).toContain("WIRE_V2");
    expect(source).not.toContain(`ENCRYPTION_KEYS_${"LEGACY"}`);
    expect(source).not.toContain("WIRE_V1");
    expect(source).not.toMatch(/\blegacy\b/iu);
    expect(source).not.toContain("findEncryptionKeyByKid");
  });
});
