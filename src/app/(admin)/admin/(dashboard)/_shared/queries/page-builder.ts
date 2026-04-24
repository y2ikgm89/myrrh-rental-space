import "server-only";

import { getPageBuilderForEditQuery } from "@/shared/domain/page-builder/queries";
import type { PageBuilderForEdit } from "@/shared/domain/page-builder/types";
import {
  requireAdminPermission,
  requireAdminResourcePermission,
} from "./_helpers";

export type { PageBuilderForEdit } from "@/shared/domain/page-builder/types";

export async function getPageBuilderForEdit(
  slug: string,
): Promise<PageBuilderForEdit | null> {
  await requireAdminPermission("page", "read");
  const page = await getPageBuilderForEditQuery(slug);

  if (page) {
    await requireAdminResourcePermission("page", "read", page.id);
  }

  return page;
}
