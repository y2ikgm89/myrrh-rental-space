"use server";

import type { SubmissionResult } from "@conform-to/react";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import { locationFormSchema } from "@/shared/lib/validations/location";
import {
  createLocation as createLocationCommand,
  deleteLocation as deleteLocationCommand,
  updateLocation as updateLocationCommand,
  updateLocationOrder as updateLocationOrderCommand,
  updateLocationPublished as updateLocationPublishedCommand,
} from "@/shared/domain/locations/commands";
import { syncLocationToGbpCommand } from "@/shared/domain/locations/gbp-sync-commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { ErrorCategory } from "@/shared/lib/errors/server";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("店舗");
const publishSchema = z.object({
  id: z.uuid({ error: "場所IDが不正です" }),
  isPublished: z.boolean(),
});
const locationOrderSchema = z
  .array(
    z.object({
      id: z.uuid({ error: "場所IDが不正です" }),
      sortOrder: z.number().int().min(0, { error: "並び順が不正です" }),
    }),
  )
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    error: "同じIDを複数指定することはできません",
  });

/**
 * 管理画面 新規 Location 作成 — conform `useActionState` canonical
 *
 * `(prev, formData) => SubmissionResult` signature。
 * 成功時は `redirect(/admin/locations/<id>)` で詳細ページに遷移、失敗時は `submission.reply()`。
 */
export async function createLocationAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  let createdId: string | null = null;

  const submissionResult = await executeConformMutation(
    formData,
    locationFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "location",
        action: "create",
        execute: async () => createLocationCommand(data),
        afterSuccess: (payload) => {
          updateTag(CACHE_TAGS.LOCATIONS);
          fireAndForget(syncLocationToGbpCommand({ locationId: payload.id }), {
            operation: "syncLocationToGbp",
            category: ErrorCategory.EXTERNAL_API,
          });
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
    redirect(toAppRoute(`/admin/locations/${createdId}`));
  }

  return submissionResult;
}

/**
 * 管理画面 Location 更新 — conform `useActionState` canonical
 *
 * id は `bind(null, location.id)` で部分適用。
 * 成功時は `/admin/spaces?tab=locations` (既存挙動踏襲) に遷移。
 */
export async function updateLocationAction(
  id: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return {
      status: "error",
      error: { "": ["場所IDが不正です"] },
    } satisfies SubmissionResult;
  }
  const locationId = validatedId.data;

  let success = false;

  const submissionResult = await executeConformMutation(
    formData,
    locationFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "location",
        action: "update",
        resourceId: locationId,
        execute: async () => updateLocationCommand(locationId, data),
        afterSuccess: (payload) => {
          updateTag(CACHE_TAGS.LOCATIONS);
          fireAndForget(syncLocationToGbpCommand({ locationId: payload.id }), {
            operation: "syncLocationToGbp",
            category: ErrorCategory.EXTERNAL_API,
          });
        },
        resolveAuditResourceId: (payload) => payload.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      success = true;
      return { ok: true };
    },
  );

  if (success) {
    redirect(toAppRoute("/admin/spaces?tab=locations"));
  }

  return submissionResult;
}

export async function updateLocationPublished(
  id: string,
  isPublished: boolean,
): Promise<MutationResult<{ id: string; isPublished: boolean }>> {
  const parsed = publishSchema.safeParse({ id, isPublished });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "location",
    action: "publish",
    resourceId: parsed.data.id,
    execute: async () =>
      updateLocationPublishedCommand(parsed.data.id, parsed.data.isPublished),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LOCATIONS);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateLocationOrder(
  items: { id: string; sortOrder: number }[],
): Promise<MutationResult<{ updated: number }>> {
  const parsed = locationOrderSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "location",
    action: "update",
    execute: async () => updateLocationOrderCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LOCATIONS);
    },
  });
}

export async function deleteLocation(
  id: string,
): Promise<MutationResult<{ id: string }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "location",
    action: "delete",
    resourceId: validated.data,
    execute: async () => deleteLocationCommand(validated.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LOCATIONS);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}
