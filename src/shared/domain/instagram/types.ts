import type { InstagramFeedLayout } from "@/shared/db/enums";
import type { Serialized } from "@/shared/lib/serialize";

type InstagramPostRecord = {
  id: string;
  postId: string;
  postUrl: string;
  mediaUrl: string | null;
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
  feedEnabled: boolean;
  feedLayout: InstagramFeedLayout;
  feedColumns: number;
  feedMaxItems: number;
  showCaption: boolean;
  showViewAll: boolean;
};

export type InstagramPostData = Serialized<InstagramPostRecord>;

export type SaveInstagramTokenResult = {
  username: string | undefined;
};

export type TestInstagramConnectionResult = {
  username: string | undefined;
  message: string;
};
