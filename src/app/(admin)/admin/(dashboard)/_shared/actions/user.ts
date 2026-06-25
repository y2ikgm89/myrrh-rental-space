"use server";

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { logRoleChange } from "@/admin/lib/audit";
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
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("ユーザー");
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
  const parsed = updateRoleSchema.safeParse({ id, role });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // user:manage は RBAC マトリクス上 SUPER_ADMIN 専用（admin-permissions.ts）。
  // wrapper が auth → RBAC → execute → afterSuccess(cache) → 監査ログの順序契約を
  // 担保するため、auth / 権限 / DomainError 変換を手書きしない。
  return executeAdminMutationResult({
    resource: "user",
    action: "manage",
    resourceId: parsed.data.id,
    execute: async (user) => {
      const result = await updateUserRoleCommand(
        parsed.data.id,
        parsed.data.role,
        { id: user.id, role: user.role },
      );
      // ロール変更の before/after をドメイン監査として記録（wrapper の汎用
      // logAction に加えて old/new role を残す）。
      void logRoleChange(
        user.id,
        parsed.data.id,
        result.oldRole,
        result.newRole,
      );
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF);
      updateTag(getCacheTag.staff.detail(parsed.data.id));
    },
  });
}
