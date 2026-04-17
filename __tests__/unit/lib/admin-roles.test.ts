import { describe, test, expect } from "bun:test";
import {
  canInviteRole,
  canModifyUser,
  DASHBOARD_ROLES,
  getInvitableRoles,
  INVITABLE_BY,
  isDashboardRole,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from "@/shared/lib/admin-roles";
import { Role } from "@generated/prisma/enums";

describe("DASHBOARD_ROLES", () => {
  test("4 つの管理ロールを含む", () => {
    expect(DASHBOARD_ROLES).toEqual([
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.EDITOR,
      Role.VIEWER,
    ]);
  });

  test("USER / CUSTOMER は含まない", () => {
    expect(DASHBOARD_ROLES as readonly Role[]).not.toContain(Role.USER);
    expect(DASHBOARD_ROLES as readonly Role[]).not.toContain(Role.CUSTOMER);
  });
});

describe("isDashboardRole", () => {
  test("DASHBOARD_ROLES の全てを true と判定する", () => {
    for (const role of DASHBOARD_ROLES) {
      expect(isDashboardRole(role)).toBe(true);
    }
  });

  test("USER / CUSTOMER を false と判定する", () => {
    expect(isDashboardRole(Role.USER)).toBe(false);
    expect(isDashboardRole(Role.CUSTOMER)).toBe(false);
  });
});

describe("INVITABLE_BY", () => {
  test("SUPER_ADMIN は ADMIN / EDITOR / VIEWER を招待可", () => {
    expect(INVITABLE_BY.SUPER_ADMIN).toEqual([
      Role.ADMIN,
      Role.EDITOR,
      Role.VIEWER,
    ]);
  });

  test("ADMIN は EDITOR / VIEWER のみ招待可（特権昇格防止）", () => {
    expect(INVITABLE_BY.ADMIN).toEqual([Role.EDITOR, Role.VIEWER]);
    expect(INVITABLE_BY.ADMIN as readonly Role[]).not.toContain(Role.ADMIN);
    expect(INVITABLE_BY.ADMIN as readonly Role[]).not.toContain(
      Role.SUPER_ADMIN,
    );
  });

  test("EDITOR / VIEWER は誰も招待できない", () => {
    expect(INVITABLE_BY.EDITOR).toEqual([]);
    expect(INVITABLE_BY.VIEWER).toEqual([]);
  });
});

describe("getInvitableRoles", () => {
  test("SUPER_ADMIN に対して 3 ロールを返す", () => {
    expect(getInvitableRoles(Role.SUPER_ADMIN)).toEqual([
      Role.ADMIN,
      Role.EDITOR,
      Role.VIEWER,
    ]);
  });

  test("ADMIN に対して EDITOR / VIEWER のみ返す", () => {
    expect(getInvitableRoles(Role.ADMIN)).toEqual([Role.EDITOR, Role.VIEWER]);
  });

  test("EDITOR / VIEWER に対して空配列を返す", () => {
    expect(getInvitableRoles(Role.EDITOR)).toEqual([]);
    expect(getInvitableRoles(Role.VIEWER)).toEqual([]);
  });
});

describe("canInviteRole", () => {
  test("SUPER_ADMIN は ADMIN / EDITOR / VIEWER を招待可", () => {
    expect(canInviteRole(Role.SUPER_ADMIN, Role.ADMIN)).toBe(true);
    expect(canInviteRole(Role.SUPER_ADMIN, Role.EDITOR)).toBe(true);
    expect(canInviteRole(Role.SUPER_ADMIN, Role.VIEWER)).toBe(true);
  });

  test("SUPER_ADMIN は自分（SUPER_ADMIN）を招待不可", () => {
    expect(canInviteRole(Role.SUPER_ADMIN, Role.SUPER_ADMIN)).toBe(false);
  });

  test("ADMIN は EDITOR / VIEWER のみ招待可", () => {
    expect(canInviteRole(Role.ADMIN, Role.EDITOR)).toBe(true);
    expect(canInviteRole(Role.ADMIN, Role.VIEWER)).toBe(true);
  });

  test("ADMIN は ADMIN / SUPER_ADMIN を招待不可（特権昇格防止）", () => {
    expect(canInviteRole(Role.ADMIN, Role.ADMIN)).toBe(false);
    expect(canInviteRole(Role.ADMIN, Role.SUPER_ADMIN)).toBe(false);
  });

  test("EDITOR / VIEWER は誰も招待できない", () => {
    for (const target of DASHBOARD_ROLES) {
      expect(canInviteRole(Role.EDITOR, target)).toBe(false);
      expect(canInviteRole(Role.VIEWER, target)).toBe(false);
    }
  });

  test("USER / CUSTOMER は誰も招待できない", () => {
    expect(canInviteRole(Role.USER, Role.EDITOR)).toBe(false);
    expect(canInviteRole(Role.CUSTOMER, Role.EDITOR)).toBe(false);
  });

  test("USER / CUSTOMER を招待ターゲットに指定するのは拒否", () => {
    expect(canInviteRole(Role.SUPER_ADMIN, Role.USER)).toBe(false);
    expect(canInviteRole(Role.SUPER_ADMIN, Role.CUSTOMER)).toBe(false);
  });
});

describe("canModifyUser", () => {
  test("SUPER_ADMIN は ADMIN / EDITOR / VIEWER を編集可（SUPER_ADMIN は updateUserRole のみ）", () => {
    expect(canModifyUser(Role.SUPER_ADMIN, Role.ADMIN)).toBe(true);
    expect(canModifyUser(Role.SUPER_ADMIN, Role.EDITOR)).toBe(true);
    expect(canModifyUser(Role.SUPER_ADMIN, Role.VIEWER)).toBe(true);
  });

  test("ADMIN は EDITOR / VIEWER のみ編集可", () => {
    expect(canModifyUser(Role.ADMIN, Role.EDITOR)).toBe(true);
    expect(canModifyUser(Role.ADMIN, Role.VIEWER)).toBe(true);
  });

  test("ADMIN は別 ADMIN / SUPER_ADMIN を編集不可", () => {
    expect(canModifyUser(Role.ADMIN, Role.ADMIN)).toBe(false);
    expect(canModifyUser(Role.ADMIN, Role.SUPER_ADMIN)).toBe(false);
  });

  test("EDITOR / VIEWER は誰も編集不可", () => {
    for (const target of DASHBOARD_ROLES) {
      expect(canModifyUser(Role.EDITOR, target)).toBe(false);
      expect(canModifyUser(Role.VIEWER, target)).toBe(false);
    }
  });
});

describe("ROLE_LABELS / ROLE_DESCRIPTIONS", () => {
  test("全 Role に対してラベルが定義されている", () => {
    for (const role of Object.values(Role)) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_DESCRIPTIONS[role]).toBeTruthy();
    }
  });

  test("SUPER_ADMIN / ADMIN の説明に階層の境界が記載されている", () => {
    expect(ROLE_DESCRIPTIONS.SUPER_ADMIN).toContain("システム初期化時");
    expect(ROLE_DESCRIPTIONS.ADMIN).toContain("監査ログ");
  });
});
