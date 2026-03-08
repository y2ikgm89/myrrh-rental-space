"use server";

import { updateTag } from "next/cache";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import {
  createSuccess,
} from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgeSpaceCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import {
  createSpaceCommand,
  deleteSpaceCommand,
  toggleSpacePublishedCommand,
  updateSpaceCommand,
  updateSpacePublishCommand,
} from "@/shared/domain/spaces/commands";
import {
  spaceFormSchema,
  type SpaceFormData,
} from "@/admin/lib/validations/space";

async function renderDescriptionHtml(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return value ?? null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && "root" in parsed) {
      return renderEditorStateToHtmlLazy(value);
    }
  } catch {
    return value;
  }

  return value;
}

export type SpaceSelectOption = {
  id: string;
  slug: string;
  name: string;
  mainImageUrl: string;
  hourlyPrice: string;
  capacity: number;
};

function revalidateSpaces(...ids: string[]): void {
  updateTag(CACHE_TAGS.SPACES);
  for (const id of [...new Set(ids)]) {
    updateTag(getCacheTag.spaces.detail(id));
    fireAndForget(purgeSpaceCache(id), {
      operation: "purgeSpaceCache",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
    });
  }
}

async function buildSpaceCommandInput(data: SpaceFormData) {
  return {
    ...data,
    description:
      (await renderDescriptionHtml(data.description)) ?? data.description,
  };
}

export const createSpace = async (input: SpaceFormData) => {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "space",
    action: "create",
    execute: async () => {
      const commandInput = await buildSpaceCommandInput(parsed.data);
      return createSpaceCommand(commandInput);
    },
    success: (result) => createSuccess("スペースを作成しました", result),
    afterSuccess: (result) => {
      revalidateSpaces(result.id);
    },
    resolveAuditResourceId: (result) => result.id,
  });
};

export const updateSpace = async (id: string, input: SpaceFormData) => {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "space",
    action: "update",
    resourceId: id,
    execute: async () => {
      const commandInput = await buildSpaceCommandInput(parsed.data);
      await updateSpaceCommand(id, commandInput);
    },
    success: () => createSuccess("スペースを更新しました"),
    afterSuccess: () => {
      revalidateSpaces(id);
    },
  });
};

export const updateSpacePublish = async (id: string, isPublished: boolean) =>
  executeAdminMutation({
    resource: "space",
    action: "publish",
    resourceId: id,
    execute: async () => {
      await updateSpacePublishCommand(id, isPublished);
    },
    success: () => createSuccess("公開状態を更新しました"),
    afterSuccess: () => {
      revalidateSpaces(id);
    },
  });

export const deleteSpace = async (id: string) =>
  executeAdminMutation({
    resource: "space",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteSpaceCommand(id);
    },
    success: () => createSuccess("スペースを削除しました"),
    afterSuccess: () => {
      revalidateSpaces(id);
    },
  });

export const toggleSpacePublished = async (id: string) => {
  let isPublished = false;

  return executeAdminMutation({
    resource: "space",
    action: "publish",
    resourceId: id,
    execute: async () => {
      const result = await toggleSpacePublishedCommand(id);
      isPublished = result.isPublished;
    },
    success: () =>
      createSuccess(
        isPublished
          ? "スペースを公開しました"
          : "スペースを非公開にしました",
      ),
    afterSuccess: () => {
      revalidateSpaces(id);
    },
  });
};
