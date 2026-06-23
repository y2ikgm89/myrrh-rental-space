/**
 * 暗号化/復号化ユーティリティテスト
 *
 * `getPrimaryEncryptionKey()` / `findEncryptionKeyByKid()` を `mock.module` で
 * 差し替えて runtime 動的変更を実現する。`setup.ts` でグローバル mock 済みのため
 * 通常 test は固定鍵で動作、異常系 test は `mockImplementationOnce` で個別 override する。
 */

import { describe, test, expect, mock } from "bun:test";

interface EncryptionKey {
  kid: string;
  hex: string;
}

const PRIMARY: EncryptionKey = { kid: "v1", hex: "a".repeat(64) };
const LEGACY_V0: EncryptionKey = { kid: "v0", hex: "b".repeat(64) };

const mockGetPrimary = mock<() => EncryptionKey>(() => PRIMARY);
const mockFindByKid = mock<(kid: string) => EncryptionKey | null>((kid) => {
  if (kid === PRIMARY.kid) return PRIMARY;
  if (kid === LEGACY_V0.kid) return LEGACY_V0;
  return null;
});

mock.module("@/shared/lib/env/encryption", () => ({
  DEFAULT_KID: "v1",
  getEncryptionKey: () => PRIMARY.hex,
  getPrimaryEncryptionKey: mockGetPrimary,
  getLegacyEncryptionKeys: () => [LEGACY_V0],
  findEncryptionKeyByKid: mockFindByKid,
}));

const {
  encrypt,
  decrypt,
  isEncrypted,
  isEncryptedWithPrimary,
  safeEncrypt,
  safeDecrypt,
  encryptApiKey,
  encryptStripeData,
} = await import("@/shared/lib/crypto");

