import "server-only";

import {
  getAnnouncementBarById as getAnnouncementBarByIdQuery,
  getAnnouncementBars as getAnnouncementBarsQuery,
  type AnnouncementBarData,
} from "@/shared/domain/settings/announcement-bar";
import { requireAdminPermission } from "./_helpers";

export type GetAnnouncementBarsResult = {
  items: AnnouncementBarData[];
  total: number;
};

export async function getAnnouncementBars(): Promise<GetAnnouncementBarsResult> {
  await requireAdminPermission("announcementBar", "read");
  const items = await getAnnouncementBarsQuery();
  return { items, total: items.length };
}

export async function getAnnouncementBarById(
  id: string,
): Promise<AnnouncementBarData | null> {
  await requireAdminPermission("announcementBar", "read");
  return getAnnouncementBarByIdQuery(id);
}
