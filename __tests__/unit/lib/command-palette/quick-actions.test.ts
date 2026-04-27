import { describe, expect, test } from "bun:test";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import {
  getQuickActionsForRole,
  ALL_QUICK_ACTIONS_FOR_TEST,
} from "@/admin/lib/command-palette/quick-actions";

describe("getQuickActionsForRole", () => {
  test("SUPER_ADMIN は全 quick actions を取得", () => {
    expect(getQuickActionsForRole(Role.SUPER_ADMIN).length).toBe(
      ALL_QUICK_ACTIONS_FOR_TEST.length,
    );
  });

  test("VIEWER は create 権限を持たないため空配列", () => {
    expect(getQuickActionsForRole(Role.VIEWER)).toEqual([]);
  });

  test("ADMIN は create 権限を持つ quick actions を取得", () => {
    const actions = getQuickActionsForRole(Role.ADMIN);
    expect(actions.length).toBeGreaterThan(0);
  });
});
