import "server-only";

import { getGlobalBlockedDates as getGlobalBlockedDatesQuery } from "@/shared/domain/blocked-dates/queries";
import type { BlockedDateData } from "@/shared/domain/blocked-dates/types";
import { requireAdminPermission } from "./_helpers";

/** 全社休業日（scope=GLOBAL）を取得する。settings:read 必須。 */
export async function getGlobalBlockedDates(): Promise<BlockedDateData[]> {
  await requireAdminPermission("settings", "read");
  return getGlobalBlockedDatesQuery();
}
