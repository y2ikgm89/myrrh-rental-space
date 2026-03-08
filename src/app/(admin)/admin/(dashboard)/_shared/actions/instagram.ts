"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  addInstagramPost as addInstagramPostCommand,
  disconnectInstagram as disconnectInstagramCommand,
  removeInstagramPost as removeInstagramPostCommand,
  reorderInstagramPosts as reorderInstagramPostsCommand,
  saveInstagramToken as saveInstagramTokenCommand,
  updateInstagramSettings as updateInstagramSettingsCommand,
} from "@/shared/domain/instagram/commands";
import {
  getDecryptedInstagramToken as getDecryptedInstagramTokenQuery,
  getInstagramConfig as getInstagramConfigQuery,
  getInstagramPosts as getInstagramPostsQuery,
} from "@/shared/domain/instagram/queries";
import type {
  InstagramConfig,
  InstagramPostData,
} from "@/shared/domain/instagram/types";
import { createValidationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS } from "@/shared/lib/constants";
import {
  instagramSettingsSchema,
  instagramTokenSchema,
  instagramPostUrlSchema,
  type InstagramSettingsInput,
} from "@/shared/lib/validations/instagram";
import { testInstagramConnection } from "@/shared/lib/instagram";

export type { InstagramSettingsInput } from "@/shared/lib/validations/instagram";
export type { InstagramConfig, InstagramPostData } from "@/shared/domain/instagram/types";

const checkReadPermission = checkReadPermissionFor("settings");
const idSchema = z.string().uuid({ error: "IDが不正です" });
const orderedIdsSchema = z.array(z.string().uuid({ error: "IDが不正です" }));

function invalidateInstagramCaches(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

export async function getInstagramConfig(): Promise<InstagramConfig> {
  if (!(await checkReadPermission())) {
    return {
      isConnected: false,
      username: null,
      accountType: null,
      tokenExpiresAt: null,
      tokenExpiryDays: null,
      shouldRefreshToken: false,
      feedEnabled: false,
      feedLayout: "grid",
      feedColumns: 4,
      feedMaxItems: 8,
      showCaption: false,
      showViewAll: true,
    };
  }

  return getInstagramConfigQuery();
}

export async function getInstagramPosts(): Promise<InstagramPostData[]> {
  if (!(await checkReadPermission())) {
    return [];
  }

  return getInstagramPostsQuery();
}

export async function updateInstagramSettings(
  data: InstagramSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = instagramSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => updateInstagramSettingsCommand(parsed.data),
    success: () => createSuccess("Instagram設定を更新しました"),
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}

export async function saveManualToken(
  token: string,
): Promise<ActionResult<{ username: string | undefined }>> {
  const parsed = instagramTokenSchema.safeParse(token);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => saveInstagramTokenCommand(parsed.data),
    success: (result) =>
      createSuccess("Instagramトークンを保存しました", result),
  afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}

export async function testInstagramConnectionAction(
  token: string,
): Promise<ActionResult<{ username: string | undefined; message: string }>> {
  const parsed = instagramTokenSchema.safeParse(token);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      const result = await testInstagramConnection(parsed.data);
      if (!result.success) {
        throw new Error(result.error || "接続テストに失敗しました");
      }

      const username =
        typeof result.metadata?.["username"] === "string"
          ? result.metadata["username"]
          : undefined;
      const message = result.message || "接続テストに成功しました";

      return { username, message };
    },
    success: (result) => createSuccess(result.message, result),
  }).catch(() => createFailure("接続テストに失敗しました"));
}

export async function disconnectInstagram(): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => disconnectInstagramCommand(),
    success: () => createSuccess("Instagram連携を解除しました"),
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}

export async function addInstagramPost(url: string): Promise<ActionResult<void>> {
  const parsed = instagramPostUrlSchema.safeParse(url);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => addInstagramPostCommand(parsed.data),
    success: () => createSuccess("Instagram投稿を追加しました"),
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}

export async function removeInstagramPost(
  id: string,
): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    resourceId: validated.data,
    execute: async () => removeInstagramPostCommand(validated.data),
    success: () => createSuccess("Instagram投稿を削除しました"),
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}

export async function reorderInstagramPosts(
  ids: string[],
): Promise<ActionResult<void>> {
  const parsed = orderedIdsSchema.safeParse(ids);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => reorderInstagramPostsCommand(parsed.data),
    success: () => createSuccess("並び順を更新しました"),
    afterSuccess: () => {
      invalidateInstagramCaches();
    },
  });
}

export async function getDecryptedInstagramToken(): Promise<string | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  return getDecryptedInstagramTokenQuery();
}
