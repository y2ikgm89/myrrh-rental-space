"use server";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  disconnectInstagram as disconnectInstagramCommand,
  saveInstagramToken as saveInstagramTokenCommand,
} from "@/shared/domain/instagram/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
// CACHE-INVALIDATE-03: INSTAGRAM_FEED は cdn-cache-tags.ts で INSTAGRAM_FEED (CDN 側) に
// mapped され SITE_WIDE_CDN_TAGS に含まれるため全公開ページの Cache-Tag に emit される。
// raw updateTag では Cloudflare edge に伝播せず (数時間の s-maxage の間) 旧トークンで
// 取得した stale フィードが配信され続ける (トークン失効時の空表示も含む) silent stale。
// invalidateSiteWideCache 経由で updateTag (Next.js Data Cache) + queueTagPurge
// (Cloudflare CDN) + Sitemap 自動 purge を一括発火する (SSoT: .claude/rules/caching.md)。
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { instagramTokenSchema } from "@/shared/lib/validations/instagram";
import { testInstagramConnection } from "@/shared/lib/instagram";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { DomainError } from "@/shared/domain/domain-error";

function invalidateInstagramCaches(): void {
  invalidateSiteWideCache(CACHE_TAGS.INSTAGRAM_FEED);
}

export async function saveManualToken(
  token: string,
): Promise<MutationResult<{ username: string | undefined }>> {
  const parsed = instagramTokenSchema.safeParse(token);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => saveInstagramTokenCommand(parsed.data),
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}

export async function testInstagramConnectionAction(
  token: string,
): Promise<MutationResult<{ username: string | undefined }>> {
  const parsed = instagramTokenSchema.safeParse(token);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      const result = await testInstagramConnection(parsed.data);
      if (!result.success) {
        throw new DomainError(
          result.error || "接続テストに失敗しました",
          "VALIDATION",
        );
      }

      const username =
        typeof result.metadata?.["username"] === "string"
          ? result.metadata["username"]
          : undefined;

      return { username };
    },
  });
}

export async function disconnectInstagram(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      await disconnectInstagramCommand();
      return null;
    },
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}
