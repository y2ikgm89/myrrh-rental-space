/**
 * `decrypt` / `safeDecrypt` の `expectedPurpose` gate（DUP-1 Alt-C）契約テスト。
 *
 * ここでは:
 * - purpose 一致で Buffer が返る
 * - purpose 不一致は「purpose mismatch」の distinguishable error で throw する
 * - safeDecrypt は不一致で null に潰す
 * - gate は GCM authTag 検証よりも前に走る（defense in depth）
 * - wire format エラー・kid mismatch は従来通り throw する
 * を検証する。
 */

import { describe, test, expect, mock } from "bun:test";

interface EncryptionKey {
  kid: string;
  hex: string;
}

const PRIMARY: EncryptionKey = { kid: "v1", hex: "a".repeat(64) };
const mockGetPrimary = mock<() => EncryptionKey>(() => PRIMARY);

mock.module("@/shared/lib/env/encryption", () => ({
  getPrimaryEncryptionKey: mockGetPrimary,
  getSecondaryEncryptionKeys: () => [],
  resolveEncryptionKeyByKid: (kid: string) => {
    const primary = mockGetPrimary();
    return primary.kid === kid ? primary : null;
  },
}));

const { encrypt, decrypt, safeDecrypt } = await import("@/shared/lib/crypto");

describe("decrypt / safeDecrypt expectedPurpose gate", () => {
  test("purpose 一致: Buffer 型で plaintext utf-8 バイトが返る", () => {
    const encrypted = encrypt("hello-世界", { purpose: "unit-test-a" });
    const buf = decrypt(encrypted, { expectedPurpose: "unit-test-a" });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString("utf8")).toBe("hello-世界");
  });

  test("purpose 不一致は distinguishable error で throw する", () => {
    const encrypted = encrypt("secret", { purpose: "purpose-a" });
    expect(() => decrypt(encrypted, { expectedPurpose: "purpose-b" })).toThrow(
      /Ciphertext purpose mismatch: expected "purpose-b", got "purpose-a"/,
    );
  });

  test("safeDecrypt は purpose 不一致で null を返す", () => {
    const encrypted = encrypt("secret", { purpose: "purpose-a" });
    expect(safeDecrypt(encrypted, { expectedPurpose: "purpose-b" })).toBeNull();
  });

  test("defense in depth: purpose gate は GCM authTag 検証よりも前に走る", () => {
    // purpose-a で暗号化した ct segment を破壊した状態で purpose-b を期待する。
    // gate が authTag 後だった場合は Node crypto の authTag 失敗が先に throw する。
    // 現契約では purpose gate が先なので、purpose mismatch error が返る。
    const encrypted = encrypt("secret", { purpose: "purpose-a" });
    const parts = encrypted.split(":");
    parts[5] = Buffer.from("tampered").toString("base64");
    const tampered = parts.join(":");
    expect(() => decrypt(tampered, { expectedPurpose: "purpose-b" })).toThrow(
      /Ciphertext purpose mismatch/,
    );
  });

  test("wire format エラーは従来通り throw する（v1 rejection・malformed）", () => {
    expect(() => decrypt("invalid", { expectedPurpose: "anything" })).toThrow(
      /Unsupported ciphertext version/,
    );
    expect(() =>
      decrypt("v1:a:b:c:d:e", { expectedPurpose: "anything" }),
    ).toThrow(/Unsupported ciphertext version/);
    expect(safeDecrypt("invalid", { expectedPurpose: "anything" })).toBeNull();
  });

  test("kid mismatch は従来通り throw する（purpose 先・kid 後の順序）", () => {
    // purpose-a で primary kid=v1 の暗号文を作った上で、kid だけ UNKNOWN に差し替える。
    // purpose gate は通過し、kid mismatch で throw する順序を確認する。
    const encrypted = encrypt("secret", { purpose: "purpose-a" });
    const parts = encrypted.split(":");
    parts[1] = "UNKNOWN";
    const swapped = parts.join(":");
    expect(() => decrypt(swapped, { expectedPurpose: "purpose-a" })).toThrow(
      /No encryption key available for kid="UNKNOWN"/,
    );
  });
});
