import "server-only";

import type { NavigationType } from "@/shared/db/enums";
import {
  getNavigationItems as getNavigationItemsQuery,
  getSocialLinks as getSocialLinksQuery,
  type GetSocialLinksOptions,
  type NavigationItemData,
  type SocialLinkData,
} from "@/shared/domain/navigation/queries";
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
): Promise<SocialLinkData[]> {
  await requireAdminPermission("navigation", "read");
  return getSocialLinksQuery(options);
}
