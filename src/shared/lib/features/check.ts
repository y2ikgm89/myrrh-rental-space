import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { getFeatureModulesSettings } from "@/shared/domain/settings/queries/features";
import {
  FEATURE_MODULES,
  FEATURE_MODULES_LIST,
  type FeatureModule,
} from "./registry";

/**
 * 同一リクエスト内で有効化されている feature module 集合を解決する。
 *
 * 解決ロジック:
 * 1. DB の `Settings.featureModules` から explicit に true となっている module を抽出
 * 2. `FEATURE_MODULES[id].requires` の依存解決を伝播的に適用（A requires B & B OFF → A も OFF）
 *
 * fail-closed 原則: DB に key が存在しない / DB が空 / 不正値 → その module は OFF。
 * `seed.ts` と migration が全 9 module を explicit に保つことで運用上は全 ON で動作する。
 *
 * `cache()` で request 単位 memo（同一リクエスト内の page.tsx + sitemap + nav が
 * 同一値を共有、内部 `getFeatureModulesSettings` の `'use cache'` は cross-request 層）。
 */
export const getEnabledFeatures = cache(
  async (): Promise<ReadonlySet<FeatureModule>> => {
    const stored = await getFeatureModulesSettings();
    const enabled = new Set<FeatureModule>();

    for (const id of FEATURE_MODULES_LIST) {
      if (stored[id] === true) {
        enabled.add(id);
      }
    }

    // 依存解決: requires が全て enabled に含まれていなければ自身を除外
    // 9 module の小規模グラフのため fixed-point iteration で十分
    for (let pass = 0; pass < FEATURE_MODULES_LIST.length; pass++) {
      let removed = false;
      for (const id of [...enabled]) {
        const def = FEATURE_MODULES[id];
        if (def.requires?.some((req) => !enabled.has(req))) {
          enabled.delete(id);
          removed = true;
        }
      }
      if (!removed) break;
    }

    return enabled;
  },
);

/** 特定 module が有効かを判定する。 */
export async function isFeatureEnabled(
  module: FeatureModule,
): Promise<boolean> {
  const enabled = await getEnabledFeatures();
  return enabled.has(module);
}

/**
 * フィルタリング用コンテキスト（disabled module の SSoT エントリを集約）。
 *
 * sitemap / navigation / SectionRenderer / cron route handler の filter は
 * 全てこの context を経由する。`cache()` で request 単位 memo。
 *
 * - `disabledRoutes`: nav 内部リンク URL prefix 比較に使う（external link は影響なし）
 * - `disabledPageSlugs`: sitemap の `/slug` URL filter に使う
 * - `disabledSectionTypes`: SectionRenderer の早期 return / AddSectionDialog 除外に使う
 * - `disabledTemplates`: PAGE_TEMPLATES selector の除外に使う
 * - `disabledCronPaths`: cron route handler の早期 return マッチング用
 */
export interface FeatureFilterContext {
  readonly enabled: ReadonlySet<FeatureModule>;
  readonly disabledRoutes: readonly string[];
  readonly disabledPageSlugs: ReadonlySet<string>;
  readonly disabledSectionTypes: ReadonlySet<string>;
  readonly disabledTemplates: ReadonlySet<string>;
  readonly disabledCronPaths: ReadonlySet<string>;
}

export const getFeatureFilterContext = cache(
  async (): Promise<FeatureFilterContext> => {
    const enabled = await getEnabledFeatures();
    const disabledRoutes: string[] = [];
    const disabledPageSlugs = new Set<string>();
    const disabledSectionTypes = new Set<string>();
    const disabledTemplates = new Set<string>();
    const disabledCronPaths = new Set<string>();

    for (const id of FEATURE_MODULES_LIST) {
      if (enabled.has(id)) continue;
      const def = FEATURE_MODULES[id];
      disabledRoutes.push(...def.publicRoutes);
      for (const slug of def.pageSlugs) disabledPageSlugs.add(slug);
      for (const type of def.sectionTypes) disabledSectionTypes.add(type);
      for (const tpl of def.templates) disabledTemplates.add(tpl);
      for (const path of def.cronPaths) disabledCronPaths.add(path);
    }

    return {
      enabled,
      disabledRoutes,
      disabledPageSlugs,
      disabledSectionTypes,
      disabledTemplates,
      disabledCronPaths,
    };
  },
);

/** URL が disabled module の publicRoutes に hit するか判定する。 */
export function isUrlDisabled(
  url: string,
  disabledRoutes: readonly string[],
): boolean {
  return disabledRoutes.some(
    (route) => url === route || url.startsWith(`${route}/`),
  );
}

/**
 * 公開 page.tsx の冒頭で呼ぶ 1 行ガード。
 * Feature OFF なら Next.js の `notFound()` を throw して 404 page にレンダリング。
 *
 * @example
 * export default async function ContactPage() {
 *   await requireFeatureEnabled("contact");
 *   // ... existing code
 * }
 */
export async function requireFeatureEnabled(
  module: FeatureModule,
): Promise<void> {
  if (!(await isFeatureEnabled(module))) {
    notFound();
  }
}
