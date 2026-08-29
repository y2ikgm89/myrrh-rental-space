import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import type {
  NavigationType,
  SocialPlatform,
} from "@/shared/lib/validations/enums/prisma-types";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import {
  getFeatureFilterContext,
  isUrlDisabled,
} from "@/shared/domain/features/check";
import { toPlainArray } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";
import { spanArraySchema } from "@/shared/lib/portable-text/schema";
import type { PortableTextSpan } from "@/shared/lib/portable-text";

function parseLabelSpans(value: unknown): PortableTextSpan[] {
  const result = spanArraySchema.safeParse(value);
  return result.success ? result.data : [];
}

export type PublicNavItem = {
  readonly id: string;
  readonly label: PortableTextSpan[];
  readonly url: string;
  readonly isExternal: boolean;
  readonly children: readonly PublicNavItem[];
};

export type NavigationItemData = {
  id: string;
  type: NavigationType;
  parentId: string | null;
  label: PortableTextSpan[];
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

/**
 * DB からナビ項目を読む。**feature module のフィルタはここに入れない。**
 *
 * ここは `STATIC_SETTINGS`（days）で正しい — ナビの中身は管理画面で編集されるまで
 * 変わらないし、編集時は `NAVIGATION` タグの無効化で落ちる。
 *
 * かつては feature フィルタもこの `'use cache'` の中にあった。フィルタが読む
 * `getFeatureModulesSettings` は kill switch なので `FEATURE_FLAGS`（minutes）
 * なのに、**その結果を days のキャッシュが包んでしまう**ため、機能を OFF にしても
 * ナビには最大で days のあいだ 404 になるリンクが並び続けた。
 * `CACHE_LIFE.FEATURE_FLAGS` の docstring が「反映上限は約 1 分」と宣言している
 * その上限が、ナビだけ成立していなかった（監査 F-65 と同じ形）。
 *
 * 短命プロファイルへ倒す案は取らない。ナビ本体まで毎分読み直すことになり、
 * 「変わらないものを短命にする」という別の誤りになる。**寿命の違うものを
 * 同じキャッシュに入れない**のが直し方。
 */
async function getNavigationItemsCached(type: NavigationType): Promise<
  ReadonlyArray<{
    id: string;
    label: unknown;
    url: string;
    isExternal: boolean;
    children: ReadonlyArray<{
      id: string;
      label: unknown;
      url: string;
      isExternal: boolean;
    }>;
  }>
> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.NAVIGATION);

  const items = await safeFetch({
    fetch: () =>
      prisma.navigationItem.findMany({
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
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicNavigation",
  });

  return items;
}

/**
 * 公開ナビ。DB の中身（days キャッシュ）と feature module の ON/OFF（minutes）を
 * **別々に読んでから**合成する。合成そのものは純粋なのでキャッシュしない。
 */
export async function getPublicNavigation(
  type: NavigationType,
): Promise<readonly PublicNavItem[]> {
  const items = await getNavigationItemsCached(type);

  const ctx = await getFeatureFilterContext();

  // disabled module の publicRoutes に path が hit する URL は除外。
  // isExternal（絶対 URL）も含む — `isUrlDisabled` が pathname を抽出して判定する。
  const isItemEnabled = (url: string): boolean =>
    !isUrlDisabled(url, ctx.disabledRoutes);

  return items
    .filter((item) => isItemEnabled(item.url))
    .map((item) => ({
      id: item.id,
      label: parseLabelSpans(item.label),
      url: item.url,
      isExternal: item.isExternal,
      children: item.children
        .filter((child) => isItemEnabled(child.url))
        .map((child) => ({
          id: child.id,
          label: parseLabelSpans(child.label),
          url: child.url,
          isExternal: child.isExternal,
          children: EMPTY_NAV_CHILDREN,
        })),
    }));
}

export async function getHeaderNavigation(): Promise<readonly PublicNavItem[]> {
  return getPublicNavigation("HEADER_DESKTOP");
}

export async function getMobileHeaderNavigation(): Promise<
  readonly PublicNavItem[]
> {
  return getPublicNavigation("HEADER_MOBILE");
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
    label: parseLabelSpans(item.label),
    children: item.children.map((child) => ({
      ...child,
      label: parseLabelSpans(child.label),
      children: [],
    })),
  }));
}

export async function getSocialLinks(
  options: GetSocialLinksOptions = {},
): Promise<Serialized<SocialLinkData>[]> {
  const { showOnDesktop, showOnMobile, activeOnly = false } = options;

  return toPlainArray(
    await safeFetch({
      fetch: () =>
        prisma.socialLink.findMany({
          where: {
            ...(activeOnly ? { isActive: true } : {}),
            ...(showOnDesktop !== undefined ? { showOnDesktop } : {}),
            ...(showOnMobile !== undefined ? { showOnMobile } : {}),
          },
          select: {
            id: true,
            platform: true,
            url: true,
            order: true,
            isActive: true,
            showOnDesktop: true,
            showOnMobile: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { order: "asc" },
        }),
      fallback: [],
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getSocialLinks",
    }),
  );
}
