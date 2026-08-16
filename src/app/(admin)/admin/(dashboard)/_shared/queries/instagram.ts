import "server-only";

import { getInstagramConfig as getInstagramConfigQuery } from "@/shared/domain/instagram/queries";
import type { InstagramConfig } from "@/shared/domain/instagram/types";
import { requireAdminPermission } from "./_helpers";

export type { InstagramConfig };

export async function getInstagramConfig(): Promise<InstagramConfig> {
  await requireAdminPermission("settings", "manage");
  return getInstagramConfigQuery();
}
