"use server";

import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { emitBulkAuditRecords } from "@/admin/lib/audit";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import {
  AuditAction,
  PostStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkTogglePublishedCommand,
  bulkDeletePostsCommand,
  type BulkTogglePublishedPostsResult,
  type BulkDeletePostsResult,
} from "@/shared/domain/posts/bulk-commands";
import {
  invalidatePostCollectionCaches,
  purgePostArchive,
} from "./cache-helpers";

const bulkIdsSchema = z
  .array(z.uuid({ error: "投稿IDが不正です" }))
  .min(1, { error: "1件以上選択してください" });

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

export async function bulkTogglePostPublished(
  ids: string[],
  publish: boolean,
): Promise<MutationResult<BulkTogglePublishedPostsResult>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "publish",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkTogglePublishedCommand(parsed.data, publish);
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: async (outcome) => {
      await invalidatePostCollectionCaches();
      await purgePostArchive();
      emitBulkAuditRecords({
        resource: "post",
        userId: outcome.actorUserId,
        records: outcome.affectedIds.map((id) => ({
          resourceId: id,
          action: AuditAction.PUBLISH,
          newValue: {
            status: outcome.isPublished
              ? PostStatus.PUBLISHED
              : PostStatus.DRAFT,
          },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
    },
  });
}

export async function bulkDeletePosts(
  ids: string[],
): Promise<MutationResult<BulkDeletePostsResult>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "delete",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkDeletePostsCommand(parsed.data);
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: async (outcome) => {
      await invalidatePostCollectionCaches();
      await purgePostArchive();
      emitBulkAuditRecords({
        resource: "post",
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
