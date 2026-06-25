"use server";

/**
 * 顧客 Server Actions
 *
 * `useActionState` 統合経路 (`(prev, formData) => SubmissionResult`) に
 * clean break 移行。認証・権限・監査ログは `executeAdminMutationResult` SSoT
 * に委譲する。
 *
 * status / notes / soft-delete / merge 系は input ベースで残置 (form 不使用)。
 */

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { checkPermission } from "@/admin/lib/action-auth";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import {
  customerFormSchema,
  updateCustomerNotesSchema,
  updateCustomerStatusSchema,
} from "@/shared/lib/validations/customer";
import {
  createCustomer as createCustomerCommand,
  deleteCustomer as deleteCustomerCommand,
  mergeCustomerCommand,
  toggleCustomerActive as toggleCustomerActiveCommand,
  updateCustomer as updateCustomerCommand,
  updateCustomerNotes as updateCustomerNotesCommand,
  updateCustomerStatus as updateCustomerStatusCommand,
} from "@/shared/domain/customers/commands";
import { searchCustomers } from "@/shared/domain/customers/queries";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { uuidIdSchema } from "@/shared/lib/validations/params";
import { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";

const idSchema = uuidIdSchema("顧客");

/**
 * 顧客新規作成 — conform `useActionState` 統合経路。
 *
 * 成功時は `submission.reply({ resetForm: true })` で `{ initialValue: null }`
 * を返し、client 側で `router.push("/admin/customers")` にリダイレクトする。
 */
export async function createCustomer(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, customerFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "customer",
      action: "create",
      execute: async () => createCustomerCommand(data),
      afterSuccess: () => {
        updateTag(CACHE_TAGS.CUSTOMERS);
      },
      resolveAuditResourceId: (data) => data.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

/**
 * 顧客更新 — conform `useActionState` 統合経路。
 *
 * `customerId` は `Function.prototype.bind` で部分適用する想定:
 *   `useActionState(updateCustomer.bind(null, customer.id), undefined)`
 */
export async function updateCustomer(
  customerId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, customerFormSchema, async (data) => {
    const idValid = idSchema.safeParse(customerId);
    if (!idValid.success) {
      return { ok: false, error: "顧客IDが不正です" };
    }
    const result = await executeAdminMutationResult({
      resource: "customer",
      action: "update",
      resourceId: idValid.data,
      execute: async () => {
        await updateCustomerCommand(idValid.data, data);
        return null;
      },
      afterSuccess: () => {
        updateTag(CACHE_TAGS.CUSTOMERS);
        updateTag(getCacheTag.customers.detail(idValid.data));
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function updateCustomerStatus(
  id: string,
  status: CustomerStatus,
): Promise<MutationResult> {
  const parsed = updateCustomerStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: parsed.data.id,
    execute: async () => {
      await updateCustomerStatusCommand(parsed.data.id, parsed.data.status);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(parsed.data.id));
    },
  });
}

export async function updateCustomerNotes(
  id: string,
  notes: string | null,
): Promise<MutationResult> {
  const parsed = updateCustomerNotesSchema.safeParse({ id, notes });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: parsed.data.id,
    execute: async () => {
      await updateCustomerNotesCommand(parsed.data.id, parsed.data.notes);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(parsed.data.id));
    },
  });
}

export async function toggleCustomerActive(
  id: string,
): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      await toggleCustomerActiveCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validated.data));
    },
  });
}

export async function deleteCustomer(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deleteCustomerCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
    },
  });
}

export async function mergeCustomers(
  sourceId: string,
  targetId: string,
): Promise<
  MutationResult<{
    transferredReservations: number;
    transferredInquiries: number;
    transferredReviews: number;
    transferredRegistrations: number;
  }>
> {
  const sourceValid = z.uuid().safeParse(sourceId);
  const targetValid = z.uuid().safeParse(targetId);
  if (!sourceValid.success || !targetValid.success) {
    return { error: "無効な顧客IDです" };
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "delete",
    resourceId: sourceValid.data,
    execute: async () =>
      mergeCustomerCommand(sourceValid.data, targetValid.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(sourceValid.data));
      updateTag(getCacheTag.customers.detail(targetValid.data));
      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(CACHE_TAGS.REVIEWS);
      updateTag(CACHE_TAGS.EVENTS);
    },
  });
}

export async function searchCustomersAction(
  query: string,
): Promise<Awaited<ReturnType<typeof searchCustomers>>> {
  // 顧客 PII 検索は customer:read 権限必須。checkAdminAuth は認証のみで全ダッシュボード
  // ロール（customer:read を持たない EDITOR 含む）を通すため RBAC バイパスになる。
  const auth = await checkPermission("customer", "read");
  if (!auth.success) return [];
  return searchCustomers(query);
}
