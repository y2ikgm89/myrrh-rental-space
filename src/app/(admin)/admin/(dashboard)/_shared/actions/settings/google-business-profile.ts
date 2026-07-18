"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { checkPermission } from "@/admin/lib/action-auth";
import {
  syncLocationToGbpCommand,
  toggleLocationGbpSyncCommand,
} from "@/shared/domain/locations/gbp-sync-commands";
// CACHE-INVALIDATE-01 / CACHE-DRIFT-SETTLE: LOCATIONS tag は CDN Cache-Tag に emit
// されるため helper 経由必須 (詳細は location.ts の同 finding コメント参照)。
// INTEGRATION_SETTINGS は NEXTJS_TAG_TO_CDN_TAG 上「type-cleanliness のためだけの
// mapping」で、実 surface は admin-only (private,no-store)。CDN 経路に露出しない
// ため skipCdnPurge:true を渡す — local/no-raw-updatetag-for-cdn-mapped-cache-tag
// drift gate を通過させるための helper 経由。
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { serverEnv } from "@/shared/lib/env/server";
import {
  clearGbpAuthState,
  getGbpAuthorizeUrl,
  getGbpAuthState,
  revokeGbpToken,
  GBP_OAUTH_STATE_COOKIE,
  GBP_OAUTH_STATE_COOKIE_MAX_AGE_SECONDS,
} from "@/shared/lib/google-business-profile";
import type { GbpSyncResult } from "@/shared/lib/google-business-profile";
import type { ToggleLocationGbpSyncResult } from "@/shared/domain/locations/gbp-sync-commands";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";

/**
 * GBP OAuth フローを開始する。
 *
 * CSRF 対策の state を生成 → httpOnly cookie に保存 → state 付き authorize URL へ redirect する。
 * Instagram OAuth `/api/instagram/oauth/authorize` と同パターンの公式 OAuth 2.0 state 検証。
 *
 * `redirect()` は throw する Next.js API のため try/catch で握り潰せない。
 * `executeAdminMutationResult` を経由せず、OAuth redirect 前に settings:manage を直接確認する。
 */
export async function initiateGbpAuth(): Promise<void> {
  const auth = await checkPermission("settings", "manage");
  if (!auth.success) {
    redirect("/admin/settings/integrations?gbp_error=forbidden");
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(GBP_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: GBP_OAUTH_STATE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });

  const url = getGbpAuthorizeUrl(state);
  redirect(toAppRoute(url));
}

/**
 * GBP 認証情報を破棄する。
 *
 * Google 側で refresh token を revoke し、Settings から認証情報を削除する。
 */
export async function revokeGbpAuth(): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      const state = await getGbpAuthState();
      if (state) {
        await revokeGbpToken(state.refreshToken);
      }
      await clearGbpAuthState();
      return null;
    },
    afterSuccess: () => {
      invalidateSiteWideCache(CACHE_TAGS.INTEGRATION_SETTINGS, {
        skipCdnPurge: true,
      });
    },
  });
}

/**
 * 指定された拠点を GBP に手動同期する。
 */
export async function triggerGbpSync(
  locationId: string,
): Promise<MutationResult<GbpSyncResult>> {
  return executeAdminMutationResult({
    resource: "location",
    action: "update",
    resourceId: locationId,
    execute: () => syncLocationToGbpCommand({ locationId }),
    afterSuccess: () => {
      invalidateSiteWideCache(CACHE_TAGS.LOCATIONS);
    },
  });
}

/**
 * 拠点単位の GBP 同期トグルを更新する。
 */
export async function toggleLocationGbpSync(
  locationId: string,
  enabled: boolean,
): Promise<MutationResult<ToggleLocationGbpSyncResult>> {
  return executeAdminMutationResult({
    resource: "location",
    action: "update",
    resourceId: locationId,
    execute: () => toggleLocationGbpSyncCommand({ locationId, enabled }),
    afterSuccess: () => {
      invalidateSiteWideCache(CACHE_TAGS.LOCATIONS);
    },
  });
}
