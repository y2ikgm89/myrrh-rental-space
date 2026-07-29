"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { emitBulkAuditRecords } from "@/admin/lib/audit";
import { ANONYMIZED_CUSTOMER_FIELDS } from "@/admin/actions/customer";
import {
  checkActionRateLimit,
  createValidationMutationError,
} from "@/shared/lib/action-helpers";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { createMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { sendCustomerBroadcast } from "@/shared/domain/email/dispatch";
import { customerBroadcastRateLimiter } from "@/shared/lib/rate-limit";
import {
  bulkToggleActiveCustomersCommand,
  bulkAnonymizeCustomersCommand,
  type BulkToggleActiveCustomersResult,
  type BulkAnonymizeCustomersResult,
} from "@/shared/domain/customers/bulk-commands";
import type { AnonymizeCustomerReason } from "@/shared/domain/customers/customer-lifecycle-commands";
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
            anonymizedInquiryIds: a.anonymizedInquiryIds,
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

const broadcastCustomersSchema = z.object({
  customerIds: z
    .array(z.uuid({ error: "顧客IDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に送信できるのは100件までです" })
    .refine((ids) => new Set(ids).size === ids.length, {
      error: "重複した顧客IDが含まれています",
    }),
  subject: z
    .string({ error: "件名を入力してください" })
    .trim()
    .min(1, "件名を入力してください")
    .max(200, "件名は200文字以内で入力してください"),
  body: z
    .string({ error: "本文を入力してください" })
    .trim()
    .min(1, "本文を入力してください")
    .max(5000, "本文は5000文字以内で入力してください"),
});

/**
 * Phase 4 顧客管理強化 (Task 10): 選択顧客への一括メール送信 Server Action。
 *
 * `broadcastEventAction`（event-broadcast.ts、T12）と同じ設計判断を踏襲する:
 * - rate limit は `customerBroadcastRateLimiter` を「管理操作単位」の固定トークン
 *   (`"customer-broadcast"`) でチェックする。管理者 IP は変わり得るため IP 単位でなく
 *   操作単位の第二防壁で十分 (`executeAdminMutationResult` の RBAC + AuditLog と多層防御)。
 * - AuditLog は `executeAdminMutationResult` 内の自動 `logAction`
 *   (resource:customer action:update) に任せる。件名/本文は個人情報増加を避けるため
 *   metadata に含めない (Resend dashboard 側で確認する運用)。
 * - `broadcastNonce` は execute ごとに `randomUUID()` で生成し、Resend の
 *   idempotencyKey が重複しないようにする。
 *
 * customerIds の重複は `sendCustomerBroadcast` の excluded 件数計算
 * (`customerIds.length - recipients.length`) を壊すため、既存の
 * `bulkInputSchema` と同じ `.refine` で境界で弾く。
 */
export async function broadcastCustomersAction(
  customerIds: string[],
  subject: string,
  body: string,
): Promise<MutationResult<{ sent: number; excluded: number }>> {
  const parsed = broadcastCustomersSchema.safeParse({
    customerIds,
    subject,
    body,
  });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  const rateLimit = await checkActionRateLimit({
    check: (_token) => customerBroadcastRateLimiter.check("customer-broadcast"),
  });
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    execute: async () => {
      const broadcastNonce = randomUUID();
      const result = await sendCustomerBroadcast(parsed.data.customerIds, {
        subject: parsed.data.subject,
        body: parsed.data.body,
        broadcastNonce,
      });
      return { sent: result.sent, excluded: result.excluded };
    },
    // cache invalidation は不要 (customer レコード自体は変わらない)。
  });
}
