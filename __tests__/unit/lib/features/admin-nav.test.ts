import { describe, expect, test } from "bun:test";
import {
  ADMIN_FEATURE_SETTINGS_HREF,
  ADMIN_NAV_DISABLED_BADGE_LABEL,
  ADMIN_NAV_DISABLED_TOOLTIP_TEMPLATE,
  assertAdminNavFeatureModulesAreRegistered,
  collectMappedAdminNavFeatureModules,
  formatAdminNavDisabledTooltip,
  isAdminFeatureCreateAllowed,
  isAdminNavFeaturePubliclyDisabled,
  isAdminQuickActionFeatureDisabled,
} from "@/shared/lib/features/admin-nav";
import {
  FEATURE_MODULES,
  FEATURE_MODULES_LIST,
  type FeatureModule,
} from "@/shared/lib/features/registry";

function enabledSet(...modules: FeatureModule[]): ReadonlySet<FeatureModule> {
  return new Set(modules);
}

describe("admin-nav helpers", () => {
  test("ADMIN_FEATURE_SETTINGS_HREF は機能モジュール設定画面", () => {
    expect(ADMIN_FEATURE_SETTINGS_HREF).toBe("/admin/settings/features");
  });

  test("formatAdminNavDisabledTooltip は registry label を埋め込む", () => {
    expect(formatAdminNavDisabledTooltip("events")).toBe(
      ADMIN_NAV_DISABLED_TOOLTIP_TEMPLATE.replace(
        "{label}",
        FEATURE_MODULES.events.label,
      ),
    );
  });

  test("isAdminNavFeaturePubliclyDisabled — unmapped は常に false", () => {
    const enabled = enabledSet("events");
    expect(isAdminNavFeaturePubliclyDisabled(undefined, enabled)).toBe(false);
  });

  test("isAdminNavFeaturePubliclyDisabled — enabled set に無ければ true", () => {
    const enabled = enabledSet("spaces");
    expect(isAdminNavFeaturePubliclyDisabled("events", enabled)).toBe(true);
    expect(isAdminNavFeaturePubliclyDisabled("spaces", enabled)).toBe(false);
  });

  test("isAdminQuickActionFeatureDisabled は nav と同じ判定", () => {
    const enabled = enabledSet("posts");
    expect(isAdminQuickActionFeatureDisabled("news", enabled)).toBe(true);
    expect(isAdminQuickActionFeatureDisabled("posts", enabled)).toBe(false);
    expect(isAdminQuickActionFeatureDisabled(undefined, enabled)).toBe(false);
  });

  test("isAdminFeatureCreateAllowed は OFF 時 false（未 map は true）", () => {
    const enabled = enabledSet("spaces");
    expect(isAdminFeatureCreateAllowed("events", enabled)).toBe(false);
    expect(isAdminFeatureCreateAllowed("spaces", enabled)).toBe(true);
    expect(isAdminFeatureCreateAllowed(undefined, enabled)).toBe(true);
  });

  test("tooltip は編集可・新規作成不可を明示する", () => {
    expect(ADMIN_NAV_DISABLED_TOOLTIP_TEMPLATE).toContain(
      "確認・編集はできます",
    );
    expect(ADMIN_NAV_DISABLED_TOOLTIP_TEMPLATE).toContain(
      "新規作成はできません",
    );
  });

  test("ADMIN_NAV_DISABLED_BADGE_LABEL", () => {
    expect(ADMIN_NAV_DISABLED_BADGE_LABEL).toBe("非公開");
  });

  test("collectMappedAdminNavFeatureModules は undefined を除外して unique 化", () => {
    expect(
      collectMappedAdminNavFeatureModules([
        "events",
        undefined,
        "events",
        "faq",
      ]),
    ).toEqual(["events", "faq"]);
  });

  test("assertAdminNavFeatureModulesAreRegistered — 未知 id は throw", () => {
    expect(() =>
      assertAdminNavFeatureModulesAreRegistered([
        "events",
        "not-a-module" as FeatureModule,
      ]),
    ).toThrow(/Unknown admin nav featureModule/);
    expect(() =>
      assertAdminNavFeatureModulesAreRegistered([...FEATURE_MODULES_LIST]),
    ).not.toThrow();
  });
});
