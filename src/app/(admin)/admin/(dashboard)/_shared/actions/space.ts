"use server";

import type { SubmissionResult } from "@conform-to/react";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { z } from "zod";
import { parsePrismaInputJson } from "@/shared/db/json";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { isMutationError } from "@/shared/lib/mutation-result";
import { purgeSpaceCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import { omitUndefined } from "@/shared/lib/serialize";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import {
  createSpaceCommand,
  deleteSpaceCommand,
  duplicateSpaceCommand,
  updateSpaceCommand,
  updateSpacePublishedCommand,
} from "@/shared/domain/spaces/commands";
import {
  spaceFormSchema,
  type SpaceFormData,
} from "@/admin/lib/validations/space";

const idSchema = z.uuid({ error: "IDが不正です" });

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

function buildSpaceCommandInput(data: SpaceFormData) {
  const descriptionHtml = data.descriptionHtml;
  const descriptionPlainText = stripHtmlToText(descriptionHtml, 200);
  const descriptionJson = parsePrismaInputJson(
    data.descriptionJson,
    "descriptionJson が不正です",
  );

  const {
    descriptionJson: _dropJson,
    descriptionHtml: _dropHtml,
    ...rest
  } = data;
  void _dropJson;
  void _dropHtml;
  return omitUndefined({
    ...rest,
    descriptionJson,
    descriptionHtml,
    descriptionPlainText,
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
      const commandInput = buildSpaceCommandInput(parsed.data);
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
      const commandInput = buildSpaceCommandInput(parsed.data);
      await updateSpaceCommand(parsedId.data, commandInput);
      return null;
    },
    afterSuccess: () => {
      revalidateSpaces(parsedId.data);
    },
  });
}

/**
 * 管理画面 新規 Space 作成 — conform `useActionState` canonical
 *
 * `(prev, formData) => SubmissionResult` signature。
 * 成功時は server-side `redirect(/admin/spaces/<id>)` で詳細ページに遷移、失敗時は `submission.reply()`。
 */
export async function createSpaceAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  let createdId: string | null = null;

  const submissionResult = await executeConformMutation(
    formData,
    spaceFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "space",
        action: "create",
        execute: async () => {
          const commandInput = buildSpaceCommandInput(data);
          return createSpaceCommand(commandInput);
        },
        afterSuccess: (payload) => {
          revalidateSpaces(payload.id);
        },
        resolveAuditResourceId: (payload) => payload.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      createdId = result.id;
      return { ok: true };
    },
  );

  if (createdId !== null) {
    redirect(toAppRoute(`/admin/spaces/${createdId}`));
  }

  return submissionResult;
}

/**
 * 管理画面 Space 更新 — conform `useActionState` canonical
 *
 * id は `bind(null, space.id)` で部分適用。
 * 成功時は server-side `redirect(/admin/spaces/<id>)` で詳細ページに遷移。
 */
export async function updateSpaceAction(
  spaceId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  const validatedId = idSchema.safeParse(spaceId);
  if (!validatedId.success) {
    return {
      status: "error",
      error: { "": ["スペースIDが不正です"] },
    } satisfies SubmissionResult;
  }
  const id = validatedId.data;

  let success = false;

  const submissionResult = await executeConformMutation(
    formData,
    spaceFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "space",
        action: "update",
        resourceId: id,
        execute: async () => {
          const commandInput = buildSpaceCommandInput(data);
          await updateSpaceCommand(id, commandInput);
          return null;
        },
        afterSuccess: () => {
          revalidateSpaces(id);
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      success = true;
      return { ok: true };
    },
  );

  if (success) {
    redirect(toAppRoute(`/admin/spaces/${id}`));
  }

  return submissionResult;
}

export async function updateSpacePublished(
  id: string,
  isPublished: boolean,
): Promise<MutationResult<{ isPublished: boolean }>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "publish",
    resourceId: parsed.data,
    execute: async () => updateSpacePublishedCommand(parsed.data, isPublished),
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

export async function duplicateSpace(
  id: string,
): Promise<MutationResult<{ id: string; slug: string }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "create",
    execute: async () => duplicateSpaceCommand(validated.data),
    afterSuccess: (data) => {
      revalidateSpaces(data.id);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}
