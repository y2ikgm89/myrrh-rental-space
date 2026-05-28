"use server";

import type { SubmissionResult } from "@conform-to/react";
import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { BLOCKED_DATE_SCOPE } from "@/shared/lib/validations/enums/helpers";
import type { BlockedDateFormData } from "@/shared/lib/validations/blocked-date";
import {
  createBlockedDateCommand,
  deleteBlockedDateCommand,
} from "@/shared/domain/blocked-dates/commands";
import { scopedBlockedDateFormSchema } from "@/admin/lib/validations/blocked-date";

const idSchema = z.string().uuid({ error: "IDが不正です" });

/**
 * スペースの臨時休業を追加する（scope=SPACE 固定）。
 * dialog からの conform 送信を受け、scope / spaceId を server 側で注入する。
 */
export async function createSpaceBlockedDate(
  spaceId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    scopedBlockedDateFormSchema,
    async (data) => {
      const input: BlockedDateFormData = {
        scope: BLOCKED_DATE_SCOPE.SPACE,
        spaceId,
        locationId: null,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        type: data.type,
      };

      const result = await executeAdminMutationResult({
        resource: "space",
        action: "update",
        resourceId: spaceId,
        execute: async (user) =>
          createBlockedDateCommand(input, { id: user.id }),
        afterSuccess: () => {
          updateTag(CACHE_TAGS.SPACES);
        },
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

/** スペースの臨時休業を削除する。 */
export async function deleteSpaceBlockedDate(
  spaceId: string,
  blockedDateId: string,
): Promise<
  import("@/shared/lib/mutation-result").MutationResult<{
    id: string;
  }>
> {
  const parsedSpace = idSchema.safeParse(spaceId);
  const parsedBlocked = idSchema.safeParse(blockedDateId);
  if (!parsedSpace.success || !parsedBlocked.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "space",
    action: "update",
    resourceId: parsedSpace.data,
    execute: async () => deleteBlockedDateCommand(parsedBlocked.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
  });
}
