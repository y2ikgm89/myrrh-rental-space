"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  locationFormSchema,
  type LocationFormInput,
} from "@/admin/lib/validations/location";
import {
  createLocation as createLocationCommand,
  deleteLocation as deleteLocationCommand,
  hardDeleteLocation as hardDeleteLocationCommand,
  toggleLocationPublish as toggleLocationPublishCommand,
  updateLocation as updateLocationCommand,
  updateLocationOrder as updateLocationOrderCommand,
} from "@/shared/domain/locations/commands";
import { createValidationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS } from "@/shared/lib/constants";

const idSchema = z.string().uuid({ error: "場所IDが不正です" });
const publishSchema = z.object({
  id: z.string().uuid({ error: "場所IDが不正です" }),
  isPublished: z.boolean(),
});
const locationOrderSchema = z.array(
  z.object({
    id: z.string().uuid({ error: "場所IDが不正です" }),
    sortOrder: z.number().int().min(0, { error: "並び順が不正です" }),
  }),
);

export async function createLocation(
  input: LocationFormInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = locationFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "location",
    action: "create",
    execute: async () => createLocationCommand(parsed.data),
    success: (result) => createSuccess("場所を作成しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LOCATIONS);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateLocation(
  id: string,
  input: LocationFormInput,
): Promise<ActionResult<{ id: string }>> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationError(validatedId.error);
  }

  const parsed = locationFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "location",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => updateLocationCommand(validatedId.data, parsed.data),
    success: (result) => createSuccess("場所を更新しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LOCATIONS);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function toggleLocationPublish(
  id: string,
  isPublished: boolean,
): Promise<ActionResult<{ id: string; isPublished: boolean }>> {
  const parsed = publishSchema.safeParse({ id, isPublished });
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "location",
    action: "publish",
    resourceId: parsed.data.id,
    execute: async () =>
      toggleLocationPublishCommand(parsed.data.id, parsed.data.isPublished),
    success: (result) => createSuccess("公開状態を更新しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LOCATIONS);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateLocationOrder(
  items: { id: string; sortOrder: number }[],
): Promise<ActionResult<{ updated: number }>> {
  const parsed = locationOrderSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "location",
    action: "update",
    execute: async () => updateLocationOrderCommand(parsed.data),
    success: (result) => createSuccess("並び順を更新しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LOCATIONS);
    },
  });
}

export async function deleteLocation(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "location",
    action: "delete",
    resourceId: validated.data,
    execute: async () => deleteLocationCommand(validated.data),
    success: (result) => createSuccess("場所を削除しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LOCATIONS);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function hardDeleteLocation(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "location",
    action: "delete",
    resourceId: validated.data,
    execute: async () => hardDeleteLocationCommand(validated.data),
    success: (result) => createSuccess("場所を完全に削除しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LOCATIONS);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}
