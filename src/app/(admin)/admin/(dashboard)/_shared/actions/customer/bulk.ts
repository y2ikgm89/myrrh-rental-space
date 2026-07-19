"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
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

export async function bulkToggleActiveCustomers(
  ids: string[],
  isActive: boolean,
): Promise<MutationResult<BulkToggleActiveCustomersResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    execute: async () =>
      bulkToggleActiveCustomersCommand(parsed.data.ids, isActive),
    afterSuccess: (data) => {
      invalidateCustomerCachesForIds(data.affectedIds);
    },
  });
}

/**
 * STATE-03: 複数顧客を一括匿名化する Server Action。
 *
 * 決済歴のある顧客は物理削除できないため、旧 `bulkDeleteCustomers` は
 * `bulkAnonymizeCustomers` に置換された (破壊的変更)。RBAC は
 * `resource: "customer", action: "delete"` を維持。
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
    execute: async () =>
      bulkAnonymizeCustomersCommand(parsed.data.ids, parsed.data.reason),
    afterSuccess: (data) => {
      invalidateCustomerCachesForAnonymize(data.affectedIds);
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
    execute: async () =>
      bulkSetStatusCustomersCommand(parsed.data.ids, parsed.data.newStatus),
    afterSuccess: (data) => {
      invalidateCustomerCachesForIds(data.affectedIds);
    },
  });
}
