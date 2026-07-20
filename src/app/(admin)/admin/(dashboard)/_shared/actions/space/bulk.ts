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
  bulkTogglePublishedSpacesCommand,
  bulkDeleteSpacesCommand,
  type AffectedSpace,
  type BulkPublishResult,
  type BulkDeleteResult,
} from "@/shared/domain/spaces/bulk-commands";

const bulkInputSchema = z.object({
  ids: z
    .array(z.uuid({ error: "スペースIDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に処理できるのは100件までです" }),
});

function invalidateSpaceCachesForTargets(
  targets: ReadonlyArray<AffectedSpace>,
): void {
  invalidateSiteWideCache([
    CACHE_TAGS.SPACES,
    CACHE_TAGS.SPACE_CATEGORIES,
    CACHE_TAGS.LOCATIONS,
    CACHE_TAGS.REVIEWS,
  ]);

  const seenIds = new Set<string>();
  for (const t of targets) {
    if (seenIds.has(t.id)) continue;
    seenIds.add(t.id);
    updateTag(getCacheTag.reviews.space(t.id));
    updateTag(getCacheTag.reviews.stats(t.id));
  }

  const paths = [...new Set(targets.map((t) => `/spaces/${t.slug}`))];
  if (paths.length > 0) {
    void firePurgeAsync(() => purgeCloudflareDetailUrls(paths), {
      operation: "invalidateSpaceCachesForTargets.detailUrlPurge",
      urls: paths,
    });
  }

  purgeMarketingHomeTag();
}

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

export async function bulkTogglePublishedSpaces(
  ids: string[],
  publish: boolean,
): Promise<MutationResult<BulkPublishResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "publish",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkTogglePublishedSpacesCommand(
        parsed.data.ids,
        publish,
      );
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateSpaceCachesForTargets(outcome.affected);
      emitBulkAuditRecords({
        resource: "space.publish",
        userId: outcome.actorUserId,
        records: outcome.affected.map((a) => ({
          resourceId: a.id,
          action: AuditAction.UPDATE,
          newValue: { isPublished: outcome.isPublished, slug: a.slug },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
    },
  });
}

export async function bulkDeleteSpaces(
  ids: string[],
): Promise<MutationResult<BulkDeleteResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "delete",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkDeleteSpacesCommand(parsed.data.ids);
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateSpaceCachesForTargets(outcome.affected);
      emitBulkAuditRecords({
        resource: "space",
        userId: outcome.actorUserId,
        records: outcome.affected.map((a) => ({
          resourceId: a.id,
          action: AuditAction.DELETE,
          oldValue: { slug: a.slug, isActive: true },
          newValue: { isActive: false, isPublished: false, publishedAt: null },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
    },
  });
}
