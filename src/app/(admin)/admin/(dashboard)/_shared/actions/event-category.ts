"use server";

import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { assertAdminFeatureCreateAllowed } from "@/shared/domain/features/check";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createEventCategory as createEventCategoryCommand,
  deleteEventCategory as deleteEventCategoryCommand,
  updateEventCategory as updateEventCategoryCommand,
  updateEventCategoryActive as updateEventCategoryActiveCommand,
  updateEventCategoryOrder as updateEventCategoryOrderCommand,
} from "@/shared/domain/event-categories/commands";
import { eventCategoryFormSchema } from "@/shared/lib/validations/event-category";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("イベントカテゴリ");

/** カテゴリ一覧タグのみ（create — イベント未紐付けのため EVENTS 不要） */
function invalidateEventCategoryListCache(): void {
  invalidateSiteWideCache(CACHE_TAGS.EVENT_CATEGORIES);
}

/** カテゴリ変更が公開イベント表示に波及する mutation 用 */
function invalidateEventCategoryAndEventsCache(): void {
  invalidateSiteWideCache([CACHE_TAGS.EVENT_CATEGORIES, CACHE_TAGS.EVENTS]);
}

const categoryOrderSchema = z
  .array(
    z.strictObject({
      id: z.uuid({ error: "カテゴリーIDが不正です" }),
      sortOrder: z.number().int().min(0, { error: "並び順が不正です" }),
    }),
  )
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    error: "同じIDを複数指定することはできません",
  })
  .refine(
    (items) =>
      new Set(items.map((item) => item.sortOrder)).size === items.length,
    {
      error: "同じ並び順を複数指定することはできません",
    },
  );

export async function createEventCategory(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    eventCategoryFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "eventCategory",
        action: "create",
        execute: async () => {
          await assertAdminFeatureCreateAllowed("events");
          return createEventCategoryCommand(data);
        },
        afterSuccess: () => {
          invalidateEventCategoryListCache();
        },
        resolveAuditResourceId: (result) => result.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function updateEventCategory(
  categoryId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    eventCategoryFormSchema,
    async (data) => {
      const idValid = idSchema.safeParse(categoryId);
      if (!idValid.success) {
        return { ok: false, error: "カテゴリーIDが不正です" };
      }
      const result = await executeAdminMutationResult({
        resource: "eventCategory",
        action: "update",
        resourceId: idValid.data,
        execute: async () => updateEventCategoryCommand(idValid.data, data),
        afterSuccess: () => {
          invalidateEventCategoryAndEventsCache();
        },
        resolveAuditResourceId: (result) => result.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function updateEventCategoryOrder(
  items: { id: string; sortOrder: number }[],
): Promise<MutationResult<{ updated: number }>> {
  const parsed = categoryOrderSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "eventCategory",
    action: "update",
    execute: async () => updateEventCategoryOrderCommand(parsed.data),
    afterSuccess: () => {
      invalidateEventCategoryAndEventsCache();
    },
  });
}

export async function deleteEventCategory(
  id: string,
): Promise<MutationResult<{ id: string }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "eventCategory",
    action: "delete",
    resourceId: validated.data,
    execute: async () => deleteEventCategoryCommand(validated.data),
    afterSuccess: () => {
      invalidateEventCategoryListCache();
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateEventCategoryActive(
  id: string,
  isActive: boolean,
): Promise<MutationResult<{ id: string; isActive: boolean }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "eventCategory",
    action: "update",
    resourceId: validated.data,
    execute: async () =>
      updateEventCategoryActiveCommand(validated.data, isActive),
    afterSuccess: () => {
      invalidateEventCategoryAndEventsCache();
    },
  });
}
