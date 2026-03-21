"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgeSpaceCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";
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

export type { SpaceSelectOption } from "@/admin/lib/validations/space";

async function renderDescriptionHtml(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return value ?? null;
  if (lexicalJsonSchema.safeParse(value).success) {
    return renderEditorStateToHtmlLazy(value);
  }

  return value;
}

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
  return omitUndefined({
    ...data,
    description:
      (await renderDescriptionHtml(data.description)) ?? data.description,
  });
}

export async function createSpace(
  input: SpaceFormData,
): Promise<MutationResult<Awaited<ReturnType<typeof createSpaceCommand>>>> {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "space",
    action: "create",
    execute: async () => {
      const commandInput = await buildSpaceCommandInput(parsed.data);
      return createSpaceCommand(commandInput);
    },
    afterSuccess: (result) => {
      revalidateSpaces(result.id);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateSpace(
  id: string,
  input: SpaceFormData,
): Promise<MutationResult> {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "space",
    action: "update",
    resourceId: id,
    execute: async () => {
      const commandInput = await buildSpaceCommandInput(parsed.data);
      await updateSpaceCommand(id, commandInput);
      return null;
    },
    afterSuccess: () => {
      revalidateSpaces(id);
    },
  });
}

export async function updateSpacePublish(
  id: string,
  isPublished: boolean,
): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "space",
    action: "publish",
    resourceId: id,
    execute: async () => {
      await updateSpacePublishCommand(id, isPublished);
      return null;
    },
    afterSuccess: () => {
      revalidateSpaces(id);
    },
  });
}

export async function deleteSpace(id: string): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "space",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteSpaceCommand(id);
      return null;
    },
    afterSuccess: () => {
      revalidateSpaces(id);
    },
  });
}

export async function toggleSpacePublished(
  id: string,
): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "space",
    action: "publish",
    resourceId: id,
    execute: async () => {
      await toggleSpacePublishedCommand(id);
      return null;
    },
    afterSuccess: () => {
      revalidateSpaces(id);
    },
  });
}
