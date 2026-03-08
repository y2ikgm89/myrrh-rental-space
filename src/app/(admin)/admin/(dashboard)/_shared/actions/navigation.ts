"use server";

import { updateTag } from "next/cache";
import type { NavigationType } from "@/shared/db/enums";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationError } from "@/shared/lib/action-helpers";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { purgeHomeCache } from "@/shared/lib/cloudflare";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import {
  getNavigationItems as getNavigationItemsQuery,
  getSocialLinks as getSocialLinksQuery,
  type GetSocialLinksOptions,
  type NavigationItemData,
  type SocialLinkData,
} from "@/shared/domain/navigation/queries";
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

const checkReadPermission = checkReadPermissionFor("navigation");

function invalidateNavigationCache(): void {
  updateTag(CACHE_TAGS.NAVIGATION);
  fireAndForget(purgeHomeCache(), {
    operation: "purgeHomeCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
}

export async function getNavigationItems(
  type?: NavigationType,
): Promise<NavigationItemData[]> {
  if (!(await checkReadPermission())) {
    return [];
  }

  return getNavigationItemsQuery(type);
}

export async function getSocialLinks(
  options: GetSocialLinksOptions = {},
): Promise<SocialLinkData[]> {
  if (!(await checkReadPermission())) {
    return [];
  }

  return getSocialLinksQuery(options);
}

export async function createNavigationItem(
  data: NavigationItemInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = navigationItemInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "navigation",
    action: "create",
    execute: async () => createNavigationItemCommand(parsed.data),
    success: (result) =>
      createSuccess("ナビゲーションを作成しました", result),
    afterSuccess: invalidateNavigationCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateNavigationItem(
  id: string,
  data: NavigationItemInput,
): Promise<ActionResult<void>> {
  const parsed = navigationItemInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "navigation",
    action: "update",
    resourceId: id,
    execute: async () => {
      await updateNavigationItemCommand(id, parsed.data);
    },
    success: () => createSuccess("ナビゲーションを更新しました"),
    afterSuccess: invalidateNavigationCache,
  });
}

export async function deleteNavigationItem(
  id: string,
): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "navigation",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteNavigationItemCommand(id);
    },
    success: () => createSuccess("ナビゲーションを削除しました"),
    afterSuccess: invalidateNavigationCache,
  });
}

export async function updateNavigationOrder(
  items: { id: string; order: number; parentId?: string | null }[],
): Promise<ActionResult<void>> {
  const parsed = navigationOrderInputSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "navigation",
    action: "update",
    execute: async () => {
      await updateNavigationOrderCommand(parsed.data);
    },
    success: () => createSuccess("順序を更新しました"),
    afterSuccess: invalidateNavigationCache,
  });
}

export async function createSocialLink(
  data: SocialLinkInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = socialLinkInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "navigation",
    action: "create",
    execute: async () => createSocialLinkCommand(parsed.data),
    success: (result) => createSuccess("SNSリンクを作成しました", result),
    afterSuccess: invalidateNavigationCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateSocialLink(
  id: string,
  data: SocialLinkInput,
): Promise<ActionResult<void>> {
  const parsed = socialLinkInputSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "navigation",
    action: "update",
    resourceId: id,
    execute: async () => {
      await updateSocialLinkCommand(id, parsed.data);
    },
    success: () => createSuccess("SNSリンクを更新しました"),
    afterSuccess: invalidateNavigationCache,
  });
}

export async function deleteSocialLink(id: string): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "navigation",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteSocialLinkCommand(id);
    },
    success: () => createSuccess("SNSリンクを削除しました"),
    afterSuccess: invalidateNavigationCache,
  });
}

export async function updateSocialLinkOrder(
  items: { id: string; order: number }[],
): Promise<ActionResult<void>> {
  const parsed = socialLinkOrderInputSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "navigation",
    action: "update",
    execute: async () => {
      await updateSocialLinkOrderCommand(parsed.data);
    },
    success: () => createSuccess("順序を更新しました"),
    afterSuccess: invalidateNavigationCache,
  });
}
