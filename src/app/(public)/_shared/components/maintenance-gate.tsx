import "server-only";

import type { ReactElement, ReactNode } from "react";
import { connection } from "next/server";
import {
  getMaintenanceSettings,
  getSeoSettings,
} from "@/shared/domain/settings/queries/site";
import { resolveSiteBranding } from "@/public/lib/seo/metadata-factory";
import { MaintenancePage } from "./maintenance-page";

/**
 * Maintenance Gate
 *
 * `getMaintenanceSettings()` は `'use cache' + safeFetch({fallback})` 構造のため、
 * layout 本体直配置だと build prerender 時 placeholder DATABASE_URL で fallback の
 * `{maintenanceMode: true}` (SYS-4 fail-closed) が静的シェルに永続 baking され、
 * admin の maintenance OFF 切替が Cloudflare HIT で効かなくなる可能性がある
 * （.claude/rules/caching.md 違反）。
 *
 * canonical pattern（rule caching.md）: `<Suspense>` 境界内で `await connection()` を呼ぶ async SC
 * から呼び出す → build prerender skip / runtime resume で実 DB から resolve。
 *
 * 設計:
 * - maintenance ON → `<MaintenancePage>` を直接返す（chrome 全部スキップ・現状動作と同じ）
 * - maintenance OFF → `children`（通常 chrome）を pass-through
 *
 * SSoT: memory `project_cacheable-fetch-build-prerender-canonical-2026-06-22`
 */
export async function MaintenanceGate({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactElement> {
  await connection();
  const [settings, seoSettings] = await Promise.all([
    getMaintenanceSettings(),
    getSeoSettings(),
  ]);
  if (settings.maintenanceMode) {
    const { siteName } = resolveSiteBranding(seoSettings);
    return (
      <MaintenancePage
        message={settings.maintenanceMessage}
        siteName={siteName}
      />
    );
  }
  return <>{children}</>;
}
