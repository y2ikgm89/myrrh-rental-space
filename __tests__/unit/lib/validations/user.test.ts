import { describe, test, expect } from "bun:test";
import {
  createUserSchema,
  updateUserSchema,
} from "@/shared/lib/validations/user";
import { Role } from "@generated/prisma/enums";

describe("createUserSchema", () => {
  const validUserData = {
    email: "user@example.com",
    password: "password123",
    name: "山田太郎",
    role: Role.EDITOR,
  };

  test("有効なデータでバリデーションに成功する", () => {
    const result = createUserSchema.safeParse(validUserData);
    expect(result.success).toBe(true);
  });

  test("メールアドレスが空の場合にエラー", () => {
    const invalidData = { ...validUserData, email: "" };
    const result = createUserSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("無効なメールアドレスの場合にエラー", () => {
    const invalidData = { ...validUserData, email: "invalid-email" };
    const result = createUserSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("有効なメールアドレス");
    }
  });

  test("パスワードが8文字未満の場合にエラー", () => {
    const invalidData = { ...validUserData, password: "pass123" };
    const result = createUserSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("8文字以上");
    }
  });

  test("パスワードがちょうど8文字の場合に成功", () => {
    const validData = { ...validUserData, password: "password" };
    const result = createUserSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("名前が空の場合にエラー", () => {
    const invalidData = { ...validUserData, name: "" };
    const result = createUserSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("名前は必須です");
    }
  });

  test("名前の最大長を超える場合にエラー", () => {
    const invalidData = { ...validUserData, name: "あ".repeat(101) };
    const result = createUserSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("DASHBOARD_ROLES の全ロール値を許可", () => {
    const roles = [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.VIEWER];
    roles.forEach((role) => {
      const data = { ...validUserData, role };
      const result = createUserSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  test("USER ロールはスキーマレベルで拒否（公開ユーザー用のため）", () => {
    const data = { ...validUserData, role: Role.USER };
    const result = createUserSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("CUSTOMER ロールはスキーマレベルで拒否", () => {
    const data = { ...validUserData, role: Role.CUSTOMER };
    const result = createUserSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("無効なRole値の場合にエラー", () => {
    const invalidData = { ...validUserData, role: "INVALID_ROLE" };
    const result = createUserSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  const validUpdateData = {
    email: "user@example.com",
    name: "山田太郎",
    role: Role.EDITOR,
  };

  test("有効なデータでバリデーションに成功する", () => {
    const result = updateUserSchema.safeParse(validUpdateData);
    expect(result.success).toBe(true);
  });

  test("パスワードフィールドはオプショナル", () => {
    const result = updateUserSchema.safeParse(validUpdateData);
    expect(result.success).toBe(true);
  });

  test("パスワードに空文字列を許可", () => {
    const validData = { ...validUpdateData, password: "" };
    const result = updateUserSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("パスワードが指定された場合は8文字以上必須", () => {
    const invalidData = { ...validUpdateData, password: "pass123" };
    const result = updateUserSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("8文字以上");
    }
  });

  test("パスワードが8文字以上の場合に成功", () => {
    const validData = { ...validUpdateData, password: "newpassword123" };
    const result = updateUserSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("無効なメールアドレスの場合にエラー", () => {
    const invalidData = { ...validUpdateData, email: "invalid-email" };
    const result = updateUserSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("有効なメールアドレス");
    }
  });

  test("名前が空の場合にエラー", () => {
    const invalidData = { ...validUpdateData, name: "" };
    const result = updateUserSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("名前は必須です");
    }
  });

  test("名前の最大長を超える場合にエラー", () => {
    const invalidData = { ...validUpdateData, name: "あ".repeat(101) };
    const result = updateUserSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("DASHBOARD_ROLES の全ロール値を許可", () => {
    const roles = [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.VIEWER];
    roles.forEach((role) => {
      const data = { ...validUpdateData, role };
      const result = updateUserSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  test("USER / CUSTOMER ロールは拒否", () => {
    for (const role of [Role.USER, Role.CUSTOMER]) {
      const data = { ...validUpdateData, role };
      const result = updateUserSchema.safeParse(data);
      expect(result.success).toBe(false);
    }
  });

  test("無効なRole値の場合にエラー", () => {
    const invalidData = { ...validUpdateData, role: "INVALID_ROLE" };
    const result = updateUserSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});
