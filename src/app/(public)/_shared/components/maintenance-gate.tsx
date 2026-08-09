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
 * `getMaintenanceSettings()` は `'use cache' + criticalFetch`。DB 失敗は throw し
 * Data Cache に載せない。layout 本体直配置だと build prerender 時に失敗しうるため、
 * canonical pattern: `<Suspense>` 境界内で `await connection()` を
 * 呼ぶ async SC から呼び出す → build prerender skip / runtime resume で実 DB から resolve。
 *
 * SYS-4 fail-closed: 取得失敗時は call site で maintenance ON 扱い（キャッシュ外）。
 *
 * 設計:
 * - maintenance ON（または取得失敗）→ `<MaintenancePage>`（chrome 全部スキップ）
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
  const seoSettings = await getSeoSettings();
  let maintenanceMode = true;
  let maintenanceMessage: string | null = null;
  try {
    const settings = await getMaintenanceSettings();
    maintenanceMode = settings.maintenanceMode;
    maintenanceMessage = settings.maintenanceMessage;
  } catch {
    // SYS-4: 状態不明時は fail-closed。fallback はここだけ — Data Cache 非経由。
    maintenanceMode = true;
    maintenanceMessage = null;
  }
  if (maintenanceMode) {
    const { siteName } = resolveSiteBranding(seoSettings);
    return <MaintenancePage message={maintenanceMessage} siteName={siteName} />;
  }
  return <>{children}</>;
}
