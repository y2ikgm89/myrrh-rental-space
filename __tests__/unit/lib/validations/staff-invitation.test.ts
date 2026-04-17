import { describe, test, expect } from "bun:test";
import {
  createInvitationSchema,
  setupPasswordSchema,
} from "@/shared/lib/validations/staff-invitation";
import { Role } from "@generated/prisma/enums";

describe("createInvitationSchema", () => {
  const validInvitationData = {
    email: "staff@example.com",
    role: Role.EDITOR,
    name: "山田太郎",
  };

  test("有効なデータでバリデーションに成功する", () => {
    const result = createInvitationSchema.safeParse(validInvitationData);
    expect(result.success).toBe(true);
  });

  test("メールアドレスが空の場合にエラー", () => {
    const invalidData = { ...validInvitationData, email: "" };
    const result = createInvitationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("無効なメールアドレスの場合にエラー", () => {
    const invalidData = { ...validInvitationData, email: "invalid-email" };
    const result = createInvitationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("有効なメールアドレス");
    }
  });

  test("role フィールドは必須（デフォルト値なし）", () => {
    // role のデフォルト値は UI 層（InviteForm の defaultValues）が設定する。
    // スキーマ側では必須にすることで、`SUPER_ADMIN` のような意図しないデフォルトが
    // サーバー API へ漏れるリスクを排除する。
    const data = { email: "staff@example.com" };
    const result = createInvitationSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("nameフィールドはオプショナル", () => {
    const data = {
      email: "staff@example.com",
      role: Role.EDITOR,
    };
    const result = createInvitationSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("nameフィールドの最大長を超える場合にエラー", () => {
    const invalidData = {
      ...validInvitationData,
      name: "あ".repeat(101),
    };
    const result = createInvitationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("INVITABLE_ROLES（ADMIN/EDITOR/VIEWER）のみ許可", () => {
    for (const role of [Role.ADMIN, Role.EDITOR, Role.VIEWER]) {
      const data = { email: "staff@example.com", role };
      const result = createInvitationSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  test("SUPER_ADMIN はスキーマレベルで拒否（システム初期化時のみ作成可）", () => {
    const data = { email: "staff@example.com", role: Role.SUPER_ADMIN };
    const result = createInvitationSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("USER / CUSTOMER は拒否", () => {
    for (const role of [Role.USER, Role.CUSTOMER]) {
      const data = { email: "staff@example.com", role };
      const result = createInvitationSchema.safeParse(data);
      expect(result.success).toBe(false);
    }
  });

  test("無効なRole値の場合にエラー", () => {
    const invalidData = {
      email: "staff@example.com",
      role: "INVALID_ROLE",
    };
    const result = createInvitationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

describe("setupPasswordSchema", () => {
  const validPasswordData = {
    token: "abc123def456",
    password: "password123",
    confirmPassword: "password123",
  };

  test("有効なデータでバリデーションに成功する", () => {
    const result = setupPasswordSchema.safeParse(validPasswordData);
    expect(result.success).toBe(true);
  });

  test("トークンが空の場合にエラー", () => {
    const invalidData = { ...validPasswordData, token: "" };
    const result = setupPasswordSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("トークンが必要です");
    }
  });

  test("パスワードが8文字未満の場合にエラー", () => {
    const invalidData = {
      ...validPasswordData,
      password: "pass123",
      confirmPassword: "pass123",
    };
    const result = setupPasswordSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("8文字以上");
    }
  });

  test("パスワードがちょうど8文字の場合に成功", () => {
    const validData = {
      ...validPasswordData,
      password: "password",
      confirmPassword: "password",
    };
    const result = setupPasswordSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("確認用パスワードが8文字未満の場合にエラー", () => {
    const invalidData = {
      ...validPasswordData,
      confirmPassword: "pass123",
    };
    const result = setupPasswordSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("確認用パスワード");
    }
  });

  test("パスワードと確認用パスワードが一致しない場合にエラー", () => {
    const invalidData = {
      token: "abc123def456",
      password: "password123",
      confirmPassword: "differentpassword",
    };
    const result = setupPasswordSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("パスワードが一致しません"),
        ),
      ).toBe(true);
    }
  });

  test("refineバリデーションのエラーパスがconfirmPasswordに設定される", () => {
    const invalidData = {
      token: "abc123def456",
      password: "password123",
      confirmPassword: "differentpassword",
    };
    const result = setupPasswordSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmPasswordError = result.error.issues.find((issue) =>
        issue.path.includes("confirmPassword"),
      );
      expect(confirmPasswordError).toBeDefined();
      expect(confirmPasswordError?.message).toContain(
        "パスワードが一致しません",
      );
    }
  });

  test("パスワードが同じで8文字以上の場合に成功", () => {
    const validData = {
      token: "validtoken123",
      password: "securepassword",
      confirmPassword: "securepassword",
    };
    const result = setupPasswordSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("大文字小文字が異なる場合にエラー", () => {
    const invalidData = {
      token: "abc123def456",
      password: "Password123",
      confirmPassword: "password123",
    };
    const result = setupPasswordSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("パスワードが一致しません"),
        ),
      ).toBe(true);
    }
  });
});
