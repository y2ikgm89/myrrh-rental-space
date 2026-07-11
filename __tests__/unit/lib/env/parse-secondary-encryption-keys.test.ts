import { describe, expect, test } from "bun:test";

import { parseSecondaryEncryptionKeys } from "@/shared/lib/env/parse-secondary-encryption-keys";

const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);

describe("parseSecondaryEncryptionKeys", () => {
  test("returns [] when input is undefined", () => {
    expect(parseSecondaryEncryptionKeys(undefined)).toEqual([]);
  });

  test("returns [] when input is empty string", () => {
    expect(parseSecondaryEncryptionKeys("")).toEqual([]);
  });

  test("returns [] when input is only whitespace and commas", () => {
    expect(parseSecondaryEncryptionKeys("  ,  ,  ")).toEqual([]);
  });

  test("parses a single kid:hex entry", () => {
    expect(parseSecondaryEncryptionKeys(`v1:${HEX_A}`)).toEqual([
      { kid: "v1", hex: HEX_A },
    ]);
  });

  test("parses multiple entries preserving order", () => {
    const result = parseSecondaryEncryptionKeys(`v1:${HEX_A}, v0:${HEX_B}`);
    expect(result).toEqual([
      { kid: "v1", hex: HEX_A },
      { kid: "v0", hex: HEX_B },
    ]);
  });

  test("trims surrounding whitespace from each entry", () => {
    const result = parseSecondaryEncryptionKeys(
      `  v1:${HEX_A}  ,\n  v0:${HEX_B}  `,
    );
    expect(result).toEqual([
      { kid: "v1", hex: HEX_A },
      { kid: "v0", hex: HEX_B },
    ]);
  });

  test("throws when a kid is missing (no colon)", () => {
    expect(() => parseSecondaryEncryptionKeys(`${HEX_A}`)).toThrow(
      /no colon separator/,
    );
  });

  test("throws when a kid is empty (leading colon)", () => {
    expect(() => parseSecondaryEncryptionKeys(`:${HEX_A}`)).toThrow(
      /no colon separator/,
    );
  });

  test("throws when a kid contains invalid characters", () => {
    expect(() => parseSecondaryEncryptionKeys(`v!:${HEX_A}`)).toThrow(
      /invalid kid/,
    );
  });

  test("throws when hex is not 64 chars", () => {
    expect(() => parseSecondaryEncryptionKeys(`v1:${"a".repeat(32)}`)).toThrow(
      /must be exactly 64 hex characters/,
    );
  });

  test("throws when hex contains non-hex chars", () => {
    const badHex = `${"a".repeat(63)}z`;
    expect(() => parseSecondaryEncryptionKeys(`v1:${badHex}`)).toThrow(
      /must be exactly 64 hex characters/,
    );
  });

  test("throws on duplicate kid", () => {
    expect(() =>
      parseSecondaryEncryptionKeys(`v1:${HEX_A}, v1:${HEX_B}`),
    ).toThrow(/duplicate kid "v1"/);
  });

  test("no-colon error does not include the raw key material", () => {
    // Operator paste-error: dropped the "<kid>:" prefix and stored just a 64
    // hex string. The startup failure lands in Cloud Run logs; ensure the raw
    // value never leaks there.
    expect(() => parseSecondaryEncryptionKeys(HEX_A)).toThrow(
      new RegExp(
        `SECONDARY_ENCRYPTION_KEYS entry #1 \\(length=${HEX_A.length}\\)`,
      ),
    );
    try {
      parseSecondaryEncryptionKeys(HEX_A);
    } catch (e) {
      const message = (e as Error).message;
      expect(message).not.toContain(HEX_A);
    }
  });

  test("invalid-hex error does not include the raw hex fragment", () => {
    const badHex = `${"z".repeat(64)}`;
    try {
      parseSecondaryEncryptionKeys(`v1:${badHex}`);
      throw new Error("expected parser to throw");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain('kid="v1"');
      expect(message).toContain("length=64");
      // kid is safe to echo but the offending fragment must stay out.
      expect(message).not.toContain(badHex);
    }
  });
});
