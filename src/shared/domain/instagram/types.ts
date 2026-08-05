import type { Serialized } from "@/shared/lib/serialize";
import type { InstagramMediaType } from "@/shared/lib/validations/enums/prisma-types";

type InstagramPostRecord = {
  id: string;
  postId: string;
  postUrl: string;
  mediaUrl: string | null;
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
