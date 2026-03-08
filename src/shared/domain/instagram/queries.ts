import "server-only";

import { prisma } from "@/shared/db/prisma";
import { InstagramFeedLayout } from "@/shared/db/enums";
import { safeDecrypt } from "@/shared/lib/crypto";
import { getValidInstagramFeedLayout } from "@/shared/lib/validations/enums";
import {
  getTokenExpiryDays,
  shouldRefreshToken,
} from "@/shared/lib/instagram";
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
      instagramFeedEnabled: true,
      instagramFeedLayout: true,
      instagramFeedColumns: true,
      instagramFeedMaxItems: true,
      instagramShowCaption: true,
      instagramShowViewAll: true,
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
    feedEnabled: settings?.instagramFeedEnabled ?? false,
    feedLayout: getValidInstagramFeedLayout(
      settings?.instagramFeedLayout ?? InstagramFeedLayout.grid,
    ),
    feedColumns: settings?.instagramFeedColumns ?? 4,
    feedMaxItems: settings?.instagramFeedMaxItems ?? 8,
    showCaption: settings?.instagramShowCaption ?? false,
    showViewAll: settings?.instagramShowViewAll ?? true,
  };
}

export async function getInstagramPosts(): Promise<InstagramPostData[]> {
  const posts = await prisma.instagramPost.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      postId: true,
      postUrl: true,
      mediaUrl: true,
      caption: true,
      sortOrder: true,
      createdAt: true,
    },
  });

  return posts.map((post) => ({
    ...post,
    createdAt: post.createdAt.toISOString(),
  }));
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
