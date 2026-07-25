import {
  FEATURE_MODULES,
  FEATURE_MODULES_LIST,
  type FeatureModule,
} from "./registry";

/** 機能モジュール ON/OFF 設定画面（管理 nav の tooltip リンク先） */
export const ADMIN_FEATURE_SETTINGS_HREF = "/admin/settings/features" as const;

/** Feature OFF 時に sidebar / command palette に表示する badge ラベル */
export const ADMIN_NAV_DISABLED_BADGE_LABEL = "非公開" as const;

/**
 * 管理 nav で feature OFF を示す tooltip 本文。
 * `{label}` は FEATURE_MODULES[module].label に置換される。
 *
 * Wave 2 方針: 既存レコードの確認・編集は可、新規作成は不可。
 */
export const ADMIN_NAV_DISABLED_TOOLTIP_TEMPLATE =
  "「{label}」は公開サイトでは 404 になります。管理画面ではデータの確認・編集はできますが、新規作成はできません。" as const;

export function formatAdminNavDisabledTooltip(
  featureModule: FeatureModule,
): string {
  const label = FEATURE_MODULES[featureModule].label;
  return ADMIN_NAV_DISABLED_TOOLTIP_TEMPLATE.replace("{label}", label);
}

/** nav item に featureModule が付いている場合、公開面 OFF か判定する。 */
export function isAdminNavFeaturePubliclyDisabled(
  featureModule: FeatureModule | undefined,
  enabledFeatures: ReadonlySet<FeatureModule>,
): boolean {
  if (featureModule === undefined) return false;
  return !enabledFeatures.has(featureModule);
}

/**
 * quick action / 一覧の「新規作成」導線は feature OFF 時に不可。
 * （list/view/edit は残し、create だけ封じる）
 */
export function isAdminQuickActionFeatureDisabled(
  featureModule: FeatureModule | undefined,
  enabledFeatures: ReadonlySet<FeatureModule>,
): boolean {
  return isAdminNavFeaturePubliclyDisabled(featureModule, enabledFeatures);
}

/** 管理画面の create 導線を出してよいか（feature 未 map なら常に可）。 */
export function isAdminFeatureCreateAllowed(
  featureModule: FeatureModule | undefined,
  enabledFeatures: ReadonlySet<FeatureModule>,
): boolean {
  return !isAdminQuickActionFeatureDisabled(featureModule, enabledFeatures);
}

/**
 * sidebar / command palette / quick actions に付与された featureModule 値の
 * drift gate 用集合。FEATURE_MODULES_LIST の部分集合であること。
 */
export function collectMappedAdminNavFeatureModules(
  modules: readonly (FeatureModule | undefined)[],
): FeatureModule[] {
  const unique = new Set<FeatureModule>();
  for (const featureModule of modules) {
    if (featureModule !== undefined) unique.add(featureModule);
  }
  return [...unique];
}

/** mapped featureModule ⊆ FEATURE_MODULES_LIST の検証 */
export function assertAdminNavFeatureModulesAreRegistered(
  modules: readonly FeatureModule[],
): void {
  const registered = new Set<string>(FEATURE_MODULES_LIST);
  for (const featureModule of modules) {
    if (!registered.has(featureModule)) {
      throw new Error(
        `Unknown admin nav featureModule "${featureModule}". Add it to FEATURE_MODULES_LIST first.`,
      );
    }
  }
}
