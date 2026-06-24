import "server-only";

import { prisma } from "@/shared/db/prisma";
import { formatJstDateOnly } from "@/shared/lib/date-format";
import {
  BLOCKED_DATE_SCOPE,
  getValidBlockedDateScope,
  getValidBlockedDateType,
} from "@/shared/lib/validations/enums/helpers";
import type { BlockedDateData } from "@/shared/domain/blocked-dates/types";

const BLOCKED_DATE_SELECT = {
  id: true,
  scope: true,
  spaceId: true,
  locationId: true,
  startDate: true,
  endDate: true,
  reason: true,
  type: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

function formatBlockedDate(row: {
  id: string;
  scope: string;
  spaceId: string | null;
  locationId: string | null;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  type: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): BlockedDateData {
  return {
    id: row.id,
    scope: getValidBlockedDateScope(row.scope),
    spaceId: row.spaceId,
    locationId: row.locationId,
    startDate: formatJstDateOnly(row.startDate),
    endDate: formatJstDateOnly(row.endDate),
    reason: row.reason,
    type: getValidBlockedDateType(row.type),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** scope=SPACE の当該スペース専用 blocked dates（管理タブ用、開始日昇順） */
export async function getBlockedDatesForSpace(
  spaceId: string,
): Promise<BlockedDateData[]> {
  const rows = await prisma.blockedDate.findMany({
    where: { scope: BLOCKED_DATE_SCOPE.SPACE, spaceId },
    orderBy: { startDate: "asc" },
    select: BLOCKED_DATE_SELECT,
  });
  return rows.map(formatBlockedDate);
}

/** scope=LOCATION の当該拠点専用 blocked dates（管理タブ用、開始日昇順） */
export async function getBlockedDatesForLocation(
  locationId: string,
): Promise<BlockedDateData[]> {
  const rows = await prisma.blockedDate.findMany({
    where: { scope: BLOCKED_DATE_SCOPE.LOCATION, locationId },
    orderBy: { startDate: "asc" },
    select: BLOCKED_DATE_SELECT,
  });
  return rows.map(formatBlockedDate);
}

/** scope=GLOBAL の全社休業 blocked dates（管理ページ用、開始日昇順） */
export async function getGlobalBlockedDates(): Promise<BlockedDateData[]> {
  const rows = await prisma.blockedDate.findMany({
    where: { scope: BLOCKED_DATE_SCOPE.GLOBAL },
    orderBy: { startDate: "asc" },
    select: BLOCKED_DATE_SELECT,
  });
  return rows.map(formatBlockedDate);
}
