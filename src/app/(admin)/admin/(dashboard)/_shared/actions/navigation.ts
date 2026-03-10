"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { purgeHomeCache } from "@/shared/lib/cloudflare";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result"
import {
  createNavigationItem as createNavigationItemCommand,
  createSocialLink as createSocialLinkCommand,
  deleteNavigationItem as deleteNavigationItemCommand,
  deleteSocialLink as deleteSocialLinkCommand,
  navigationItemInputSchema,
  navigationOrderInputSchema,
  socialLinkInputSchema,
  socialLinkOrderInputSchema,
  type NavigationItemInput,
  type SocialLinkInput,
  updateNavigationItem as updateNavigationItemCommand,
  updateNavigationOrder as updateNavigationOrderCommand,
  updateSocialLink as updateSocialLinkCommand,
  updateSocialLinkOrder as updateSocialLinkOrderCommand,
} from "@/shared/domain/navigation/commands";

function invalidateNavigationCache(): void {
  updateTag(CACHE_TAGS.NAVIGATION);
  fireAndForget(purgeHomeCache(), {
    operation: "purgeHomeCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
}

export async function createNavigationItem(
  data: NavigationItemInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = navigationItemInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "navigation",
    action: "create",
    execute: async () => createNavigationItemCommand(parsed.data),
    afterSuccess: invalidateNavigationCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateNavigationItem(
  id: string,
  data: NavigationItemInput,
): Promise<MutationResult> {
  const parsed = navigationItemInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "navigation",
    action: "update",
    resourceId: id,
    execute: async () => {
      await updateNavigationItemCommand(id, parsed.data);
      return null;
    },
    afterSuccess: invalidateNavigationCache,
  });
}

export async function deleteNavigationItem(
  id: string,
): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "navigation",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteNavigationItemCommand(id);
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

export async function createSocialLink(
  data: SocialLinkInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = socialLinkInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "navigation",
    action: "create",
    execute: async () => createSocialLinkCommand(parsed.data),
    afterSuccess: invalidateNavigationCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateSocialLink(
  id: string,
  data: SocialLinkInput,
): Promise<MutationResult> {
  const parsed = socialLinkInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "navigation",
    action: "update",
    resourceId: id,
    execute: async () => {
      await updateSocialLinkCommand(id, parsed.data);
      return null;
    },
    afterSuccess: invalidateNavigationCache,
  });
}

export async function deleteSocialLink(id: string): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "navigation",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteSocialLinkCommand(id);
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
