"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  disconnectInstagram as disconnectInstagramCommand,
  saveInstagramToken as saveInstagramTokenCommand,
} from "@/shared/domain/instagram/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { instagramTokenSchema } from "@/shared/lib/validations/instagram";
import { testInstagramConnection } from "@/shared/lib/instagram";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { DomainError } from "@/shared/domain/domain-error";

function invalidateInstagramCaches(): void {
  updateTag(CACHE_TAGS.INSTAGRAM_FEED);
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
