"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  createPostBackup as createPostBackupCommand,
  restorePostVersion as restorePostVersionCommand,
} from "@/shared/domain/posts/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  invalidatePostCollectionCaches,
  purgePostCaches,
} from "./cache-helpers";

const idSchema = z.string().uuid({ error: "投稿IDが不正です" });
const versionSchema = z.object({
  postId: z.string().uuid({ error: "投稿IDが不正です" }),
  version: z.number().int().positive({ error: "バージョンが不正です" }),
});

export async function createPostBackup(
  id: string,
): Promise<MutationResult<{ version: number }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => createPostBackupCommand(validated.data, user.id),
  });
}

export async function restorePostVersion(
  postId: string,
  version: number,
): Promise<MutationResult<{ version: number }>> {
  const parsed = versionSchema.safeParse({ postId, version });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let restoredPostSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: parsed.data.postId,
    execute: async () => {
      const result = await restorePostVersionCommand(
        parsed.data.postId,
        parsed.data.version,
      );
      restoredPostSlug = result.slug;
      return { version: parsed.data.version };
    },
    afterSuccess: async () => {
      if (!restoredPostSlug) {
        return;
      }

      await invalidatePostCollectionCaches();
      updateTag(getCacheTag.posts.detail(restoredPostSlug));
      await purgePostCaches(restoredPostSlug);
    },
  });
}
