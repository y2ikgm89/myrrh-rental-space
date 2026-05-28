"use server";

import type { SubmissionResult } from "@conform-to/react";
import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { BLOCKED_DATE_SCOPE } from "@/shared/lib/validations/enums/helpers";
import type { BlockedDateFormData } from "@/shared/lib/validations/blocked-date";
import {
  createBlockedDateCommand,
  deleteBlockedDateCommand,
} from "@/shared/domain/blocked-dates/commands";
import { scopedBlockedDateFormSchema } from "@/admin/lib/validations/blocked-date";

const idSchema = z.string().uuid({ error: "IDが不正です" });

function invalidateGlobalBlockedCaches(): void {
  updateTag(CACHE_TAGS.SPACES);
  updateTag(CACHE_TAGS.LOCATIONS);
}

/**
 * 全社の臨時休業を追加する（scope=GLOBAL 固定、全スペースに伝播）。
 * `BlockedDatesField` の汎用契約に合わせて第 1 引数に entityId を取るが、
 * GLOBAL では紐づけ対象が無いため無視する。
 */
export async function createGlobalBlockedDate(
  _entityId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    scopedBlockedDateFormSchema,
    async (data) => {
      const input: BlockedDateFormData = {
        scope: BLOCKED_DATE_SCOPE.GLOBAL,
        spaceId: null,
        locationId: null,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        type: data.type,
      };

      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "update",
        execute: async (user) =>
          createBlockedDateCommand(input, { id: user.id }),
        afterSuccess: invalidateGlobalBlockedCaches,
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

/** 全社の臨時休業を削除する。 */
export async function deleteGlobalBlockedDate(
  _entityId: string,
  blockedDateId: string,
): Promise<MutationResult<{ id: string }>> {
  const parsed = idSchema.safeParse(blockedDateId);
  if (!parsed.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => deleteBlockedDateCommand(parsed.data),
    afterSuccess: invalidateGlobalBlockedCaches,
  });
}
