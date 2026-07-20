"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { emitBulkAuditRecords } from "@/admin/lib/audit";
import { ANONYMIZED_CUSTOMER_FIELDS } from "@/admin/actions/customer";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkToggleActiveCustomersCommand,
  bulkAnonymizeCustomersCommand,
  type BulkToggleActiveCustomersResult,
  type BulkAnonymizeCustomersResult,
} from "@/shared/domain/customers/bulk-commands";
import type { AnonymizeCustomerReason } from "@/shared/domain/customers/commands";
import { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  bulkSetStatusCustomersCommand,
  type BulkSetStatusCustomersResult,
} from "@/shared/domain/customers/bulk-status-commands";

const bulkInputSchema = z.object({
  ids: z
    .array(z.uuid({ error: "顧客IDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に処理できるのは100件までです" })
    .refine((ids) => new Set(ids).size === ids.length, {
      error: "重複した顧客IDが含まれています",
    }),
});

const bulkAnonymizeInputSchema = bulkInputSchema.extend({
  reason: z.enum(
    ["customer-requested", "admin-purge", "data-retention"] as const,
    { error: "匿名化理由が不正です" },
  ),
});

function invalidateCustomerCachesForIds(ids: string[]): void {
  updateTag(CACHE_TAGS.CUSTOMERS);
  for (const id of ids) {
    updateTag(getCacheTag.customers.detail(id));
  }
}

/**
 * RESEND-AUDIT M7: anonymize 系 (bulk 版) の cache invalidation。
 * customer 通常の tag に加えて SUPPRESSED_EMAILS も invalidate する
 * (suppressedEmailHash が書き込まれる可能性があるため、getSuppressedEmailSet
 * の cache を stale で返し続けさせない)。
 */
function invalidateCustomerCachesForAnonymize(ids: string[]): void {
  invalidateCustomerCachesForIds(ids);
  updateTag(CACHE_TAGS.SUPPRESSED_EMAILS);
}

/**
 * Shared metadata shape for bulk-customer audit records — the request context
 * (ip / userAgent) is captured once at execute() time and shared across the
 * per-id records so all rows within one bulk operation carry the same forensic
 * headers. `channel: "admin"` mirrors the SSoT used by
 * applyCancellationSideEffects for reservation cancels.
 */
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

export async function bulkToggleActiveCustomers(
  ids: string[],
  isActive: boolean,
): Promise<MutationResult<BulkToggleActiveCustomersResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkToggleActiveCustomersCommand(
        parsed.data.ids,
        isActive,
      );
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateCustomerCachesForIds(outcome.affectedIds);
      emitBulkAuditRecords({
        resource: "customer.isActive",
        userId: outcome.actorUserId,
        records: outcome.affectedIds.map((id) => ({
          resourceId: id,
          action: AuditAction.UPDATE,
          newValue: { isActive: outcome.isActive },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
    },
  });
}

/**
 * STATE-03: 複数顧客を一括匿名化する Server Action。
 *
 * 決済歴のある顧客は物理削除できないため、旧 `bulkDeleteCustomers` は
 * `bulkAnonymizeCustomers` に置換された (破壊的変更)。RBAC は
 * `resource: "customer", action: "delete"` を維持。
 *
 * per-id audit は `resource: "customer.anonymization"` で発行し、
 * 匿名化理由 / anonymizedAt / hadUserId / preservedSuppression /
 * anonymizedFields を record する (`anonymizeCustomer` 単発版と同型)。
 */
export async function bulkAnonymizeCustomers(
  ids: string[],
  reason: AnonymizeCustomerReason,
): Promise<MutationResult<BulkAnonymizeCustomersResult>> {
  const parsed = bulkAnonymizeInputSchema.safeParse({ ids, reason });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "customer",
    action: "delete",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkAnonymizeCustomersCommand(
        parsed.data.ids,
        parsed.data.reason,
      );
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateCustomerCachesForAnonymize(outcome.affectedIds);
      emitBulkAuditRecords({
        resource: "customer.anonymization",
        userId: outcome.actorUserId,
        records: outcome.affected.map((a) => ({
          resourceId: a.id,
          action: AuditAction.UPDATE,
          newValue: {
            reason: a.reason,
            anonymizedAt: a.anonymizedAt.toISOString(),
            hadUserId: a.hadUserId,
            preservedSuppression: a.preservedSuppression,
            anonymizedFields: ANONYMIZED_CUSTOMER_FIELDS,
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

const bulkStatusInputSchema = z.object({
  ids: z
    .array(z.uuid({ error: "顧客IDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に処理できるのは100件までです" }),
  newStatus: z.enum(CustomerStatus),
});

export async function bulkSetStatusCustomers(
  ids: string[],
  newStatus: CustomerStatus,
): Promise<MutationResult<BulkSetStatusCustomersResult>> {
  const parsed = bulkStatusInputSchema.safeParse({ ids, newStatus });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkSetStatusCustomersCommand(
        parsed.data.ids,
        parsed.data.newStatus,
      );
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateCustomerCachesForIds(outcome.affectedIds);
      emitBulkAuditRecords({
        resource: "customer.status",
        userId: outcome.actorUserId,
        records: outcome.affected.map((a) => ({
          resourceId: a.id,
          action: AuditAction.UPDATE,
          oldValue: { status: a.previousStatus },
          newValue: { status: outcome.newStatus },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
    },
  });
}
