/**
 * 公開サイト maintenance mode の fail-closed ガード (SYS-2 SSoT)。
 *
 * HTML gate (`MaintenanceGate`) に加え、Server Action / 公開 mutating API の
 * 境界で `maintenanceMode === true` を拒否する。DB 障害時は
 * `getMaintenanceSettings` が throw するため、ここでは catch して
 * maintenance ON 扱いとし、状態不明時も書込みを止める (SYS-4)。
 * 失敗結果は Data Cache に載せない（クエリ側は criticalFetch）。
 *
 * ## Allowlist — maintenance ON でも動作継続
 *
 * - Admin surface (`APP_SURFACE=admin`) — 別 Cloud Run サービス。本モジュール対象外
 * - `/api/webhooks/*` — Stripe / SwitchBot / Resend / Google Calendar 等 ops webhook
 * - `/api/cron/*` — 予約期限・リマインダー・データ保持等バッチ
 * - `/api/live`, `/api/health` — 監視プローブ
 * - `signOutCustomerAction` — サスペンド顧客のセッション破棄 (cookie 削除のみ)
 * - Better Auth `POST .../sign-out` — 同上
 * - 公開 read-only Server Actions — 空き照会・料金プレビュー (`availability.ts`,
 *   `fetchReservationPricingPreview`)
 * - 領収書 PDF ダウンロード — 既存予約の read 経路 (新規書込みではない)
 */

import "server-only";

import type { NextResponse } from "next/server";
import { DomainError } from "@/shared/domain/domain-error";
import { getMaintenanceSettings } from "@/shared/domain/settings/queries/site";
import {
  createMutationError,
  type MutationError,
} from "@/shared/lib/mutation-result";
import { jsonError } from "@/shared/lib/route-responses";

export const PUBLIC_MAINTENANCE_BLOCKED_MESSAGE =
  "只今メンテナンス中のため、操作を受け付けておりません。しばらくお待ちください。";

export async function isPublicSiteInMaintenance(): Promise<boolean> {
  try {
    const settings = await getMaintenanceSettings();
    return settings.maintenanceMode;
  } catch {
    // SYS-4: 状態を確定できないときは fail-closed（書込み拒否）。
    // この fallback は call site のみ — Data Cache には載せない。
    return true;
  }
}

export async function assertPublicSiteWritable(): Promise<void> {
  if (await isPublicSiteInMaintenance()) {
    throw new DomainError(PUBLIC_MAINTENANCE_BLOCKED_MESSAGE, "FORBIDDEN");
  }
}

export async function checkPublicSiteWritable(): Promise<
  { readonly ok: true } | { readonly ok: false; readonly error: string }
> {
  if (await isPublicSiteInMaintenance()) {
    return { ok: false, error: PUBLIC_MAINTENANCE_BLOCKED_MESSAGE };
  }
  return { ok: true };
}

export async function getPublicMaintenanceBlockMutation(): Promise<MutationError | null> {
  if (await isPublicSiteInMaintenance()) {
    return createMutationError(
      PUBLIC_MAINTENANCE_BLOCKED_MESSAGE,
      undefined,
      "MAINTENANCE",
    );
  }
  return null;
}

export async function publicMaintenanceJsonResponse(): Promise<
  NextResponse<{ error: string }>
> {
  return jsonError(PUBLIC_MAINTENANCE_BLOCKED_MESSAGE, 503);
}

export function isCustomerAuthSignOutPath(pathname: string): boolean {
  return /\/sign-out\/?$/u.test(pathname);
}
