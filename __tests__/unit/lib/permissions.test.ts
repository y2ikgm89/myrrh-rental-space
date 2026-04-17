/**
 * 権限管理テスト
 *
 * src/lib/permissions.ts のユニットテスト
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Role } from "@generated/prisma/enums";

// page assignment query のモック
const mockFindMany = mock<() => Promise<{ pageId: string }[]>>(() =>
  Promise.resolve([]),
);
mock.module("@/shared/domain/user-page-assignments/queries", () => ({
  getAssignedPageIdsForUser: async () => {
    const rows = await mockFindMany();
    return rows.map((row) => row.pageId);
  },
}));

import {
  hasPermission,
  canAccessAdmin,
  userHasPermission,
  userHasResourceAccess,
  ROLE_PERMISSIONS,
} from "@/admin/lib/permissions";
import { DASHBOARD_ROLES } from "@/shared/lib/admin-auth";
import {
  SUPER_ADMIN_USER,
  ADMIN_USER,
  EDITOR_USER,
  VIEWER_USER,
  REGULAR_USER,
} from "../../fixtures/users";

describe("hasPermission", () => {
  describe("SUPER_ADMIN", () => {
    test("全リソースの全アクションに権限を持つ", () => {
      // スペース
      expect(hasPermission(Role.SUPER_ADMIN, "space", "create")).toBe(true);
      expect(hasPermission(Role.SUPER_ADMIN, "space", "read")).toBe(true);
      expect(hasPermission(Role.SUPER_ADMIN, "space", "update")).toBe(true);
      expect(hasPermission(Role.SUPER_ADMIN, "space", "delete")).toBe(true);
      expect(hasPermission(Role.SUPER_ADMIN, "space", "publish")).toBe(true);

      // 予約
      expect(hasPermission(Role.SUPER_ADMIN, "reservation", "create")).toBe(
        true,
      );
      expect(hasPermission(Role.SUPER_ADMIN, "reservation", "manage")).toBe(
        true,
      );

      // ユーザー管理
      expect(hasPermission(Role.SUPER_ADMIN, "user", "create")).toBe(true);
      expect(hasPermission(Role.SUPER_ADMIN, "user", "delete")).toBe(true);
      expect(hasPermission(Role.SUPER_ADMIN, "user", "manage")).toBe(true);

      // 監査ログ
      expect(hasPermission(Role.SUPER_ADMIN, "auditLog", "read")).toBe(true);
      expect(hasPermission(Role.SUPER_ADMIN, "auditLog", "manage")).toBe(true);
    });
  });

  describe("ADMIN", () => {
    test("コンテンツ管理権限を持つ", () => {
      expect(hasPermission(Role.ADMIN, "space", "create")).toBe(true);
      expect(hasPermission(Role.ADMIN, "space", "update")).toBe(true);
      expect(hasPermission(Role.ADMIN, "space", "delete")).toBe(true);
      expect(hasPermission(Role.ADMIN, "post", "publish")).toBe(true);
      expect(hasPermission(Role.ADMIN, "settings", "update")).toBe(true);
      expect(hasPermission(Role.ADMIN, "reservation", "manage")).toBe(true);
    });

    test("ユーザー管理権限を持つ（manage は SUPER_ADMIN 専用で持たない）", () => {
      // ADMIN は EDITOR/VIEWER のみ操作可（階層制御は domain 層の canModifyUser で検証）
      expect(hasPermission(Role.ADMIN, "user", "read")).toBe(true);
      expect(hasPermission(Role.ADMIN, "user", "create")).toBe(true);
      expect(hasPermission(Role.ADMIN, "user", "update")).toBe(true);
      expect(hasPermission(Role.ADMIN, "user", "delete")).toBe(true);
      expect(hasPermission(Role.ADMIN, "user", "manage")).toBe(false);
    });

    test("監査ログ権限を持たない", () => {
      expect(hasPermission(Role.ADMIN, "auditLog", "read")).toBe(false);
      expect(hasPermission(Role.ADMIN, "auditLog", "manage")).toBe(false);
    });
  });

  describe("EDITOR", () => {
    test("割り当てページの編集権限のみ", () => {
      // 閲覧可能
      expect(hasPermission(Role.EDITOR, "page", "read")).toBe(true);
      expect(hasPermission(Role.EDITOR, "post", "read")).toBe(true);
      expect(hasPermission(Role.EDITOR, "news", "read")).toBe(true);
      expect(hasPermission(Role.EDITOR, "faq", "read")).toBe(true);

      // 編集可能
      expect(hasPermission(Role.EDITOR, "page", "update")).toBe(true);
      expect(hasPermission(Role.EDITOR, "post", "update")).toBe(true);
      expect(hasPermission(Role.EDITOR, "news", "update")).toBe(true);
      expect(hasPermission(Role.EDITOR, "faq", "update")).toBe(true);
    });

    test("作成・削除・公開権限を持たない", () => {
      expect(hasPermission(Role.EDITOR, "page", "create")).toBe(false);
      expect(hasPermission(Role.EDITOR, "page", "delete")).toBe(false);
      expect(hasPermission(Role.EDITOR, "post", "publish")).toBe(false);
    });

    test("スペース・予約・顧客管理権限を持たない", () => {
      expect(hasPermission(Role.EDITOR, "space", "read")).toBe(false);
      expect(hasPermission(Role.EDITOR, "reservation", "read")).toBe(false);
      expect(hasPermission(Role.EDITOR, "customer", "read")).toBe(false);
    });
  });

  describe("VIEWER", () => {
    test("閲覧権限のみ", () => {
      expect(hasPermission(Role.VIEWER, "space", "read")).toBe(true);
      expect(hasPermission(Role.VIEWER, "reservation", "read")).toBe(true);
      expect(hasPermission(Role.VIEWER, "customer", "read")).toBe(true);
      expect(hasPermission(Role.VIEWER, "inquiry", "read")).toBe(true);
      expect(hasPermission(Role.VIEWER, "post", "read")).toBe(true);
      expect(hasPermission(Role.VIEWER, "settings", "read")).toBe(true);
    });

    test("作成・編集・削除権限を持たない", () => {
      expect(hasPermission(Role.VIEWER, "space", "create")).toBe(false);
      expect(hasPermission(Role.VIEWER, "space", "update")).toBe(false);
      expect(hasPermission(Role.VIEWER, "space", "delete")).toBe(false);
      expect(hasPermission(Role.VIEWER, "post", "publish")).toBe(false);
    });

    test("ユーザー管理・監査ログ権限を持たない", () => {
      expect(hasPermission(Role.VIEWER, "user", "read")).toBe(false);
      expect(hasPermission(Role.VIEWER, "auditLog", "read")).toBe(false);
    });
  });

  describe("USER", () => {
    test("管理機能権限を一切持たない", () => {
      expect(hasPermission(Role.USER, "space", "read")).toBe(false);
      expect(hasPermission(Role.USER, "reservation", "read")).toBe(false);
      expect(hasPermission(Role.USER, "user", "read")).toBe(false);
    });

    test("権限定義が空", () => {
      expect(ROLE_PERMISSIONS[Role.USER]).toHaveLength(0);
    });
  });
});

describe("canAccessAdmin", () => {
  test("SUPER_ADMIN, ADMIN, EDITOR, VIEWERは管理画面アクセス可能", () => {
    expect(canAccessAdmin(Role.SUPER_ADMIN)).toBe(true);
    expect(canAccessAdmin(Role.ADMIN)).toBe(true);
    expect(canAccessAdmin(Role.EDITOR)).toBe(true);
    expect(canAccessAdmin(Role.VIEWER)).toBe(true);
  });

  test("USERは管理画面アクセス不可", () => {
    expect(canAccessAdmin(Role.USER)).toBe(false);
  });

  test("DASHBOARD_ROLESに正しいロールが含まれる", () => {
    expect(DASHBOARD_ROLES).toContain(Role.SUPER_ADMIN);
    expect(DASHBOARD_ROLES).toContain(Role.ADMIN);
    expect(DASHBOARD_ROLES).toContain(Role.EDITOR);
    expect(DASHBOARD_ROLES).toContain(Role.VIEWER);
    expect(DASHBOARD_ROLES).not.toContain(Role.USER);
  });
});

describe("userHasPermission", () => {
  test("ユーザーのロールに基づいて権限をチェック", () => {
    expect(userHasPermission(SUPER_ADMIN_USER, "user", "delete")).toBe(true);
    // ADMIN は user:delete を持つ（EDITOR/VIEWER のみ対象、階層制御は domain 層）
    expect(userHasPermission(ADMIN_USER, "user", "delete")).toBe(true);
    // manage（ロール変更等の特権）は SUPER_ADMIN 専用
    expect(userHasPermission(ADMIN_USER, "user", "manage")).toBe(false);
    expect(userHasPermission(EDITOR_USER, "page", "update")).toBe(true);
    expect(userHasPermission(VIEWER_USER, "space", "read")).toBe(true);
    expect(userHasPermission(REGULAR_USER, "space", "read")).toBe(false);
  });
});

describe("userHasResourceAccess", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);
  });

  describe("SUPER_ADMIN/ADMIN", () => {
    test("全リソースにアクセス可能", async () => {
      expect(
        await userHasResourceAccess(
          SUPER_ADMIN_USER,
          "page",
          "update",
          "any-page-id",
        ),
      ).toBe(true);
      expect(
        await userHasResourceAccess(
          ADMIN_USER,
          "page",
          "update",
          "any-page-id",
        ),
      ).toBe(true);
      expect(
        await userHasResourceAccess(
          ADMIN_USER,
          "post",
          "update",
          "any-post-id",
        ),
      ).toBe(true);
    });
  });

  describe("EDITOR", () => {
    test("割り当てられたリソースにのみアクセス可能", async () => {
      mockFindMany.mockResolvedValue([
        { pageId: "page-1" },
        { pageId: "page-2" },
      ]);

      expect(
        await userHasResourceAccess(EDITOR_USER, "page", "update", "page-1"),
      ).toBe(true);
      expect(
        await userHasResourceAccess(EDITOR_USER, "page", "update", "page-2"),
      ).toBe(true);
      expect(
        await userHasResourceAccess(EDITOR_USER, "page", "update", "page-3"),
      ).toBe(false);
    });

    test("権限のないリソースタイプにはアクセス不可", async () => {
      mockFindMany.mockResolvedValue([{ pageId: "page-1" }]);

      // EDITORはspaceの権限を持たない
      expect(
        await userHasResourceAccess(EDITOR_USER, "space", "update", "page-1"),
      ).toBe(false);
    });

    test("リソースIDなしの場合は許可（一覧表示など）", async () => {
      mockFindMany.mockResolvedValue([{ pageId: "page-1" }]);

      expect(
        await userHasResourceAccess(EDITOR_USER, "page", "update", undefined),
      ).toBe(true);
    });

    test("assignedPagesが空の場合は全てアクセス不可", async () => {
      mockFindMany.mockResolvedValue([]);

      expect(
        await userHasResourceAccess(EDITOR_USER, "page", "update", "page-1"),
      ).toBe(false);
    });
  });

  describe("VIEWER", () => {
    test("読み取り権限のあるリソースには全てアクセス可能", async () => {
      expect(
        await userHasResourceAccess(
          VIEWER_USER,
          "space",
          "read",
          "any-space-id",
        ),
      ).toBe(true);
      expect(
        await userHasResourceAccess(
          VIEWER_USER,
          "reservation",
          "read",
          "any-id",
        ),
      ).toBe(true);
    });

    test("書き込み権限にはアクセス不可", async () => {
      expect(
        await userHasResourceAccess(
          VIEWER_USER,
          "space",
          "update",
          "any-space-id",
        ),
      ).toBe(false);
    });
  });

  describe("USER", () => {
    test("管理リソースには一切アクセス不可", async () => {
      expect(
        await userHasResourceAccess(REGULAR_USER, "space", "read", "any-id"),
      ).toBe(false);
    });
  });
});

describe("ROLE_PERMISSIONS integrity", () => {
  test("全ロールが定義されている", () => {
    expect(ROLE_PERMISSIONS).toHaveProperty(Role.SUPER_ADMIN);
    expect(ROLE_PERMISSIONS).toHaveProperty(Role.ADMIN);
    expect(ROLE_PERMISSIONS).toHaveProperty(Role.EDITOR);
    expect(ROLE_PERMISSIONS).toHaveProperty(Role.VIEWER);
    expect(ROLE_PERMISSIONS).toHaveProperty(Role.USER);
  });

  test("権限キーは正しい形式（resource:action）", () => {
    const permissionKeyRegex = /^[a-zA-Z]+:[a-z]+$/;

    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(permission).toMatch(permissionKeyRegex);
      }
    }
  });

  test("SUPER_ADMINは最も多くの権限を持つ", () => {
    const superAdminCount = ROLE_PERMISSIONS[Role.SUPER_ADMIN].length;
    const adminCount = ROLE_PERMISSIONS[Role.ADMIN].length;
    const editorCount = ROLE_PERMISSIONS[Role.EDITOR].length;
    const viewerCount = ROLE_PERMISSIONS[Role.VIEWER].length;

    expect(superAdminCount).toBeGreaterThan(adminCount);
    expect(adminCount).toBeGreaterThan(editorCount);
    expect(adminCount).toBeGreaterThan(viewerCount);
  });
});
