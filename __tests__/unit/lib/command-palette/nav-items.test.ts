import { describe, expect, test } from "bun:test";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import {
  getNavItemsForRole,
  ALL_NAV_ITEMS_FOR_TEST,
} from "@/admin/lib/command-palette/nav-items";

describe("getNavItemsForRole", () => {
  test("SUPER_ADMIN は全 nav items を取得", () => {
    expect(getNavItemsForRole(Role.SUPER_ADMIN).length).toBe(
      ALL_NAV_ITEMS_FOR_TEST.length,
    );
  });

  test("VIEWER は user / auditLog 等の管理対象外 resource は除外", () => {
    const items = getNavItemsForRole(Role.VIEWER);
    expect(items.find((i) => i.resource === "user")).toBeUndefined();
    expect(items.find((i) => i.resource === "auditLog")).toBeUndefined();
  });

  test("EDITOR は read 可能な resource のみ", () => {
    const items = getNavItemsForRole(Role.EDITOR);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(ALL_NAV_ITEMS_FOR_TEST.length);
  });

  test("ADMIN は user / auditLog を含む", () => {
    const items = getNavItemsForRole(Role.ADMIN);
    expect(items.find((i) => i.resource === "user")).toBeDefined();
  });
});
