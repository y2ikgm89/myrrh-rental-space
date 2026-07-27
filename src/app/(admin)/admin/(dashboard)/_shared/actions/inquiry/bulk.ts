"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { emitBulkAuditRecords } from "@/admin/lib/audit";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkDeleteInquiriesCommand,
  type BulkDeleteInquiriesResult,
} from "@/shared/domain/inquiries/bulk-commands";
import {
  AuditAction,
  InquiryStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  bulkSetStatusInquiriesCommand,
  type BulkSetStatusInquiriesResult,
} from "@/shared/domain/inquiries/bulk-status-commands";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { fireAndForget } from "@/shared/lib/async-utils";
import { sendInquiryStatusNotificationToAll } from "@/shared/lib/email/inquiry-emails";
import { getInquiriesForStatusNotification } from "@/shared/domain/inquiries/email-queries";
import { ErrorCategory } from "@/shared/lib/errors";

const bulkInputSchema = z.object({
  ids: z
    .array(z.uuid({ error: "お問い合わせIDが不正です" }))
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

function invalidateInquiryCachesForIds(ids: string[]): void {
  updateTag(CACHE_TAGS.INQUIRIES);
  for (const id of [...new Set(ids)]) {
    updateTag(getCacheTag.inquiries.detail(id));
  }
}

export async function bulkDeleteInquiries(
  ids: string[],
): Promise<MutationResult<BulkDeleteInquiriesResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "delete",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkDeleteInquiriesCommand(parsed.data.ids);
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateInquiryCachesForIds(outcome.affectedIds);
      emitBulkAuditRecords({
        resource: "inquiry",
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

const bulkStatusInputSchema = z.object({
  ids: z
    .array(z.uuid({ error: "お問い合わせIDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に処理できるのは100件までです" }),
  newStatus: z.enum(InquiryStatus),
});

export async function bulkSetStatusInquiries(
  ids: string[],
  newStatus: InquiryStatus,
): Promise<MutationResult<BulkSetStatusInquiriesResult>> {
  const parsed = bulkStatusInputSchema.safeParse({ ids, newStatus });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkSetStatusInquiriesCommand(
        parsed.data.ids,
        parsed.data.newStatus,
        user.id,
      );
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateInquiryCachesForIds(outcome.affectedIds);
      emitBulkAuditRecords({
        resource: "inquiry",
        userId: outcome.actorUserId,
        records: outcome.affectedIds.map((id) => ({
          resourceId: id,
          action: AuditAction.UPDATE,
          newValue: { status: outcome.newStatus },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
      if (
        outcome.affectedIds.length > 0 &&
        (outcome.newStatus === InquiryStatus.RESOLVED ||
          outcome.newStatus === InquiryStatus.CLOSED)
      ) {
        const notifyStatus = outcome.newStatus;
        fireAndForget(
          getInquiriesForStatusNotification(outcome.affectedIds).then(
            (inquiries) =>
              sendInquiryStatusNotificationToAll(inquiries, notifyStatus),
          ),
          {
            operation: "bulkSetStatusInquiries.notify",
            category: ErrorCategory.EXTERNAL_API,
          },
        );
      }
    },
  });
}
