import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { safeDecrypt } from "@/shared/lib/crypto";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainArray } from "@/shared/lib/serialize";
import { getTokenExpiryDays, shouldRefreshToken } from "@/shared/lib/instagram";
import type {
  InstagramConfig,
  InstagramPostData,
} from "@/shared/domain/instagram/types";

export async function getInstagramConfig(): Promise<InstagramConfig> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      instagramAccessToken: true,
      instagramTokenExpiresAt: true,
      instagramUserId: true,
      instagramUsername: true,
      instagramAccountType: true,
    },
  });

  const isConnected = Boolean(
    settings?.instagramAccessToken && settings?.instagramUserId,
  );

  const tokenExpiresAt = settings?.instagramTokenExpiresAt ?? null;
  const tokenExpiryDays = tokenExpiresAt
    ? getTokenExpiryDays(tokenExpiresAt)
    : null;
  const needsRefresh = tokenExpiresAt
    ? shouldRefreshToken(tokenExpiresAt)
    : false;

  return {
    isConnected,
    username: settings?.instagramUsername ?? null,
    accountType: settings?.instagramAccountType ?? null,
    tokenExpiresAt: tokenExpiresAt?.toISOString() ?? null,
    tokenExpiryDays,
    shouldRefreshToken: needsRefresh,
  };
}

export async function getInstagramPosts(): Promise<InstagramPostData[]> {
  "use cache";
  cacheTag(CACHE_TAGS.INSTAGRAM_FEED);
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);

  const posts = await safeFetch({
    fetch: () =>
      prisma.instagramPost.findMany({
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          postId: true,
          postUrl: true,
          mediaUrl: true,
          mediaType: true,
          caption: true,
          sortOrder: true,
          createdAt: true,
        },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getInstagramPosts",
  });

  return toPlainArray(
    posts.map((post) => ({
      ...post,
      createdAt: post.createdAt.toISOString(),
    })),
  );
}

export async function getDecryptedInstagramToken(): Promise<string | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { instagramAccessToken: true },
  });

  if (!settings?.instagramAccessToken) {
    return null;
  }

  return safeDecrypt(settings.instagramAccessToken);
}

export async function getInstagramRefreshState(): Promise<{
  encryptedAccessToken: string | null;
  tokenExpiresAt: Date | null;
  userId: string | null;
  username: string | null;
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      instagramAccessToken: true,
      instagramTokenExpiresAt: true,
      instagramUserId: true,
      instagramUsername: true,
    },
  });

  return {
    encryptedAccessToken: settings?.instagramAccessToken ?? null,
    tokenExpiresAt: settings?.instagramTokenExpiresAt ?? null,
    userId: settings?.instagramUserId ?? null,
    username: settings?.instagramUsername ?? null,
  };
}
