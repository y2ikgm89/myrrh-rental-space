import { describe, test, expect } from "bun:test";
import {
  hasPermission,
  ROLE_PERMISSIONS,
} from "@/shared/lib/admin-permissions";

// 純粋 RBAC SSoT（client-safe）の権限境界テスト。
// privilege escalation（ADMIN への SUPER_ADMIN 特権混入、VIEWER への write 混入等）の
// silent regression を検出する。実装は型のみ import の純粋関数のためモック不要。

describe("hasPermission", () => {
  describe("SUPER_ADMIN", () => {
    test("コンテンツ管理を許可する", () => {
      expect(hasPermission("SUPER_ADMIN", "space", "delete")).toBe(true);
      expect(hasPermission("SUPER_ADMIN", "event", "publish")).toBe(true);
    });

    test("SUPER_ADMIN 専用特権を許可する", () => {
      expect(hasPermission("SUPER_ADMIN", "auditLog", "read")).toBe(true);
      expect(hasPermission("SUPER_ADMIN", "auditLog", "manage")).toBe(true);
      expect(hasPermission("SUPER_ADMIN", "settings", "manage")).toBe(true);
    });
  });

  describe("ADMIN", () => {
    test("コンテンツ管理全般を許可する", () => {
      expect(hasPermission("ADMIN", "space", "create")).toBe(true);
      expect(hasPermission("ADMIN", "post", "publish")).toBe(true);
      expect(hasPermission("ADMIN", "event", "delete")).toBe(true);
      expect(hasPermission("ADMIN", "coupon", "manage")).toBe(true);
    });

    test("ユーザー基本操作は許可する（階層制御は admin-roles 層で別途）", () => {
      expect(hasPermission("ADMIN", "user", "create")).toBe(true);
      expect(hasPermission("ADMIN", "user", "delete")).toBe(true);
    });

    test("SUPER_ADMIN 専用特権は拒否する（privilege escalation 防止）", () => {
      expect(hasPermission("ADMIN", "user", "manage")).toBe(false);
      expect(hasPermission("ADMIN", "auditLog", "read")).toBe(false);
      expect(hasPermission("ADMIN", "settings", "manage")).toBe(false);
    });
  });

  describe("EDITOR（page-only 設計）", () => {
    test("page 編集 + media + blockTemplate read を許可する", () => {
      expect(hasPermission("EDITOR", "page", "read")).toBe(true);
      expect(hasPermission("EDITOR", "page", "update")).toBe(true);
      expect(hasPermission("EDITOR", "media", "create")).toBe(true);
      expect(hasPermission("EDITOR", "blockTemplate", "read")).toBe(true);
      expect(hasPermission("EDITOR", "notification", "read")).toBe(false);
    });

    test("page の create / delete / publish は拒否する（read/update のみ）", () => {
      expect(hasPermission("EDITOR", "page", "create")).toBe(false);
      expect(hasPermission("EDITOR", "page", "delete")).toBe(false);
      expect(hasPermission("EDITOR", "page", "publish")).toBe(false);
    });

    test("独立 resource（post/news/event/faq）は拒否する", () => {
      expect(hasPermission("EDITOR", "post", "update")).toBe(false);
      expect(hasPermission("EDITOR", "news", "create")).toBe(false);
      expect(hasPermission("EDITOR", "event", "update")).toBe(false);
      expect(hasPermission("EDITOR", "faq", "update")).toBe(false);
    });
  });

  describe("VIEWER（read-only）", () => {
    test("read は許可する", () => {
      expect(hasPermission("VIEWER", "space", "read")).toBe(true);
      expect(hasPermission("VIEWER", "reservation", "read")).toBe(true);
      expect(hasPermission("VIEWER", "event", "read")).toBe(true);
      expect(hasPermission("VIEWER", "notification", "read")).toBe(false);
    });

    test("write 系（create/update/delete/publish/manage）は全拒否する", () => {
      expect(hasPermission("VIEWER", "space", "create")).toBe(false);
      expect(hasPermission("VIEWER", "space", "update")).toBe(false);
      expect(hasPermission("VIEWER", "space", "delete")).toBe(false);
      expect(hasPermission("VIEWER", "post", "publish")).toBe(false);
      expect(hasPermission("VIEWER", "customer", "manage")).toBe(false);
    });
  });

  describe("USER / CUSTOMER（管理権限なし）", () => {
    test("いかなる管理権限も持たない", () => {
      expect(hasPermission("USER", "space", "read")).toBe(false);
      expect(hasPermission("CUSTOMER", "space", "read")).toBe(false);
      expect(hasPermission("CUSTOMER", "page", "read")).toBe(false);
    });
  });
});

describe("ROLE_PERMISSIONS 表の不変条件", () => {
  test("USER / CUSTOMER の権限は空である", () => {
    expect(ROLE_PERMISSIONS.USER).toHaveLength(0);
    expect(ROLE_PERMISSIONS.CUSTOMER).toHaveLength(0);
  });

  test("VIEWER は read アクションのみ（write 混入の検出）", () => {
    const nonRead = ROLE_PERMISSIONS.VIEWER.filter(
      (key) => !key.endsWith(":read"),
    );
    expect(nonRead).toHaveLength(0);
  });

  test("auditLog / settings:manage は SUPER_ADMIN 専用", () => {
    expect(ROLE_PERMISSIONS.ADMIN).not.toContain("auditLog:read");
    expect(ROLE_PERMISSIONS.ADMIN).not.toContain("settings:manage");
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain("auditLog:read");
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain("settings:manage");
  });

  test("SUPER_ADMIN は ADMIN の全権限を包含する（上位互換性）", () => {
    const superSet = new Set<string>(ROLE_PERMISSIONS.SUPER_ADMIN);
    const missing = ROLE_PERMISSIONS.ADMIN.filter((p) => !superSet.has(p));
    expect(missing).toHaveLength(0);
  });

  test("EDITOR の権限は 6 件（page-only 契約の固定化）", () => {
    expect(ROLE_PERMISSIONS.EDITOR).toHaveLength(6);
  });
});
