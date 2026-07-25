import { describe, expect, test } from "bun:test";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import {
  getNavItemsForRole,
  ALL_NAV_ITEMS_FOR_TEST,
} from "@/admin/lib/command-palette/nav-items";
import {
  assertAdminNavFeatureModulesAreRegistered,
  collectMappedAdminNavFeatureModules,
} from "@/shared/lib/features/admin-nav";
import { ALL_QUICK_ACTIONS_FOR_TEST } from "@/admin/lib/command-palette/quick-actions";

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

  test("featureModule map drift gate — mapped values ⊆ FEATURE_MODULES_LIST", () => {
    const navMapped = collectMappedAdminNavFeatureModules(
      ALL_NAV_ITEMS_FOR_TEST.map((item) => item.featureModule),
    );
    const quickMapped = collectMappedAdminNavFeatureModules(
      ALL_QUICK_ACTIONS_FOR_TEST.map((action) => action.featureModule),
    );
    const allMapped = [...new Set([...navMapped, ...quickMapped])].sort();
    expect(allMapped).toEqual([
      "access",
      "contact",
      "events",
      "faq",
      "news",
      "payment",
      "posts",
      "reservation",
      "spaces",
    ]);
    assertAdminNavFeatureModulesAreRegistered(allMapped);
  });

  test("locations は access、settings-billing は payment に map", () => {
    const locations = ALL_NAV_ITEMS_FOR_TEST.find((i) => i.id === "locations");
    const billing = ALL_NAV_ITEMS_FOR_TEST.find(
      (i) => i.id === "settings-billing",
    );
    expect(locations?.featureModule).toBe("access");
    expect(billing?.featureModule).toBe("payment");
  });
});
