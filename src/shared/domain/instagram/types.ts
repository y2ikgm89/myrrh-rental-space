import type { Serialized } from "@/shared/lib/serialize";
import type { InstagramMediaType } from "@/shared/lib/validations/enums/prisma-types";

type InstagramPostRecord = {
  id: string;
  postId: string;
  postUrl: string;
  mediaUrl: string | null;
  /**
   * VIDEO 投稿の静止画。Graph API は VIDEO の mediaUrl に .mp4 を返し、
   * 画像は 	humbnailUrl にしか無い（監査 F-37）。
   */
  thumbnailUrl: string | null;
  mediaType: InstagramMediaType;
  caption: string | null;
  sortOrder: number;
  createdAt: Date;
};

export type InstagramConfig = {
  isConnected: boolean;
  username: string | null;
  accountType: string | null;
  tokenExpiresAt: string | null;
  tokenExpiryDays: number | null;
  shouldRefreshToken: boolean;
};

export type InstagramPostData = Serialized<InstagramPostRecord>;

export type SaveInstagramTokenResult = {
  username: string | undefined;
};

export type TestInstagramConnectionResult = {
  username: string | undefined;
  message: string;
};
