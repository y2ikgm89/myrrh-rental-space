"use server";

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import {
  disconnectInstagram as disconnectInstagramCommand,
  saveInstagramToken as saveInstagramTokenCommand,
  updateInstagramSettings as updateInstagramSettingsCommand,
} from "@/shared/domain/instagram/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { instagramTokenSchema } from "@/shared/lib/validations/instagram";
import { instagramFeedFormSchema } from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { testInstagramConnection } from "@/shared/lib/instagram";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { DomainError } from "@/shared/domain/domain-error";

function invalidateInstagramCaches(): void {
  updateTag(CACHE_TAGS.INSTAGRAM_FEED);
}

/**
 * Instagram フィード表示設定更新 — conform `useActionState` 統合経路。
 *
 * `useActionState` + `useForm` (conform) に clean break 移行。
 */
export async function updateInstagramSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    instagramFeedFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "update",
        execute: async () => {
          await updateInstagramSettingsCommand({
            feedEnabled: data.feedEnabled,
            feedLayout: data.feedLayout,
            feedColumns: data.feedColumns,
            feedMaxItems: data.feedMaxItems,
            showCaption: data.showCaption,
            showViewAll: data.showViewAll,
          });
          return null;
        },
        afterSuccess: () => {
          invalidateInstagramCaches();
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function saveManualToken(
  token: string,
): Promise<MutationResult<{ username: string | undefined }>> {
  const parsed = instagramTokenSchema.safeParse(token);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => saveInstagramTokenCommand(parsed.data),
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}

export async function testInstagramConnectionAction(
  token: string,
): Promise<MutationResult<{ username: string | undefined }>> {
  const parsed = instagramTokenSchema.safeParse(token);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      const result = await testInstagramConnection(parsed.data);
      if (!result.success) {
        throw new DomainError(
          result.error || "接続テストに失敗しました",
          "VALIDATION",
        );
      }

      const username =
        typeof result.metadata?.["username"] === "string"
          ? result.metadata["username"]
          : undefined;

      return { username };
    },
  });
}

export async function disconnectInstagram(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await disconnectInstagramCommand();
      return null;
    },
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}
