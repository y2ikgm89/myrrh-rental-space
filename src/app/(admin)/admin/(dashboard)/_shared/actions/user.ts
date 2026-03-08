"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { checkRole } from "@/admin/lib/action-auth";
import { logRoleChange } from "@/admin/lib/audit";
import {
  createFailure,
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from "@/admin/lib/validations/user";
import { Role } from "@/shared/db/enums";
import {
  createUser as createUserCommand,
  deleteUser as deleteUserCommand,
  updateUser as updateUserCommand,
  updateUserRole as updateUserRoleCommand,
} from "@/shared/domain/users/commands";
import { isDomainError } from "@/shared/domain/domain-error";
import { createValidationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

const idSchema = z.string().uuid({ error: "ユーザーIDが不正です" });
const updateRoleSchema = z.object({
  id: idSchema,
  role: z.enum(Role),
});

export async function createUser(
  input: CreateUserInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "user",
    action: "create",
    execute: async () => createUserCommand(parsed.data),
    success: (result) => createSuccess("ユーザーを作成しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<ActionResult<void>> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationError(validatedId.error);
  }

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "user",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await updateUserCommand(validatedId.data, parsed.data);
    },
    success: () => createSuccess("ユーザーを更新しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF);
      updateTag(getCacheTag.staff.detail(validatedId.data));
    },
  });
}

export async function deleteUser(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "user",
    action: "delete",
    resourceId: validated.data,
    execute: async (user) => {
      await deleteUserCommand(validated.data, user.id);
    },
    success: () => createSuccess("ユーザーを削除しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF);
    },
  });
}

export async function updateUserRole(
  id: string,
  role: Role,
): Promise<ActionResult<void>> {
  const auth = await checkRole(Role.SUPER_ADMIN);
  if (!auth.success) {
    return auth.error;
  }

  const parsed = updateRoleSchema.safeParse({ id, role });
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  try {
    const result = await updateUserRoleCommand(parsed.data.id, parsed.data.role);

    void logRoleChange(auth.user.id, parsed.data.id, result.oldRole, result.newRole);

    updateTag(CACHE_TAGS.STAFF);
    updateTag(getCacheTag.staff.detail(parsed.data.id));

    return createSuccess("ロールを更新しました");
  } catch (error) {
    if (isDomainError(error)) {
      return createFailure(error.message);
    }

    throw error;
  }
}
