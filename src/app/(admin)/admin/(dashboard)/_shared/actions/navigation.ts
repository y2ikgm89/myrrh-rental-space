"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { purgeHomeCache } from "@/shared/lib/cloudflare";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
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
  updateNavigationOrder as updateNavigationOrderCommand,
  updateSocialLink as updateSocialLinkCommand,
  updateSocialLinkOrder as updateSocialLinkOrderCommand,
} from "@/shared/domain/navigation/commands";
import {
  navFormSchema,
  socialFormSchema,
} from "../../settings/appearance/_components/navigation/nav-form-schema";

const idSchema = z.string().uuid({ error: "IDが不正です" });

function invalidateNavigationCache(): void {
  updateTag(CACHE_TAGS.NAVIGATION);
  fireAndForget(purgeHomeCache(), {
    operation: "purgeHomeCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
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
// Conform `useActionState` 用 Server Actions (Phase 1 Task 8.2)
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
    order: data.order,
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
    order: data.order,
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
