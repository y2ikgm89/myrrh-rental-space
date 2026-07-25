"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { emitBulkAuditRecords } from "@/admin/lib/audit";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { purgeCloudflareDetailUrls } from "@/shared/lib/cloudflare";
import {
  invalidateSiteWideCache,
  purgeMarketingHomeTag,
  firePurgeAsync,
} from "@/shared/lib/cache";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkTogglePublishedNewsCommand,
  bulkDeleteNewsCommand,
  type BulkPublishNewsResult,
  type BulkDeleteNewsResult,
} from "@/shared/domain/news/bulk-commands";

const bulkInputSchema = z.object({
  ids: z
    .array(z.uuid({ error: "お知らせIDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に処理できるのは100件までです" }),
});

function buildBulkAuditMetadata(args: {
  ip: string | null;
  userAgent: string | null;
}): Record<string, unknown> {
  return {
    channel: "admin",
    ...(args.ip !== null && { ip: args.ip }),
    ...(args.userAgent !== null && { userAgent: args.userAgent }),
  };
}

function invalidateNewsCachesForSlugs(slugs: string[]): void {
  const uniqueSlugs = [...new Set(slugs)];
  for (const slug of uniqueSlugs) {
    updateTag(getCacheTag.news.detail(slug));
  }
  const paths = uniqueSlugs.map((s) => `/news/${s}`);
  if (paths.length > 0) {
    void firePurgeAsync(() => purgeCloudflareDetailUrls(paths), {
      operation: "purgeNewsDetailUrls.bulk",
      urls: paths,
    });
  }
  invalidateSiteWideCache([CACHE_TAGS.NEWS, CACHE_TAGS.SIDEBAR_DATA]);
  purgeMarketingHomeTag();
}

export async function bulkTogglePublishedNews(
  ids: string[],
  publish: boolean,
): Promise<MutationResult<BulkPublishNewsResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "news",
    action: "publish",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkTogglePublishedNewsCommand(
        parsed.data.ids,
        publish,
      );
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateNewsCachesForSlugs(outcome.affectedSlugs);
      emitBulkAuditRecords({
        resource: "news",
        userId: outcome.actorUserId,
        records: outcome.affectedIds.map((id) => ({
          resourceId: id,
          action: AuditAction.PUBLISH,
          newValue: { isPublished: outcome.isPublished },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
    },
  });
}

export async function bulkDeleteNews(
  ids: string[],
): Promise<MutationResult<BulkDeleteNewsResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "news",
    action: "delete",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkDeleteNewsCommand(parsed.data.ids);
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateNewsCachesForSlugs(outcome.affectedSlugs);
      emitBulkAuditRecords({
        resource: "news",
        userId: outcome.actorUserId,
        records: outcome.affectedIds.map((id) => ({
          resourceId: id,
          action: AuditAction.DELETE,
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
    },
  });
}