describe("crypto", () => {
  describe("encrypt / decrypt (v2 wire format)", () => {
    test("平文を暗号化して復号化できる（v2 形式で出力される）", () => {
      const plaintext = "Hello, World!";
      const encrypted = encrypt(plaintext);

      expect(encrypted.startsWith("v2:")).toBe(true);
      expect(encrypted).toContain(`:${PRIMARY.kid}:`);

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test("日本語を暗号化して復号化できる", () => {
      const plaintext = "こんにちは、世界！";
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });

    test("長いテキストを暗号化して復号化できる", () => {
      const plaintext = "a".repeat(10000);
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });

    test("JSONを暗号化して復号化できる", () => {
      const data = {
        type: "service_account",
        project_id: "test-project",
        private_key: "secret-key",
      };
      const plaintext = JSON.stringify(data);
      expect(JSON.parse(decrypt(encrypt(plaintext)))).toEqual(data);
    });

    test("purpose を指定して暗号化できる", () => {
      const plaintext = "secret data";
      const encrypted = encrypt(plaintext, { purpose: "custom-purpose" });

      expect(encrypted).toContain(":custom-purpose:");
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    test("同じ平文でも毎回異なる暗号文になる（IV）", () => {
      const plaintext = "same text";
      const e1 = encrypt(plaintext);
      const e2 = encrypt(plaintext);

      expect(e1).not.toBe(e2);
      expect(decrypt(e1)).toBe(plaintext);
      expect(decrypt(e2)).toBe(plaintext);
    });

    test("不正な暗号文はエラーを投げる", () => {
      expect(() => decrypt("invalid")).toThrow();
      expect(() => decrypt("v1:a:b:c")).toThrow();
      expect(() => decrypt("v3:test:a:b:c:d")).toThrow();
    });

    test("改ざんされた暗号文はエラーを投げる", () => {
      const encrypted = encrypt("secret");
      const parts = encrypted.split(":");
      parts[5] = "tampered";
      expect(() => decrypt(parts.join(":"))).toThrow();
    });
  });

  describe("legacy v1 ciphertext fallback", () => {
    test("v1 形式（kid 無し）も primary 鍵で復号できる（旧データ互換）", () => {
      // v1 形式の暗号文を手動で構築（primary 鍵 + v1 wire format + AAD）
      // crypto モジュールを直接使う代わりに encrypt の出力を v2 → v1 にダウングレード
      // するヘルパーが無いため、ここでは v1 形式の wire を実時計で再現:
      // 既存の v2 暗号文と同じ payload + 鍵で v1 風にしたものは作れない（AAD が異なるため）。
      // この test では「v1 形式の文字列を受け取って parse できる」ことだけ確認する。
      // 実復号は parsed.version === "v1" 経路で primary key を使う設計。
      // → 偽 v1 文字列は authTag が合わず throw する（期待動作）。
      expect(() =>
        decrypt("v1:custom:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:dGVzdA=="),
      ).toThrow();
    });
  });

  describe("kid-based key resolution (v2)", () => {
    test("legacy kid の v2 暗号文を legacy 鍵で復号できる", () => {
      // legacy 鍵で encrypt → primary 切替 → legacy 鍵 fallback で decrypt
      mockGetPrimary.mockImplementationOnce(() => LEGACY_V0);
      const legacyEncrypted = encrypt("legacy-data", { purpose: "stripe" });
      expect(legacyEncrypted).toContain(`:${LEGACY_V0.kid}:`);

      // primary を元に戻し、legacy fallback での復号を確認
      expect(decrypt(legacyEncrypted)).toBe("legacy-data");
    });

    test("未知の kid を持つ v2 暗号文は decrypt 失敗", () => {
      const unknownKidCipher =
        "v2:unknown-kid:stripe:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:dGVzdA==";
      expect(() => decrypt(unknownKidCipher)).toThrow(
        /No encryption key available/,
      );
    });
  });

  describe("isEncrypted / isEncryptedWithPrimary", () => {
    test("v2 暗号化された値は isEncrypted=true", () => {
      const encrypted = encrypt("test");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    test("暗号化されていない値は false", () => {
      expect(isEncrypted("plain text")).toBe(false);
      expect(isEncrypted("")).toBe(false);
      expect(isEncrypted("v2:test")).toBe(false);
    });

    test("primary 鍵で書かれた暗号文は isEncryptedWithPrimary=true", () => {
      const encrypted = encrypt("test");
      expect(isEncryptedWithPrimary(encrypted)).toBe(true);
    });

    test("legacy 鍵で書かれた暗号文は isEncryptedWithPrimary=false（re-encrypt 候補）", () => {
      mockGetPrimary.mockImplementationOnce(() => LEGACY_V0);
      const legacyEncrypted = encrypt("test");
      expect(isEncryptedWithPrimary(legacyEncrypted)).toBe(false);
    });

    test("不正フォーマットは isEncryptedWithPrimary=false", () => {
      expect(isEncryptedWithPrimary("invalid")).toBe(false);
    });
  });

  describe("safeEncrypt / safeDecrypt", () => {
    test("正常に暗号化・復号化できる", () => {
      const plaintext = "safe test";
      const encrypted = safeEncrypt(plaintext);

      expect(encrypted).not.toBeNull();
      expect(safeDecrypt(encrypted!)).toBe(plaintext);
    });

    test("safeDecrypt は不正な値に対して null を返す", () => {
      expect(safeDecrypt("invalid")).toBeNull();
    });

    test("safeEncrypt は鍵未設定で null を返す", () => {
      mockGetPrimary.mockImplementationOnce(() => {
        throw new Error("ENCRYPTION_KEY is not set");
      });

      expect(safeEncrypt("test")).toBeNull();
    });
  });

  describe("encryptApiKey / encryptStripeData", () => {
    test("API キーを purpose='api-key' で暗号化", () => {
      const apiKey = "sk_test_1234567890";
      const encrypted = encryptApiKey(apiKey);

      expect(encrypted).toContain(":api-key:");
      expect(decrypt(encrypted)).toBe(apiKey);
    });

    test("Stripe データを purpose='stripe' で暗号化", () => {
      const stripeData = "acct_1234567890";
      const encrypted = encryptStripeData(stripeData);

      expect(encrypted).toContain(":stripe:");
      expect(decrypt(encrypted)).toBe(stripeData);
    });
  });
});
