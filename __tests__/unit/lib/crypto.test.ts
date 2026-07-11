/**
 * 暗号化/復号化ユーティリティテスト
 *
 * `getPrimaryEncryptionKey()` を `mock.module` で差し替えて runtime 動的変更を
 * 実現する。`setup.ts` でグローバル mock 済みのため通常 test は固定鍵で動作、
 * 異常系 test は `mockImplementationOnce` で個別 override する。
 */

import { describe, test, expect, mock } from "bun:test";

interface EncryptionKey {
  kid: string;
  hex: string;
}

const PRIMARY: EncryptionKey = { kid: "v1", hex: "a".repeat(64) };
const RETIRED_V0: EncryptionKey = { kid: "v0", hex: "b".repeat(64) };

const mockGetPrimary = mock<() => EncryptionKey>(() => PRIMARY);

mock.module("@/shared/lib/env/encryption", () => ({
  getPrimaryEncryptionKey: mockGetPrimary,
}));

const { encrypt, decrypt, isEncrypted, safeEncrypt, safeDecrypt } =
  await import("@/shared/lib/crypto");

const DEFAULT_PURPOSE = "generic";

function decryptString(ciphertext: string, expectedPurpose: string): string {
  return decrypt(ciphertext, { expectedPurpose }).toString("utf8");
}

