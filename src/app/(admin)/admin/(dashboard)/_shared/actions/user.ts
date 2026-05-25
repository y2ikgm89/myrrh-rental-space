"use server";

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { logPermissionDenied, logRoleChange } from "@/admin/lib/audit";
import {
  createUserSchema,
  updateUserSchema,
} from "@/shared/lib/validations/user";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import {
  createUser as createUserCommand,
  deleteUser as deleteUserCommand,
  updateUser as updateUserCommand,
  updateUserRole as updateUserRoleCommand,
} from "@/shared/domain/users/commands";
import { isDomainError } from "@/shared/domain/domain-error";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";

const idSchema = z.string().uuid({ error: "ユーザーIDが不正です" });
const updateRoleSchema = z.object({
  id: idSchema,
  role: z.enum(Role),
});

export async function createUser(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, createUserSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "user",
      action: "create",
      execute: async (user) =>
        createUserCommand(data, { id: user.id, role: user.role }),
      afterSuccess: () => {
        updateTag(CACHE_TAGS.STAFF);
      },
      resolveAuditResourceId: (result) => result.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function updateUser(
  userId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, updateUserSchema, async (data) => {
    const idValid = idSchema.safeParse(userId);
    if (!idValid.success) {
      return { ok: false, error: "ユーザーIDが不正です" };
    }
    const result = await executeAdminMutationResult({
      resource: "user",
      action: "update",
      resourceId: idValid.data,
      execute: async (user) => {
        await updateUserCommand(idValid.data, data, {
          id: user.id,
          role: user.role,
        });
        return null;
      },
      afterSuccess: () => {
        updateTag(CACHE_TAGS.STAFF);
        updateTag(getCacheTag.staff.detail(idValid.data));
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function deleteUser(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "user",
    action: "delete",
    resourceId: validated.data,
    execute: async (user) => {
      await deleteUserCommand(validated.data, {
        id: user.id,
        role: user.role,
      });
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF);
    },
  });
}

export async function updateUserRole(
  id: string,
  role: Role,
): Promise<MutationResult> {
  const auth = await checkAdminAuth();
  if (!auth.success) {
    return { error: auth.error.error };
  }
  if (auth.user.role !== Role.SUPER_ADMIN) {
    void logPermissionDenied(auth.user.id, "role", "update");
    return { error: "SUPER_ADMIN権限が必要です" };
  }

  const parsed = updateRoleSchema.safeParse({ id, role });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  try {
    const result = await updateUserRoleCommand(
      parsed.data.id,
      parsed.data.role,
      { id: auth.user.id, role: auth.user.role },
    );

    void logRoleChange(
      auth.user.id,
      parsed.data.id,
      result.oldRole,
      result.newRole,
    );

    updateTag(CACHE_TAGS.STAFF);
    updateTag(getCacheTag.staff.detail(parsed.data.id));

    return null;
  } catch (error) {
    if (isDomainError(error)) {
      return { error: error.message };
    }

    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "updateUserRole", userId: parsed.data.id },
    });
    throw error;
  }
}
