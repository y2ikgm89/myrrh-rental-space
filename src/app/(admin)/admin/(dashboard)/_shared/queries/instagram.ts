import "server-only";

import {
  getDecryptedInstagramToken as getDecryptedInstagramTokenQuery,
  getInstagramConfig as getInstagramConfigQuery,
  getInstagramPosts as getInstagramPostsQuery,
} from "@/shared/domain/instagram/queries";
import type {
  InstagramConfig,
  InstagramPostData,
} from "@/shared/domain/instagram/types";
import { requireAdminPermission } from "./_helpers";

export type { InstagramConfig, InstagramPostData };

export async function getInstagramConfig(): Promise<InstagramConfig> {
  await requireAdminPermission("settings", "read");
  return getInstagramConfigQuery();
}

export async function getInstagramPosts(): Promise<InstagramPostData[]> {
  await requireAdminPermission("settings", "read");
  return getInstagramPostsQuery();
}

export async function getDecryptedInstagramToken(): Promise<string | null> {
  await requireAdminPermission("settings", "read");
  return getDecryptedInstagramTokenQuery();
}
