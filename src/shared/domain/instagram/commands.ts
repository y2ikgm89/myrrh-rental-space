import "server-only";

import { prisma } from "@/shared/db/prisma";
import { InstagramMediaType } from "@generated/prisma/enums";
import { encrypt } from "@/shared/lib/crypto";
import type { InstagramSettingsInput } from "@/shared/lib/validations/instagram";
import { DomainError } from "@/shared/domain/domain-error";
import { testInstagramConnection } from "@/shared/lib/instagram";
import type { InstagramMediaItem } from "@/shared/lib/instagram";
import type { SaveInstagramTokenResult } from "@/shared/domain/instagram/types";

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

export async function updateInstagramSettings(
  input: InstagramSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      instagramFeedEnabled: input.feedEnabled,
      instagramFeedLayout: input.feedLayout,
      instagramFeedColumns: input.feedColumns,
      instagramFeedMaxItems: input.feedMaxItems,
      instagramShowCaption: input.showCaption,
      instagramShowViewAll: input.showViewAll,
    },
    update: {
      instagramFeedEnabled: input.feedEnabled,
      instagramFeedLayout: input.feedLayout,
      instagramFeedColumns: input.feedColumns,
      instagramFeedMaxItems: input.feedMaxItems,
      instagramShowCaption: input.showCaption,
      instagramShowViewAll: input.showViewAll,
    },
  });
}

export async function saveInstagramToken(
  token: string,
): Promise<SaveInstagramTokenResult> {
  const testResult = await testInstagramConnection(token);
  if (!testResult.success) {
    throw new DomainError(
      testResult.error || "接続テストに失敗しました",
      "VALIDATION",
    );
  }

  const metadata = testResult.metadata;
  const userId = getMetadataString(metadata, "userId");
  const username = getMetadataString(metadata, "username");
  const accountType = getMetadataString(metadata, "accountType");

  let encryptedToken: string;
  try {
    encryptedToken = encrypt(token, { purpose: "instagram" });
  } catch {
    throw new DomainError("トークンの暗号化に失敗しました", "UNEXPECTED");
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 60);

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      instagramAccessToken: encryptedToken,
      instagramTokenExpiresAt: expiresAt,
      instagramUserId: userId ?? null,
      instagramUsername: username ?? null,
      instagramAccountType: accountType ?? null,
    },
    update: {
      instagramAccessToken: encryptedToken,
      instagramTokenExpiresAt: expiresAt,
      instagramUserId: userId ?? null,
      instagramUsername: username ?? null,
      instagramAccountType: accountType ?? null,
    },
  });

  return { username };
}

export async function connectInstagramOAuthAccount(input: {
  accessToken: string;
  expiresIn: number;
  userId: string;
  username: string;
  accountType: string | null;
}): Promise<void> {
  const encryptedToken = encrypt(input.accessToken, { purpose: "instagram" });
  const expiresAt = new Date(Date.now() + input.expiresIn * 1000);

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      instagramAccessToken: encryptedToken,
      instagramTokenExpiresAt: expiresAt,
      instagramUserId: input.userId,
      instagramUsername: input.username,
      instagramAccountType: input.accountType,
    },
    update: {
      instagramAccessToken: encryptedToken,
      instagramTokenExpiresAt: expiresAt,
      instagramUserId: input.userId,
      instagramUsername: input.username,
      instagramAccountType: input.accountType,
    },
  });
}

export async function refreshInstagramAccessToken(input: {
  accessToken: string;
  expiresAt: Date;
}): Promise<void> {
  const encryptedToken = encrypt(input.accessToken, { purpose: "instagram" });

  await prisma.settings.updateMany({
    data: {
      instagramAccessToken: encryptedToken,
      instagramTokenExpiresAt: input.expiresAt,
    },
  });
}

export async function disconnectInstagram(): Promise<void> {
  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      instagramAccessToken: null,
      instagramTokenExpiresAt: null,
      instagramUserId: null,
      instagramUsername: null,
      instagramAccountType: null,
    },
  });

  await prisma.instagramPost.deleteMany({});
}

/**
 * Instagram フィードをAPIデータで同期（全件入れ替え）
 *
 * @param items - fetchInstagramFeed から取得したメディアアイテム配列
 */
export async function syncInstagramFeed(
  items: InstagramMediaItem[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 既存投稿を全削除
    await tx.instagramPost.deleteMany({});

    // 新しいデータを一括作成
    if (items.length > 0) {
      await tx.instagramPost.createMany({
        data: items.map((item, index) => ({
          postId: item.id,
          postUrl: item.permalink,
          mediaUrl: item.mediaUrl,
          caption: item.caption ?? null,
          mediaType: mapMediaType(item.mediaType),
          permalink: item.permalink,
          thumbnailUrl: item.thumbnailUrl ?? null,
          sortOrder: index,
        })),
      });
    }
  });
}

/**
 * API レスポンスの mediaType 文字列を Prisma enum にマッピング
 */
function mapMediaType(mediaType: string): InstagramMediaType {
  switch (mediaType) {
    case "IMAGE":
      return InstagramMediaType.IMAGE;
    case "VIDEO":
      return InstagramMediaType.VIDEO;
    case "CAROUSEL_ALBUM":
      return InstagramMediaType.CAROUSEL_ALBUM;
    default:
      return InstagramMediaType.IMAGE;
  }
}
