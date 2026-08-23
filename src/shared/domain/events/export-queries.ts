import "server-only";

import { prisma } from "@/shared/db/prisma";
import { formatEventVenue } from "@/shared/lib/events/venue";
import {
  ADMIN_EXPORT_ROW_LIMIT,
  type ExportRowsResult,
} from "@/shared/domain/exports/limits";
import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";

const EVENT_REGISTRATION_EXPORT_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  note: true,
  quantity: true,
  status: true,
  cancelledAt: true,
  attendedAt: true,
  createdAt: true,
  event: {
    select: {
      title: true,
      addressDetail: true,
      location: { select: { name: true } },
      space: { select: { name: true } },
    },
  },
  slot: {
    select: { startAt: true, endAt: true },
  },
} as const satisfies Prisma.EventRegistrationSelect;

type EventRegistrationRow = Prisma.EventRegistrationGetPayload<{
  select: typeof EVENT_REGISTRATION_EXPORT_SELECT;
}>;

/** 会場表示を 1 本に畳んだ export 行。CSV / XLSX の両方がこの形を読む。 */
function toExportRow(row: EventRegistrationRow) {
  return {
    ...row,
    event: {
      title: row.event.title,
      startTime: row.slot.startAt,
      endTime: row.slot.endAt,
      location: formatEventVenue({
        location: row.event.location,
        space: row.event.space,
        addressDetail: row.event.addressDetail,
      }),
    },
  };
}

export type EventRegistrationExportRow = ReturnType<typeof toExportRow>;

/**
 * イベント申込 CSV / XLSX の行。**行数上限を受ける（監査 A-32）。**
 *
 * `eventId` は optional で、route は `scope: "all-events"` を明示的に許容する。
 * xlsx 分岐は workbook 全体をメモリに組んでから `writeBuffer()` するので、
 * 上限が無いと 1Gi・1 インスタンスの admin を落としうる。
 */
export async function getEventRegistrationsForExport(
  eventId?: string,
): Promise<ExportRowsResult<EventRegistrationExportRow>> {
  const where = {
    ...(eventId ? { eventId } : {}),
    event: { deletedAt: null },
  } satisfies Prisma.EventRegistrationWhereInput;

  const rows = await prisma.eventRegistration.findMany({
    where,
    select: EVENT_REGISTRATION_EXPORT_SELECT,
    orderBy: { createdAt: "desc" },
    take: ADMIN_EXPORT_ROW_LIMIT + 1,
  });

  if (rows.length > ADMIN_EXPORT_ROW_LIMIT) {
    return {
      truncated: true,
      totalCount: await prisma.eventRegistration.count({ where }),
    };
  }

  return { truncated: false, rows: rows.map(toExportRow) };
}
