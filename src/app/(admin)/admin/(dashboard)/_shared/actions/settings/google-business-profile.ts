"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  syncLocationToGbpCommand,
  toggleLocationGbpSyncCommand,
} from "@/shared/domain/locations/gbp-sync-commands";
import { verifyAdminSession } from "@/shared/lib/admin-auth";
import { CACHE_TAGS } from "@/shared/lib/constants";
import {
  clearGbpAuthState,
  getGbpAuthorizeUrl,
  getGbpAuthState,
  revokeGbpToken,
} from "@/shared/lib/google-business-profile";
import type { GbpSyncResult } from "@/shared/lib/google-business-profile";
import type { ToggleLocationGbpSyncResult } from "@/shared/domain/locations/gbp-sync-commands";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";

/**
 * GBP OAuth フローを開始する。
 *
 * 認証 URL を組み立てて Google の同意画面へ redirect する。
 * `redirect()` は throw する Next.js API のため try/catch で握り潰せない。
 * `executeAdminMutationResult` を経由せず `verifyAdminSession()` で直接認証する。
 */
export async function initiateGbpAuth(): Promise<void> {
  await verifyAdminSession();
  const url = getGbpAuthorizeUrl("");
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
    action: "update",
    execute: async () => {
      const state = await getGbpAuthState();
      if (state) {
        await revokeGbpToken(state.refreshToken);
      }
      await clearGbpAuthState();
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INTEGRATION_SETTINGS);
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
      updateTag(CACHE_TAGS.LOCATIONS);
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
      updateTag(CACHE_TAGS.LOCATIONS);
    },
  });
}
