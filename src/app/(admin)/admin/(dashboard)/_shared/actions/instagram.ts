"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  addInstagramPost as addInstagramPostCommand,
  disconnectInstagram as disconnectInstagramCommand,
  removeInstagramPost as removeInstagramPostCommand,
  reorderInstagramPosts as reorderInstagramPostsCommand,
  saveInstagramToken as saveInstagramTokenCommand,
  updateInstagramSettings as updateInstagramSettingsCommand,
} from "@/shared/domain/instagram/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS } from "@/shared/lib/constants";
import {
  instagramSettingsSchema,
  instagramTokenSchema,
  instagramPostUrlSchema,
  type InstagramSettingsInput,
} from "@/shared/lib/validations/instagram";
import { testInstagramConnection } from "@/shared/lib/instagram";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { DomainError } from "@/shared/domain/domain-error";

const idSchema = z.string().uuid({ error: "IDが不正です" });
const orderedIdsSchema = z
  .array(z.string().uuid({ error: "IDが不正です" }))
  .refine((ids) => new Set(ids).size === ids.length, {
    error: "同じIDを複数指定することはできません",
  });

function invalidateInstagramCaches(): void {
  updateTag(CACHE_TAGS.INSTAGRAM_FEED);
}

export async function updateInstagramSettings(
  data: InstagramSettingsInput,
): Promise<MutationResult> {
  const parsed = instagramSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateInstagramSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
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

export async function addInstagramPost(url: string): Promise<MutationResult> {
  const parsed = instagramPostUrlSchema.safeParse(url);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await addInstagramPostCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}

export async function removeInstagramPost(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      await removeInstagramPostCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}

export async function reorderInstagramPosts(
  ids: string[],
): Promise<MutationResult> {
  const parsed = orderedIdsSchema.safeParse(ids);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await reorderInstagramPostsCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}
