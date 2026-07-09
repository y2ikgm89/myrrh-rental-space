"use server";

import { z } from "zod";
import type { SubmissionResult } from "@conform-to/react";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { invalidateSiteWideCache } from "@/shared/lib/cache";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createNavigationItem as createNavigationItemCommand,
  createSocialLink as createSocialLinkCommand,
  deleteNavigationItem as deleteNavigationItemCommand,
  deleteSocialLink as deleteSocialLinkCommand,
  navigationOrderInputSchema,
  socialLinkOrderInputSchema,
  type NavigationItemInput,
  type SocialLinkInput,
  updateNavigationItem as updateNavigationItemCommand,
  updateNavigationItemActive as updateNavigationItemActiveCommand,
  updateNavigationOrder as updateNavigationOrderCommand,
  updateSocialLink as updateSocialLinkCommand,
  updateSocialLinkActive as updateSocialLinkActiveCommand,
  updateSocialLinkDesktopVisibility as updateSocialLinkDesktopVisibilityCommand,
  updateSocialLinkMobileVisibility as updateSocialLinkMobileVisibilityCommand,
  updateSocialLinkOrder as updateSocialLinkOrderCommand,
} from "@/shared/domain/navigation/commands";
import {
  navFormSchema,
  socialFormSchema,
} from "../../settings/appearance/_components/navigation/nav-form-schema";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("ナビゲーション");
const booleanSchema = z.boolean();

function invalidateNavigationCache(): void {
  invalidateSiteWideCache([CACHE_TAGS.NAVIGATION, CACHE_TAGS.SOCIAL_LINKS]);
}

export async function deleteNavigationItem(
  id: string,
): Promise<MutationResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "navigation",
    action: "delete",
    resourceId: parsed.data,
    execute: async () => {
      await deleteNavigationItemCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateNavigationCache,
  });
}

export async function updateNavigationOrder(
  items: { id: string; order: number; parentId?: string | null }[],
): Promise<MutationResult> {
  const parsed = navigationOrderInputSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "navigation",
    action: "update",
    execute: async () => {
      await updateNavigationOrderCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateNavigationCache,
  });
}

export async function updateNavigationItemActive(
  id: string,
  isActive: boolean,
): Promise<MutationResult<{ id: string; isActive: boolean }>> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  const parsedActive = booleanSchema.safeParse(isActive);
  if (!parsedActive.success) {
    return createValidationMutationError(parsedActive.error);
  }

  return executeAdminMutationResult({
    resource: "navigation",
    action: "update",
    resourceId: parsedId.data,
    execute: async () =>
      updateNavigationItemActiveCommand(parsedId.data, parsedActive.data),
    afterSuccess: invalidateNavigationCache,
  });
}

export async function deleteSocialLink(id: string): Promise<MutationResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "navigation",
    action: "delete",
    resourceId: parsed.data,
    execute: async () => {
      await deleteSocialLinkCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateNavigationCache,
  });
}

export async function updateSocialLinkActive(
  id: string,
  isActive: boolean,
): Promise<MutationResult<{ id: string; isActive: boolean }>> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  const parsedActive = booleanSchema.safeParse(isActive);
  if (!parsedActive.success) {
    return createValidationMutationError(parsedActive.error);
  }

  return executeAdminMutationResult({
    resource: "navigation",
    action: "update",
    resourceId: parsedId.data,
    execute: async () =>
      updateSocialLinkActiveCommand(parsedId.data, parsedActive.data),
    afterSuccess: invalidateNavigationCache,
  });
}

export async function updateSocialLinkDesktopVisibility(
  id: string,
  showOnDesktop: boolean,
): Promise<MutationResult<{ id: string; showOnDesktop: boolean }>> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  const parsedVisibility = booleanSchema.safeParse(showOnDesktop);
  if (!parsedVisibility.success) {
    return createValidationMutationError(parsedVisibility.error);
  }

  return executeAdminMutationResult({
    resource: "navigation",
    action: "update",
    resourceId: parsedId.data,
    execute: async () =>
      updateSocialLinkDesktopVisibilityCommand(
        parsedId.data,
        parsedVisibility.data,
      ),
    afterSuccess: invalidateNavigationCache,
  });
}

export async function updateSocialLinkMobileVisibility(
  id: string,
  showOnMobile: boolean,
): Promise<MutationResult<{ id: string; showOnMobile: boolean }>> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  const parsedVisibility = booleanSchema.safeParse(showOnMobile);
  if (!parsedVisibility.success) {
    return createValidationMutationError(parsedVisibility.error);
  }

  return executeAdminMutationResult({
    resource: "navigation",
    action: "update",
    resourceId: parsedId.data,
    execute: async () =>
      updateSocialLinkMobileVisibilityCommand(
        parsedId.data,
        parsedVisibility.data,
      ),
    afterSuccess: invalidateNavigationCache,
  });
}

export async function updateSocialLinkOrder(
  items: { id: string; order: number }[],
): Promise<MutationResult> {
  const parsed = socialLinkOrderInputSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "navigation",
    action: "update",
    execute: async () => {
      await updateSocialLinkOrderCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateNavigationCache,
  });
}

// =============================================================================
// Conform `useActionState` 用 Server Actions
//
// `(prev, formData) => SubmissionResult` signature。NavigationFormDialog /
// SocialLinkFormDialog (Variant A) で mount-on-open + bind 部分適用で利用される。
// =============================================================================

function toNavigationItemInput(
  data: z.output<typeof navFormSchema>,
): NavigationItemInput {
  const parentId =
    data.parentId === "none" || data.parentId === "" ? null : data.parentId;
  return {
    type: data.type,
    parentId,
    label: data.label,
    url: data.url,
    isExternal: data.isExternal,
    isActive: data.isActive,
  };
}

export async function createNavigationItemAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, navFormSchema, async (data) => {
    const input = toNavigationItemInput(data);
    const result = await executeAdminMutationResult({
      resource: "navigation",
      action: "create",
      execute: async () => createNavigationItemCommand(input),
      afterSuccess: invalidateNavigationCache,
      resolveAuditResourceId: (output) => output.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function updateNavigationItemAction(
  id: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, navFormSchema, async (data) => {
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return { ok: false, error: "IDが不正です" };
    }

    const input = toNavigationItemInput(data);
    const result = await executeAdminMutationResult({
      resource: "navigation",
      action: "update",
      resourceId: parsedId.data,
      execute: async () => {
        await updateNavigationItemCommand(parsedId.data, input);
        return null;
      },
      afterSuccess: invalidateNavigationCache,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

function toSocialLinkInput(
  data: z.output<typeof socialFormSchema>,
): SocialLinkInput {
  return {
    platform: data.platform,
    url: data.url,
    isActive: data.isActive,
    showOnDesktop: data.showOnDesktop,
    showOnMobile: data.showOnMobile,
  };
}

export async function createSocialLinkAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, socialFormSchema, async (data) => {
    const input = toSocialLinkInput(data);
    const result = await executeAdminMutationResult({
      resource: "navigation",
      action: "create",
      execute: async () => createSocialLinkCommand(input),
      afterSuccess: invalidateNavigationCache,
      resolveAuditResourceId: (output) => output.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function updateSocialLinkAction(
  id: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, socialFormSchema, async (data) => {
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return { ok: false, error: "IDが不正です" };
    }

    const input = toSocialLinkInput(data);
    const result = await executeAdminMutationResult({
      resource: "navigation",
      action: "update",
      resourceId: parsedId.data,
      execute: async () => {
        await updateSocialLinkCommand(parsedId.data, input);
        return null;
      },
      afterSuccess: invalidateNavigationCache,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}
