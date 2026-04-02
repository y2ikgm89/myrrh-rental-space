/**
 * 認証ヘルパーテスト
 *
 * src/lib/auth.ts のユニットテスト
 *
 * 注: Better Auth のコア機能（セッション管理）はモックを使用
 *     ここでは型変換・バリデーション関数をテスト
 */

import { describe, test, expect } from "bun:test";
import {
  isValidRole,
  getSessionUser,
  getRoleFromSession,
} from "@/shared/lib/auth";
import { Role } from "@generated/prisma/enums";

// モックセッション型
type MockSessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockSession = {
  user: MockSessionUser;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
};

// 有効なユーザーデータ
const VALID_USER: MockSessionUser = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  role: "ADMIN",
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// 有効なセッションデータ
const VALID_SESSION: MockSession = {
  user: VALID_USER,
  session: {
    id: "session-123",
    userId: "user-123",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24時間後
  },
};

describe("isValidRole", () => {
  describe("正常系", () => {
    test("有効なロール値はtrue", () => {
      expect(isValidRole("SUPER_ADMIN")).toBe(true);
      expect(isValidRole("ADMIN")).toBe(true);
      expect(isValidRole("EDITOR")).toBe(true);
      expect(isValidRole("VIEWER")).toBe(true);
      expect(isValidRole("USER")).toBe(true);
    });
  });

  describe("異常系", () => {
    test("無効なロール値はfalse", () => {
      expect(isValidRole("INVALID")).toBe(false);
      expect(isValidRole("admin")).toBe(false); // 小文字
      expect(isValidRole("")).toBe(false);
      expect(isValidRole("SUPERADMIN")).toBe(false); // アンダースコアなし
    });
  });
});

describe("getSessionUser", () => {
  describe("正常系", () => {
    test("有効なセッションからユーザーを取得", () => {
      // any にキャストしてテスト（実際のBetter Auth Session型との互換性のため）
      const user = getSessionUser(VALID_SESSION as any);

      expect(user).not.toBeNull();
      expect(user?.id).toBe("user-123");
      expect(user?.email).toBe("test@example.com");
      expect(user?.role).toBe(Role.ADMIN);
    });

    test("全ロールで正しく変換される", () => {
      const roles = [
        "SUPER_ADMIN",
        "ADMIN",
        "EDITOR",
        "VIEWER",
        "USER",
      ] as const;

      for (const role of roles) {
        const session = {
          ...VALID_SESSION,
          user: { ...VALID_USER, role },
        };
        const user = getSessionUser(session as any);

        expect(user).not.toBeNull();
        expect(user?.role).toBe(role);
      }
    });
  });

  describe("異常系", () => {
    test("nullセッションはnullを返す", () => {
      const user = getSessionUser(null);
      expect(user).toBeNull();
    });

    test("user がないセッションはnullを返す", () => {
      const session = { session: VALID_SESSION.session } as any;
      const user = getSessionUser(session);
      expect(user).toBeNull();
    });

    test("無効なロールのセッションはnullを返す", () => {
      const session = {
        ...VALID_SESSION,
        user: { ...VALID_USER, role: "INVALID_ROLE" },
      };
      const user = getSessionUser(session as any);
      expect(user).toBeNull();
    });

    test("id がないユーザーはnullを返す", () => {
      const session = {
        ...VALID_SESSION,
        user: { ...VALID_USER, id: undefined },
      };
      const user = getSessionUser(session as any);
      expect(user).toBeNull();
    });

    test("email がないユーザーはnullを返す", () => {
      const session = {
        ...VALID_SESSION,
        user: { ...VALID_USER, email: undefined },
      };
      const user = getSessionUser(session as any);
      expect(user).toBeNull();
    });

    test("role がないユーザーはnullを返す", () => {
      const session = {
        ...VALID_SESSION,
        user: { ...VALID_USER, role: undefined },
      };
      const user = getSessionUser(session as any);
      expect(user).toBeNull();
    });
  });
});

describe("getRoleFromSession", () => {
  describe("正常系", () => {
    test("有効なセッションからロールを取得", () => {
      const role = getRoleFromSession(VALID_SESSION as any);
      expect(role).toBe(Role.ADMIN);
    });

    test("全ロールで正しく取得される", () => {
      const roles = [
        "SUPER_ADMIN",
        "ADMIN",
        "EDITOR",
        "VIEWER",
        "USER",
      ] as const;

      for (const roleValue of roles) {
        const session = {
          ...VALID_SESSION,
          user: { ...VALID_USER, role: roleValue },
        };
        const role = getRoleFromSession(session as any);
        expect(role).toBe(roleValue);
      }
    });
  });

  describe("異常系", () => {
    test("nullセッションはnullを返す", () => {
      const role = getRoleFromSession(null);
      expect(role).toBeNull();
    });

    test("user がないセッションはnullを返す", () => {
      const session = { session: VALID_SESSION.session } as any;
      const role = getRoleFromSession(session);
      expect(role).toBeNull();
    });

    test("無効なロールのセッションはnullを返す", () => {
      const session = {
        ...VALID_SESSION,
        user: { ...VALID_USER, role: "INVALID_ROLE" },
      };
      const role = getRoleFromSession(session as any);
      expect(role).toBeNull();
    });

    test("role が空文字のセッションはnullを返す", () => {
      const session = {
        ...VALID_SESSION,
        user: { ...VALID_USER, role: "" },
      };
      const role = getRoleFromSession(session as any);
      expect(role).toBeNull();
    });
  });
});

describe("Role enum consistency", () => {
  test("Role enumに全ての期待値が含まれる", () => {
    expect(Role.SUPER_ADMIN).toBe("SUPER_ADMIN");
    expect(Role.ADMIN).toBe("ADMIN");
    expect(Role.EDITOR).toBe("EDITOR");
    expect(Role.VIEWER).toBe("VIEWER");
    expect(Role.USER).toBe("USER");
  });

  test("Role enumは6つの値を持つ", () => {
    const roleValues = Object.values(Role);
    expect(roleValues).toHaveLength(6);
    expect(roleValues).toContain("CUSTOMER");
  });
});
