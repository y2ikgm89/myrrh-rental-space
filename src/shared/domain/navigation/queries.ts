import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import type { NavigationType, SocialPlatform } from "@/shared/db/enums";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import { toPlainArray } from "@/shared/lib/serialize";

export type PublicNavItem = {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly isExternal: boolean;
  readonly children: readonly PublicNavItem[];
};

export type NavigationItemData = {
  id: string;
  type: NavigationType;
  parentId: string | null;
  label: string;
  url: string;
  isExternal: boolean;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  children: NavigationItemData[];
};

export type SocialLinkData = {
  id: string;
  platform: SocialPlatform;
  url: string;
  iconUrl: string | null;
  order: number;
  isActive: boolean;
  showOnDesktop: boolean;
  showOnMobile: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type GetSocialLinksOptions = {
  showOnDesktop?: boolean;
  showOnMobile?: boolean;
  activeOnly?: boolean;
};

const EMPTY_NAV_CHILDREN: readonly PublicNavItem[] = Object.freeze([]);

export async function getPublicNavigation(
  type: NavigationType,
): Promise<readonly PublicNavItem[]> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.NAVIGATION);

  const items = await prisma.navigationItem.findMany({
    where: {
      type,
      parentId: null,
      isActive: true,
    },
    select: {
      id: true,
      label: true,
      url: true,
      isExternal: true,
      children: {
        where: { isActive: true },
        orderBy: { order: "asc" },
        select: {
          id: true,
          label: true,
          url: true,
          isExternal: true,
        },
      },
    },
    orderBy: { order: "asc" },
  });

  return items.map((item) => ({
    id: item.id,
    label: item.label,
    url: item.url,
    isExternal: item.isExternal,
    children: item.children.map((child) => ({
      id: child.id,
      label: child.label,
      url: child.url,
      isExternal: child.isExternal,
      children: EMPTY_NAV_CHILDREN,
    })),
  }));
}

export async function getHeaderNavigation(): Promise<readonly PublicNavItem[]> {
  return getPublicNavigation("HEADER_DESKTOP");
}

export async function getFooterNavigation(): Promise<readonly PublicNavItem[]> {
  return getPublicNavigation("FOOTER");
}

export async function getNavigationItems(
  type?: NavigationType,
): Promise<NavigationItemData[]> {
  const items = await prisma.navigationItem.findMany({
    where: type ? { type, parentId: null } : { parentId: null },
    select: {
      id: true,
      type: true,
      parentId: true,
      label: true,
      url: true,
      isExternal: true,
      order: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      children: {
        select: {
          id: true,
          type: true,
          parentId: true,
          label: true,
          url: true,
          isExternal: true,
          order: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });

  return items.map((item) => ({
    ...item,
    children: item.children.map((child) => ({
      ...child,
      children: [],
    })),
  }));
}

export async function getSocialLinks(
  options: GetSocialLinksOptions = {},
): Promise<SocialLinkData[]> {
  const { showOnDesktop, showOnMobile, activeOnly = false } = options;

  return toPlainArray(
    await prisma.socialLink.findMany({
      where: {
        ...(activeOnly ? { isActive: true } : {}),
        ...(showOnDesktop !== undefined ? { showOnDesktop } : {}),
        ...(showOnMobile !== undefined ? { showOnMobile } : {}),
      },
      select: {
        id: true,
        platform: true,
        url: true,
        iconUrl: true,
        order: true,
        isActive: true,
        showOnDesktop: true,
        showOnMobile: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { order: "asc" },
    }),
  );
}
