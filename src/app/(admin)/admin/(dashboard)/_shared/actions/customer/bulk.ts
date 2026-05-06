"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkToggleActiveCustomersCommand,
  bulkDeleteCustomersCommand,
  type BulkToggleActiveCustomersResult,
  type BulkDeleteCustomersResult,
} from "@/shared/domain/customers/bulk-commands";
import { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  bulkSetStatusCustomersCommand,
  type BulkSetStatusCustomersResult,
} from "@/shared/domain/customers/bulk-status-commands";

const bulkInputSchema = z.object({
  ids: z
    .array(z.string().uuid({ error: "顧客IDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に処理できるのは100件までです" }),
});

function invalidateCustomerCachesForIds(ids: string[]): void {
  updateTag(CACHE_TAGS.CUSTOMERS);
  for (const id of [...new Set(ids)]) {
    updateTag(getCacheTag.customers.detail(id));
  }
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

export async function bulkDeleteCustomers(
  ids: string[],
): Promise<MutationResult<BulkDeleteCustomersResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "customer",
    action: "delete",
    execute: async () => bulkDeleteCustomersCommand(parsed.data.ids),
    afterSuccess: (data) => {
      invalidateCustomerCachesForIds(data.affectedIds);
    },
  });
}

const bulkStatusInputSchema = z.object({
  ids: z
    .array(z.string().uuid({ error: "顧客IDが不正です" }))
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
