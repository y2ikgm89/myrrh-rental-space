"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { checkRole } from "@/admin/lib/action-auth";
import { logRoleChange } from "@/admin/lib/audit";
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from "@/shared/lib/validations/user";
import { Role } from "@generated/prisma/enums";
import {
  createUser as createUserCommand,
  deleteUser as deleteUserCommand,
  updateUser as updateUserCommand,
  updateUserRole as updateUserRoleCommand,
} from "@/shared/domain/users/commands";
import { isDomainError } from "@/shared/domain/domain-error";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";

const idSchema = z.string().uuid({ error: "ユーザーIDが不正です" });
const updateRoleSchema = z.object({
  id: idSchema,
  role: z.enum(Role),
});

export async function createUser(
  input: CreateUserInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "user",
    action: "create",
    execute: async () => createUserCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "user",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await updateUserCommand(validatedId.data, parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF);
      updateTag(getCacheTag.staff.detail(validatedId.data));
    },
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
      await deleteUserCommand(validated.data, user.id);
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
  const auth = await checkRole(Role.SUPER_ADMIN);
  if (!auth.success) {
    return { error: auth.error.error };
  }

  const parsed = updateRoleSchema.safeParse({ id, role });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  try {
    const result = await updateUserRoleCommand(
      parsed.data.id,
      parsed.data.role,
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

    throw error;
  }
}
