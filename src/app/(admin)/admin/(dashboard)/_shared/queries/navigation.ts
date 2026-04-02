import "server-only";

import type { NavigationType } from "@generated/prisma/enums";
import {
  getNavigationItems as getNavigationItemsQuery,
  getSocialLinks as getSocialLinksQuery,
  type GetSocialLinksOptions,
  type NavigationItemData,
  type SocialLinkData,
} from "@/shared/domain/navigation/queries";
import type { Serialized } from "@/shared/lib/serialize";
import { requireAdminPermission } from "./_helpers";

export type { GetSocialLinksOptions, NavigationItemData, SocialLinkData };

export async function getNavigationItems(
  type?: NavigationType,
): Promise<NavigationItemData[]> {
  await requireAdminPermission("navigation", "read");
  return getNavigationItemsQuery(type);
}

export async function getSocialLinks(
  options: GetSocialLinksOptions = {},
): Promise<Serialized<SocialLinkData>[]> {
  await requireAdminPermission("navigation", "read");
  return getSocialLinksQuery(options);
}
