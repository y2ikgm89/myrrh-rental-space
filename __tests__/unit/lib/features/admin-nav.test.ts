import { describe, expect, test } from "bun:test";
import {
  ADMIN_FEATURE_SETTINGS_HREF,
  ADMIN_NAV_DISABLED_BADGE_LABEL,
  ADMIN_NAV_DISABLED_TOOLTIP_TEMPLATE,
  assertAdminNavFeatureModulesAreRegistered,
  collectMappedAdminNavFeatureModules,
  formatAdminNavDisabledTooltip,
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
