"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { logRoleChange } from "@/admin/lib/audit";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import { withRole } from "@/admin/lib/server-action-helpers";
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
import {
  getUser as getUserQuery,
  getUsers as getUsersQuery,
  getUserStats as getUserStatsQuery,
} from "@/shared/domain/users/queries";
import { isDomainError } from "@/shared/domain/domain-error";
import type {
  UserData,
  UserListParams,
  UserListResult,
  UserStats,
} from "@/shared/domain/users/types";
import { createValidationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { User } from "@/shared/lib/auth";

const checkReadPermission = checkReadPermissionFor("user");
const idSchema = z.string().uuid({ error: "ユーザーIDが不正です" });
const updateRoleSchema = z.object({
  id: idSchema,
  role: z.enum(Role),
});

export async function getUsers(
  params: UserListParams = {},
): Promise<UserListResult> {
  if (!(await checkReadPermission())) {
    return { users: [], total: 0, page: 1, perPage: 20, totalPages: 0 };
  }

  return getUsersQuery(params);
}

export async function getUser(id: string): Promise<UserData | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getUserQuery(validated.data);
}

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

export const updateUserRole = withRole<[string, Role], void>(Role.SUPER_ADMIN)(
  async (user: User, id: string, role: Role): Promise<ActionResult<void>> => {
    const parsed = updateRoleSchema.safeParse({ id, role });
    if (!parsed.success) {
      return createValidationError(parsed.error);
    }

    try {
      const result = await updateUserRoleCommand(parsed.data.id, parsed.data.role);

      void logRoleChange(user.id, parsed.data.id, result.oldRole, result.newRole);

      updateTag(CACHE_TAGS.STAFF);
      updateTag(getCacheTag.staff.detail(parsed.data.id));

      return createSuccess("ロールを更新しました");
    } catch (error) {
      if (isDomainError(error)) {
        return createFailure(error.message);
      }

      throw error;
    }
  },
);

export async function getUserStats(): Promise<UserStats> {
  if (!(await checkReadPermission())) {
    return { total: 0, admins: 0, users: 0, recentUsers: 0 };
  }

  return getUserStatsQuery();
}
