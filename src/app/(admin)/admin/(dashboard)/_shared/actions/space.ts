"use server";

import { z } from "zod";
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

const idSchema = z.string().uuid({ error: "IDが不正です" });

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
  // Review stats depend on Space.reviewsEnabled — invalidate when any space mutates
  updateTag(CACHE_TAGS.REVIEWS);
  for (const id of [...new Set(ids)]) {
    updateTag(getCacheTag.spaces.detail(id));
    updateTag(getCacheTag.reviews.space(id));
    updateTag(getCacheTag.reviews.stats(id));
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
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "space",
    action: "update",
    resourceId: parsedId.data,
    execute: async () => {
      const commandInput = await buildSpaceCommandInput(parsed.data);
      await updateSpaceCommand(parsedId.data, commandInput);
      return null;
    },
    afterSuccess: () => {
      revalidateSpaces(parsedId.data);
    },
  });
}

export async function updateSpacePublish(
  id: string,
  isPublished: boolean,
): Promise<MutationResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "publish",
    resourceId: parsed.data,
    execute: async () => {
      await updateSpacePublishCommand(parsed.data, isPublished);
      return null;
    },
    afterSuccess: () => {
      revalidateSpaces(parsed.data);
    },
  });
}

export async function deleteSpace(id: string): Promise<MutationResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "delete",
    resourceId: parsed.data,
    execute: async () => {
      await deleteSpaceCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      revalidateSpaces(parsed.data);
    },
  });
}

export async function toggleSpacePublished(
  id: string,
): Promise<MutationResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "publish",
    resourceId: parsed.data,
    execute: async () => {
      await toggleSpacePublishedCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      revalidateSpaces(parsed.data);
    },
  });
}
