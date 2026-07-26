import "server-only";

import { notFound } from "next/navigation";
import { DomainError } from "@/shared/domain/domain-error";
import { getFeatureModulesSettings } from "@/shared/domain/settings/queries/features";
import {
  FEATURE_MODULES,
  FEATURE_MODULES_LIST,
  type FeatureModule,
} from "./registry";

/**
 * 有効化されている feature module 集合を解決する。
 *
 * 解決ロジック:
 * 1. DB の `Settings.featureModules` から explicit に true となっている module を抽出
 * 2. `FEATURE_MODULES[id].requires` の依存解決を伝播的に適用（A requires B & B OFF → A も OFF）
 *
 * fail-closed 原則: DB 取得成功時に key が存在しない / DB が空 / 不正値 → その module は OFF。
 * DB 取得失敗は `getFeatureModulesSettings` が throw（Data Cache に全 OFF を載せない）。
 * `seed.ts` と migration が全 11 module を explicit に保つことで運用上は全 ON で動作する。
 *
 * 内部の `getFeatureModulesSettings` が成功結果のみ `'use cache'` するため、
 * 本関数は薄い解決ロジック層（メモ化不要）。
 */
export async function getEnabledFeatures(): Promise<
  ReadonlySet<FeatureModule>
> {
  const stored = await getFeatureModulesSettings();
  const enabled = new Set<FeatureModule>();

  for (const id of FEATURE_MODULES_LIST) {
    if (stored[id] === true) {
      enabled.add(id);
    }
  }

  // 依存解決: requires が全て enabled に含まれていなければ自身を除外
  // 11 module の小規模グラフのため fixed-point iteration で十分
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
}

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
 * sitemap / navigation / SectionRenderer の filter は全てこの context を経由する。
 *
 * - `disabledRoutes`: nav URL の path prefix 比較に使う（isExternal 含む全 URL。
 *   http(s) 絶対 URL は `isUrlDisabled` が pathname を抽出して判定する）
 * - `disabledPageSlugs`: sitemap の `/slug` URL filter に使う
 * - `disabledSectionTypes`: SectionRenderer の早期 return / AddSectionDialog 除外に使う
 *
 * ## registry.cronPaths / registry.templates は metadata-only
 *
 * cron route handler は `isFeatureEnabled(id)` を各 route が直接呼ぶ (add-cron-job
 * skill 契約)。`FEATURE_MODULES[id].cronPaths` は「その module に紐づく cron route
 * の運用停止範囲を示す doc」であって、runtime gate ではない (registry.test.ts の
 * drift gate が「isFeatureEnabled 引数 ↔ cronPaths 実体」の双方向対応を強制する)。
 * templates も同様に PAGE_TEMPLATES selector 側は現状 registry を参照しない
 * (metadata-only)。以前は `disabledTemplates` / `disabledCronPaths` を Set として
 * 集約していたが consumer 皆無で SSoT drift の温床になっていたため削除 (WIRE-04)。
 */
export interface FeatureFilterContext {
  readonly enabled: ReadonlySet<FeatureModule>;
  readonly disabledRoutes: readonly string[];
  readonly disabledPageSlugs: ReadonlySet<string>;
  readonly disabledSectionTypes: ReadonlySet<string>;
}

export async function getFeatureFilterContext(): Promise<FeatureFilterContext> {
  const enabled = await getEnabledFeatures();
  const disabledRoutes: string[] = [];
  const disabledPageSlugs = new Set<string>();
  const disabledSectionTypes = new Set<string>();

  for (const id of FEATURE_MODULES_LIST) {
    if (enabled.has(id)) continue;
    const def = FEATURE_MODULES[id];
    disabledRoutes.push(...def.publicRoutes);
    for (const slug of def.pageSlugs) disabledPageSlugs.add(slug);
    for (const type of def.sectionTypes) disabledSectionTypes.add(type);
  }

  return {
    enabled,
    disabledRoutes,
    disabledPageSlugs,
    disabledSectionTypes,
  };
}

/**
 * 比較用 pathname を抽出する。
 *
 * - path-only (`/events?x=1#y`) → `/events`
 * - http(s) 絶対 URL → `URL.pathname`（host は無視。nav isExternal clean-break）
 * - mailto / tel / 不正文字列 → そのまま（disabled route には通常非該当）
 */
function toComparablePathname(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("/")) {
    const withoutHash = trimmed.split("#")[0] ?? trimmed;
    const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
    return withoutQuery;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.pathname;
    }
  } catch {
    // fall through — 非 URL はそのまま比較
  }

  return trimmed;
}

/** URL が disabled module の publicRoutes に hit するか判定する。 */
export function isUrlDisabled(
  url: string,
  disabledRoutes: readonly string[],
): boolean {
  const pathname = toComparablePathname(url);
  return disabledRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
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

/** 管理画面 create Server Action が feature OFF 時に返すメッセージ（UI tooltip と整合）。 */
export const ADMIN_FEATURE_CREATE_FORBIDDEN_MESSAGE =
  "この機能は公開面で無効のため新規作成できません" as const;

/**
 * 管理画面の新規作成 Server Action 用ガード。
 *
 * 公開 page の `requireFeatureEnabled` (404) に対称し、直接 action 呼び出しを
 * fail-closed にする。`executeAdminMutationResult` が DomainError を
 * MutationError に変換するため、conform フォームにもエラーが返る。
 */
export async function assertAdminFeatureCreateAllowed(
  module: FeatureModule,
): Promise<void> {
  if (!(await isFeatureEnabled(module))) {
    throw new DomainError(ADMIN_FEATURE_CREATE_FORBIDDEN_MESSAGE, "FORBIDDEN");
  }
}
