/**
 * 認証バリデーションテスト
 *
 * src/lib/validations/auth.ts のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import { credentialsSchema } from "@/admin/lib/validations/auth";

describe("credentialsSchema", () => {
  const validCredentials = {
    email: "admin@example.com",
    password: "password123",
  };

  describe("正常系", () => {
    test("有効な認証情報は検証を通過", () => {
      const result = credentialsSchema.safeParse(validCredentials);
      expect(result.success).toBe(true);
    });

    test("パスワード1文字でも通過", () => {
      const result = credentialsSchema.safeParse({
        ...validCredentials,
        password: "a",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("email", () => {
    test("無効なメールアドレス形式はエラー", () => {
      const invalidEmails = [
        "invalid",
        "test@",
        "@example.com",
        "test@.com",
        "",
      ];

      for (const email of invalidEmails) {
        const result = credentialsSchema.safeParse({
          ...validCredentials,
          email,
        });
        expect(result.success).toBe(false);
      }
    });

    test("有効なメールアドレス形式", () => {
      const validEmails = [
        "test@example.com",
        "user.name@domain.co.jp",
        "user+tag@example.org",
      ];

      for (const email of validEmails) {
        const result = credentialsSchema.safeParse({
          ...validCredentials,
          email,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("password", () => {
    test("空文字はエラー", () => {
      const result = credentialsSchema.safeParse({
        ...validCredentials,
        password: "",
      });
      expect(result.success).toBe(false);
    });

    test("undefinedはエラー", () => {
      const { password, ...withoutPassword } = validCredentials;
      const result = credentialsSchema.safeParse(withoutPassword);
      expect(result.success).toBe(false);
    });
  });
});
