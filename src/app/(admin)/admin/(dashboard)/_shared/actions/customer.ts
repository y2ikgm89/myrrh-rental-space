"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  customerFormSchema,
  updateCustomerNotesSchema,
  updateCustomerStatusSchema,
  type CustomerFormInput,
} from "@/admin/lib/validations/customer";
import {
  createCustomer as createCustomerCommand,
  deleteCustomer as deleteCustomerCommand,
  toggleCustomerActive as toggleCustomerActiveCommand,
  updateCustomer as updateCustomerCommand,
  updateCustomerNotes as updateCustomerNotesCommand,
  updateCustomerStatus as updateCustomerStatusCommand,
} from "@/shared/domain/customers/commands";
import { createValidationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { CustomerStatus } from "@/shared/lib/validations/enums";

const idSchema = z.string().uuid({ error: "顧客IDが不正です" });

export async function createCustomer(
  input: CustomerFormInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = customerFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "customer",
    action: "create",
    execute: async () => createCustomerCommand(parsed.data),
    success: (result) => createSuccess("顧客を作成しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateCustomerStatus(
  id: string,
  status: CustomerStatus,
): Promise<ActionResult<void>> {
  const parsed = updateCustomerStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "customer",
    action: "update",
    resourceId: parsed.data.id,
    execute: async () => {
      await updateCustomerStatusCommand(parsed.data.id, parsed.data.status);
    },
    success: () => createSuccess("ステータスを更新しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(parsed.data.id));
    },
  });
}

export async function updateCustomerNotes(
  id: string,
  notes: string | null,
): Promise<ActionResult<void>> {
  const parsed = updateCustomerNotesSchema.safeParse({ id, notes });
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "customer",
    action: "update",
    resourceId: parsed.data.id,
    execute: async () => {
      await updateCustomerNotesCommand(parsed.data.id, parsed.data.notes);
    },
    success: () => createSuccess("メモを更新しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(parsed.data.id));
    },
  });
}

export async function toggleCustomerActive(
  id: string,
): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "customer",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      await toggleCustomerActiveCommand(validated.data);
    },
    success: () => createSuccess("アクティブ状態を変更しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validated.data));
    },
  });
}

export async function updateCustomer(
  id: string,
  input: CustomerFormInput,
): Promise<ActionResult<void>> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationError(validatedId.error);
  }

  const parsed = customerFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "customer",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await updateCustomerCommand(validatedId.data, parsed.data);
    },
    success: () => createSuccess("顧客情報を更新しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validatedId.data));
    },
  });
}

export async function deleteCustomer(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "customer",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deleteCustomerCommand(validated.data);
    },
    success: () => createSuccess("顧客を削除しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
    },
  });
}
