import "server-only";

import { z } from "zod";
import {
  getUser as getUserQuery,
  getUsers as getUsersQuery,
  getUserStats as getUserStatsQuery,
} from "@/shared/domain/users/queries";
import type {
  UserData,
  UserListParams,
  UserListResult,
  UserStats,
} from "@/shared/domain/users/types";
import { requireAdminPermission } from "./_helpers";

const idSchema = z.uuid({ error: "ユーザーIDが不正です" });

export async function getUsers(
  params: UserListParams = {},
): Promise<UserListResult> {
  await requireAdminPermission("user", "read");
  return getUsersQuery(params);
}

export async function getUser(id: string): Promise<UserData | null> {
  await requireAdminPermission("user", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getUserQuery(validated.data);
}

export async function getUserStats(): Promise<UserStats> {
  await requireAdminPermission("user", "read");
  return getUserStatsQuery();
}
