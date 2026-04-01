import "server-only";

import {
  getDeletedPagesListQuery,
  getPageBySlugQuery,
  getPageForPublicQuery,
  getPagesListQuery,
  getSystemPagesListQuery,
  type PageListQueryParams,
} from "@/shared/domain/pages/admin-queries";
import { getAssignedPageIdsForUser } from "@/shared/domain/user-page-assignments/queries";
import type { PageData, PageListResult } from "@/shared/domain/pages/types";
import {
  requireAdminPermission,
  requireAdminResourcePermission,
} from "./_helpers";
import { isEditorRole } from "@/admin/lib/permissions";

export type PagesListParams = PageListQueryParams;

async function getAllowedPageIds(userId: string): Promise<string[]> {
  return getAssignedPageIdsForUser(userId);
}

export async function getPagesList(
  params: PagesListParams = {},
): Promise<PageListResult> {
  const user = await requireAdminPermission("page", "read");
  const allowedPageIds = isEditorRole(user.role)
    ? await getAllowedPageIds(user.id)
    : undefined;
  return getPagesListQuery(params, allowedPageIds);
}

export async function getPageBySlug(slug: string): Promise<PageData | null> {
  await requireAdminPermission("page", "read");
  const page = await getPageBySlugQuery(slug);

  if (page) {
    await requireAdminResourcePermission("page", "read", page.id);
  }

  return page;
}

export async function getPageForPublic(slug: string): Promise<PageData | null> {
  return getPageForPublicQuery(slug);
}

export async function getDeletedPagesList(): Promise<PageData[]> {
  const user = await requireAdminPermission("page", "read");
  const allowedPageIds = isEditorRole(user.role)
    ? await getAllowedPageIds(user.id)
    : undefined;
  return getDeletedPagesListQuery(allowedPageIds);
}

export async function getSystemPagesList(): Promise<PageData[]> {
  const user = await requireAdminPermission("page", "read");
  const allowedPageIds = isEditorRole(user.role)
    ? await getAllowedPageIds(user.id)
    : undefined;
  return getSystemPagesListQuery(allowedPageIds);
}
