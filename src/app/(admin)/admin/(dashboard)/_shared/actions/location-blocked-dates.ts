"use server";

import type { SubmissionResult } from "@conform-to/react";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { assertAdminFeatureCreateAllowed } from "@/shared/domain/features/check";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
// CACHE-INVALIDATE-04: LOCATIONS/SPACES はいずれも CDN (`location-v1` / `space-v1`)
// に emit されるため、raw updateTag では edge の stale HTML が残る。
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { BLOCKED_DATE_SCOPE } from "@/shared/lib/validations/enums/helpers";
import type { BlockedDateFormData } from "@/shared/lib/validations/blocked-date";
import {
  createBlockedDateCommand,
  deleteBlockedDateCommand,
} from "@/shared/domain/blocked-dates/commands";
import { scopedBlockedDateFormSchema } from "@/admin/lib/validations/blocked-date";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("ブロック日");

/**
 * 拠点の臨時休業を追加する（scope=LOCATION 固定）。配下の全スペースに伝播する。
 */
export async function createLocationBlockedDate(
  locationId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    scopedBlockedDateFormSchema,
    async (data) => {
      const input: BlockedDateFormData = {
        scope: BLOCKED_DATE_SCOPE.LOCATION,
        spaceId: null,
        locationId,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        type: data.type,
      };

      const result = await executeAdminMutationResult({
        resource: "location",
        action: "update",
        resourceId: locationId,
        execute: async (user) => {
          await assertAdminFeatureCreateAllowed("access");
          return createBlockedDateCommand(input, { id: user.id });
        },
        afterSuccess: () => {
          invalidateSiteWideCache([CACHE_TAGS.LOCATIONS, CACHE_TAGS.SPACES]);
        },
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

/** 拠点の臨時休業を削除する。 */
export async function deleteLocationBlockedDate(
  locationId: string,
  blockedDateId: string,
): Promise<MutationResult<{ id: string }>> {
  const parsedLocation = idSchema.safeParse(locationId);
  const parsedBlocked = idSchema.safeParse(blockedDateId);
  if (!parsedLocation.success || !parsedBlocked.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "location",
    action: "update",
    resourceId: parsedLocation.data,
    execute: async () => deleteBlockedDateCommand(parsedBlocked.data),
    afterSuccess: () => {
      invalidateSiteWideCache([CACHE_TAGS.LOCATIONS, CACHE_TAGS.SPACES]);
    },
  });
}
