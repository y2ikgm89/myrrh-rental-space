import { describe, test, expect } from "bun:test";
import {
  DASHBOARD_ROLES,
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
    const roles = new Set<unknown>(DASHBOARD_ROLES);
    expect(roles.has(Role.USER)).toBe(false);
    expect(roles.has(Role.CUSTOMER)).toBe(false);
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
