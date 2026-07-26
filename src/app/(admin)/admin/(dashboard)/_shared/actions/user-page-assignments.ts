"use server";

import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { setAssignedPageIdsForUser } from "@/shared/domain/user-page-assignments/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const setAssignedPageIdsSchema = z.object({
  userId: uuidIdSchema("ユーザー"),
  pageIds: z.array(z.uuid({ error: "ページIDが不正です" })),
});

export async function setAssignedPageIdsForUserAction(
  userId: string,
  pageIds: string[],
): Promise<MutationResult> {
  const parsed = setAssignedPageIdsSchema.safeParse({ userId, pageIds });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "user",
    action: "update",
    resourceId: parsed.data.userId,
    execute: async () => {
      await setAssignedPageIdsForUser(parsed.data.userId, parsed.data.pageIds);
      return null;
    },
  });
}
