"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  locationFormSchema,
  type LocationFormInput,
} from "@/shared/lib/validations/location";
import {
  createLocation as createLocationCommand,
  deleteLocation as deleteLocationCommand,
  hardDeleteLocation as hardDeleteLocationCommand,
  toggleLocationPublish as toggleLocationPublishCommand,
  updateLocation as updateLocationCommand,
  updateLocationOrder as updateLocationOrderCommand,
} from "@/shared/domain/locations/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";

const idSchema = z.string().uuid({ error: "場所IDが不正です" });
const publishSchema = z.object({
  id: z.string().uuid({ error: "場所IDが不正です" }),
  isPublished: z.boolean(),
});
const locationOrderSchema = z
  .array(
    z.object({
      id: z.string().uuid({ error: "場所IDが不正です" }),
      sortOrder: z.number().int().min(0, { error: "並び順が不正です" }),
    }),
  )
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    error: "同じIDを複数指定することはできません",
  });

export async function createLocation(
  input: LocationFormInput,
): Promise<MutationResult<{ id: string; slug: string }>> {
  const parsed = locationFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "location",
    action: "create",
    execute: async () => createLocationCommand(parsed.data),
    afterSuccess: (data) => {
      updateTag(CACHE_TAGS.LOCATIONS);
      updateTag(getCacheTag.locations.detail(data.slug));
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateLocation(
  id: string,
  input: LocationFormInput,
): Promise<MutationResult<{ id: string; slug: string }>> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = locationFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "location",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => updateLocationCommand(validatedId.data, parsed.data),
    afterSuccess: (data) => {
      updateTag(CACHE_TAGS.LOCATIONS);
      updateTag(getCacheTag.locations.detail(data.slug));
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function toggleLocationPublish(
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
      toggleLocationPublishCommand(parsed.data.id, parsed.data.isPublished),
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

export async function hardDeleteLocation(
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
    execute: async () => hardDeleteLocationCommand(validated.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LOCATIONS);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}
