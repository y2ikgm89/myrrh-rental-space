import "server-only";

import {
  getAnnouncementBarById as getAnnouncementBarByIdQuery,
  getAnnouncementBars as getAnnouncementBarsQuery,
  type AnnouncementBarData,
} from "@/shared/domain/settings/announcement-bar";
import type { Serialized } from "@/shared/lib/serialize";
import { requireAdminPermission } from "./_helpers";

export type GetAnnouncementBarsResult = {
  items: Serialized<AnnouncementBarData>[];
  total: number;
};

export async function getAnnouncementBars(): Promise<GetAnnouncementBarsResult> {
  await requireAdminPermission("announcementBar", "read");
  const items = await getAnnouncementBarsQuery();
  return { items, total: items.length };
}

export async function getAnnouncementBarById(
  id: string,
): Promise<Serialized<AnnouncementBarData> | null> {
  await requireAdminPermission("announcementBar", "read");
  return getAnnouncementBarByIdQuery(id);
}