describe("crypto", () => {
  describe("encrypt / decrypt (v2 wire format)", () => {
    test("平文を暗号化して復号化できる（v2 形式で出力される）", () => {
      const plaintext = "Hello, World!";
      const encrypted = encrypt(plaintext);

      expect(encrypted.startsWith("v2:")).toBe(true);
      expect(encrypted).toContain(`:${PRIMARY.kid}:`);

      const decrypted = decryptString(encrypted, DEFAULT_PURPOSE);
      expect(decrypted).toBe(plaintext);
    });

    test("日本語を暗号化して復号化できる", () => {
      const plaintext = "こんにちは、世界！";
      expect(decryptString(encrypt(plaintext), DEFAULT_PURPOSE)).toBe(
        plaintext,
      );
    });

    test("長いテキストを暗号化して復号化できる", () => {
      const plaintext = "a".repeat(10000);
      expect(decryptString(encrypt(plaintext), DEFAULT_PURPOSE)).toBe(
        plaintext,
      );
    });

    test("JSONを暗号化して復号化できる", () => {
      const data = {
        type: "service_account",
        project_id: "test-project",
        private_key: "secret-key",
      };
      const plaintext = JSON.stringify(data);
      expect(
        JSON.parse(decryptString(encrypt(plaintext), DEFAULT_PURPOSE)),
      ).toEqual(data);
    });

    test("purpose を指定して暗号化できる", () => {
      const plaintext = "secret data";
      const encrypted = encrypt(plaintext, { purpose: "custom-purpose" });

      expect(encrypted).toContain(":custom-purpose:");
      expect(decryptString(encrypted, "custom-purpose")).toBe(plaintext);
    });

    test("同じ平文でも毎回異なる暗号文になる（IV）", () => {
      const plaintext = "same text";
      const e1 = encrypt(plaintext);
      const e2 = encrypt(plaintext);

      expect(e1).not.toBe(e2);
      expect(decryptString(e1, DEFAULT_PURPOSE)).toBe(plaintext);
      expect(decryptString(e2, DEFAULT_PURPOSE)).toBe(plaintext);
    });

    test("不正な暗号文はエラーを投げる", () => {
      expect(() =>
        decrypt("invalid", { expectedPurpose: DEFAULT_PURPOSE }),
      ).toThrow(/Unsupported ciphertext version/);
      expect(() =>
        decrypt("v1:a:b:c", { expectedPurpose: DEFAULT_PURPOSE }),
      ).toThrow(/Unsupported ciphertext version/);
      expect(() =>
        decrypt("v3:test:a:b:c:d", { expectedPurpose: DEFAULT_PURPOSE }),
      ).toThrow(/Unsupported ciphertext version/);
    });

    test("改ざんされた暗号文はエラーを投げる", () => {
      const encrypted = encrypt("secret");
      const parts = encrypted.split(":");
      parts[5] = "tampered";
      expect(() =>
        decrypt(parts.join(":"), { expectedPurpose: DEFAULT_PURPOSE }),
      ).toThrow();
    });
  });

  describe("unsupported ciphertext versions", () => {
    test("v1 形式は復号せずに拒否する", () => {
      expect(() =>
        decrypt(
          "v1:custom:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:dGVzdA==",
          { expectedPurpose: "custom" },
        ),
      ).toThrow(/Unsupported ciphertext version/);
    });
  });

  describe("primary kid enforcement (v2)", () => {
    test("primary 以外の kid を持つ v2 暗号文は decrypt 失敗", () => {
      mockGetPrimary.mockImplementationOnce(() => RETIRED_V0);
      const retiredEncrypted = encrypt("old-data", { purpose: "stripe" });
      expect(retiredEncrypted).toContain(`:${RETIRED_V0.kid}:`);

      expect(() =>
        decrypt(retiredEncrypted, { expectedPurpose: "stripe" }),
      ).toThrow(/No primary encryption key available/);
    });

    test("未知の kid を持つ v2 暗号文は decrypt 失敗", () => {
      const unknownKidCipher =
        "v2:unknown-kid:stripe:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:dGVzdA==";
      expect(() =>
        decrypt(unknownKidCipher, { expectedPurpose: "stripe" }),
      ).toThrow(/No primary encryption key available/);
    });
  });

  describe("isEncrypted", () => {
    test("v2 暗号化された値は isEncrypted=true", () => {
      const encrypted = encrypt("test");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    test("暗号化されていない値は false", () => {
      expect(isEncrypted("plain text")).toBe(false);
      expect(isEncrypted("")).toBe(false);
      expect(isEncrypted("v2:test")).toBe(false);
    });
  });

  describe("safeEncrypt / safeDecrypt", () => {
    test("正常に暗号化・復号化できる", () => {
      const plaintext = "safe test";
      const encrypted = safeEncrypt(plaintext);

      expect(encrypted).not.toBeNull();
      if (encrypted === null) {
        throw new Error("safeEncrypt must return encrypted text");
      }
      const decrypted = safeDecrypt(encrypted, {
        expectedPurpose: DEFAULT_PURPOSE,
      });
      expect(decrypted).not.toBeNull();
      expect(decrypted?.toString("utf8")).toBe(plaintext);
    });

    test("safeDecrypt は不正な値に対して null を返す", () => {
      expect(
        safeDecrypt("invalid", { expectedPurpose: DEFAULT_PURPOSE }),
      ).toBeNull();
    });

    test("safeEncrypt は鍵未設定で null を返す", () => {
      mockGetPrimary.mockImplementationOnce(() => {
        throw new Error("ENCRYPTION_KEY is not set");
      });

      expect(safeEncrypt("test")).toBeNull();
    });
  });

  describe("expectedPurpose gate", () => {
    test("expectedPurpose と暗号文の purpose が一致すれば復号できる", () => {
      const encrypted = encrypt("hello", { purpose: "purpose-a" });
      expect(decryptString(encrypted, "purpose-a")).toBe("hello");
    });

    test("expectedPurpose が暗号文の purpose と異なると明示エラーで拒否する", () => {
      const encrypted = encrypt("secret", { purpose: "purpose-a" });
      expect(() =>
        decrypt(encrypted, { expectedPurpose: "purpose-b" }),
      ).toThrow(/Ciphertext purpose mismatch/);
    });

    test("safeDecrypt は purpose 不一致で null を返す", () => {
      const encrypted = encrypt("secret", { purpose: "purpose-a" });
      expect(
        safeDecrypt(encrypted, { expectedPurpose: "purpose-b" }),
      ).toBeNull();
    });
  });
});
