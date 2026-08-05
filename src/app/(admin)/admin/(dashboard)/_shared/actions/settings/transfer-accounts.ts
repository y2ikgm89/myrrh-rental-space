"use server";

import type { SubmissionResult } from "@conform-to/react";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
import {
  createTransferAccountCommand,
  deleteTransferAccountCommand,
  toggleTransferAccountActiveCommand,
  updateTransferAccountCommand,
  updateTransferGuidanceCommand,
} from "@/shared/domain/settings/transfer-account-commands";
import {
  transferAccountFormSchema,
  transferGuidanceFormSchema,
} from "@/shared/lib/validations/transfer-account";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const transferAccountIdSchema = uuidIdSchema("振込先口座");

export async function createTransferAccount(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    transferAccountFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "manage",
        execute: async () =>
          createTransferAccountCommand({
            label: data.label,
            bankName: data.bankName,
            branchName: data.branchName,
            accountType: data.accountType,
            accountNumber: data.accountNumber,
            accountHolderName: data.accountHolderName,
            note: data.note ?? null,
            sortOrder: data.sortOrder,
            isActive: data.isActive,
          }),
        afterSuccess: () => {
          invalidateSiteWideCache(CACHE_TAGS.ORGANIZATION_SETTINGS);
        },
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function updateTransferAccount(
  accountId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    transferAccountFormSchema,
    async (data) => {
      const parsedId = transferAccountIdSchema.safeParse(accountId);
      if (!parsedId.success) {
        return { ok: false, error: "IDが不正です" };
      }

      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "manage",
        execute: async () => {
          await updateTransferAccountCommand(parsedId.data, {
            label: data.label,
            bankName: data.bankName,
            branchName: data.branchName,
            accountType: data.accountType,
            accountNumber: data.accountNumber,
            accountHolderName: data.accountHolderName,
            note: data.note ?? null,
            sortOrder: data.sortOrder,
            isActive: data.isActive,
          });
        },
        afterSuccess: () => {
          invalidateSiteWideCache(CACHE_TAGS.ORGANIZATION_SETTINGS);
        },
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function toggleTransferAccountActive(
  accountId: string,
  isActive: boolean,
): Promise<MutationResult<{ id: string; isActive: boolean }>> {
  const parsedId = transferAccountIdSchema.safeParse(accountId);
  if (!parsedId.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      await toggleTransferAccountActiveCommand(parsedId.data, isActive);
      return { id: parsedId.data, isActive };
    },
    afterSuccess: () => {
      invalidateSiteWideCache(CACHE_TAGS.ORGANIZATION_SETTINGS);
    },
  });
}

export async function deleteTransferAccount(
  accountId: string,
): Promise<MutationResult<{ id: string }>> {
  const parsedId = transferAccountIdSchema.safeParse(accountId);
  if (!parsedId.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      await deleteTransferAccountCommand(parsedId.data);
      return { id: parsedId.data };
    },
    afterSuccess: () => {
      invalidateSiteWideCache(CACHE_TAGS.ORGANIZATION_SETTINGS);
    },
  });
}

export async function updateTransferGuidance(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    transferGuidanceFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "manage",
        execute: async () => {
          await updateTransferGuidanceCommand({
            transferGuidance: data.transferGuidance,
            expectedUpdatedAt: data.expectedUpdatedAt,
          });
        },
        afterSuccess: () => {
          invalidateSiteWideCache(CACHE_TAGS.ORGANIZATION_SETTINGS);
        },
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}
