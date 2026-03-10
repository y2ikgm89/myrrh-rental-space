"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
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
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result"
import { CustomerStatus } from "@/shared/lib/validations/enums";

const idSchema = z.string().uuid({ error: "顧客IDが不正です" });

export async function createCustomer(
  input: CustomerFormInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = customerFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "create",
    execute: async () => createCustomerCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
    },
    resolveAuditResourceId: (result) => result.id,
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

export async function updateCustomer(
  id: string,
  input: CustomerFormInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = customerFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await updateCustomerCommand(validatedId.data, parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validatedId.data));
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
