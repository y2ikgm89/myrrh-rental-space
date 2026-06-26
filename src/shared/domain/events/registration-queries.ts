import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RegistrationStatus } from "@generated/prisma/enums";
import { formatEventVenue } from "@/shared/domain/events/venue";
import { paginate } from "@/shared/lib/pagination";

/** 管理画面イベント詳細の参加者一覧 1 ページあたり件数。 */
export const EVENT_REGISTRATIONS_PER_PAGE = 20;

/**
 * 管理画面イベント詳細の参加者一覧をページネーション付きで取得する。
 *
 * 申込が多いイベントでも全件をメモリに読み込まないよう `skip` / `take` で絞り、
 * 一覧総数（`total`）と確定申込数（`confirmedCount`）を count クエリで併せて返す。
 */
export async function getEventRegistrations(
  eventId: string,
  options: { page?: number; perPage?: number } = {},
) {
  const {
    skip,
    take,
    page,
    limit: perPage,
  } = paginate({
    page: options.page,
    limit: options.perPage ?? EVENT_REGISTRATIONS_PER_PAGE,
  });
  const where = { eventId, event: { deletedAt: null } };

  const [registrations, total, confirmedCount] = await Promise.all([
    prisma.eventRegistration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
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
      },
    }),
    prisma.eventRegistration.count({ where }),
    prisma.eventRegistration.count({
      where: { ...where, status: RegistrationStatus.CONFIRMED },
    }),
  ]);

  return { registrations, total, confirmedCount, page, perPage };
}

/**
 * 当日受付 (check-in) 画面向けに、確定済 (CONFIRMED) 申込を**全件**取得する。
 *
 * - 検索/フィルタはクライアント側で実行するため全件返却 (1 イベント数十〜数百名想定)
 * - CANCELLED は除外 (受付対象外)
 * - select は受付に必要な最小カラム (note は除外、CSV は別 query で扱う)
 * - 進捗カウンタ用に attendedCount (出席済件数) も併せて返す
 */
export async function getEventCheckInAttendees(eventId: string) {
  const where = {
    eventId,
    event: { deletedAt: null },
    status: RegistrationStatus.CONFIRMED,
  };

  const [registrations, attendedCount] = await Promise.all([
    prisma.eventRegistration.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        quantity: true,
        attendedAt: true,
        createdAt: true,
        ticket: { select: { id: true, name: true } },
      },
    }),
    prisma.eventRegistration.count({
      where: { ...where, attendedAt: { not: null } },
    }),
  ]);

  return {
    registrations,
    total: registrations.length,
    attendedCount,
  };
}

export async function getRegistrationCount(eventId: string) {
  const result = await prisma.eventRegistration.aggregate({
    where: { eventId, status: RegistrationStatus.CONFIRMED },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

export async function getEventDetailsForEmail(eventId: string): Promise<{
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location: string | null;
  readonly capacity: number | null;
  readonly confirmedCount: number;
} | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      addressDetail: true,
      location: { select: { name: true } },
      space: { select: { name: true } },
      slots: {
        select: { startAt: true, endAt: true, capacity: true },
        orderBy: { startAt: "asc" as const },
        take: 1,
      },
      _count: {
        select: {
          registrations: {
            where: { status: RegistrationStatus.CONFIRMED },
          },
        },
      },
    },
  });
  if (!event) return null;
  const firstSlot = event.slots[0];
  return {
    startTime: firstSlot?.startAt ?? new Date(0),
    endTime: firstSlot?.endAt ?? new Date(0),
    location: formatEventVenue({
      location: event.location,
      space: event.space,
      addressDetail: event.addressDetail,
    }),
    capacity: firstSlot?.capacity ?? null,
    confirmedCount: event._count.registrations,
  };
}

const CUSTOMER_EVENT_REGISTRATION_SELECT = {
  id: true,
  quantity: true,
  status: true,
  cancelledAt: true,
  createdAt: true,
  slot: {
    select: {
      startAt: true,
      endAt: true,
    },
  },
  event: {
    select: {
      id: true,
      title: true,
      slug: true,
      addressDetail: true,
      status: true,
      location: { select: { name: true } },
      space: { select: { name: true } },
    },
  },
} as const;

type CustomerEventRegistrationRow = {
  readonly id: string;
  readonly quantity: number;
  readonly status: RegistrationStatus;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
  readonly slot: {
    readonly startAt: Date;
    readonly endAt: Date;
  } | null;
  readonly event: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
    readonly addressDetail: string | null;
    readonly status: string;
    readonly location: { readonly name: string } | null;
    readonly space: { readonly name: string } | null;
  };
};

function mapCustomerEventRegistration(row: CustomerEventRegistrationRow) {
  return {
    id: row.id,
    quantity: row.quantity,
    status: row.status,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    event: {
      id: row.event.id,
      title: row.event.title,
      slug: row.event.slug,
      startTime: row.slot?.startAt ?? new Date(0),
      endTime: row.slot?.endAt ?? new Date(0),
      status: row.event.status,
      location: formatEventVenue({
        location: row.event.location,
        space: row.event.space,
        addressDetail: row.event.addressDetail,
      }),
    },
  };
}

/**
 * 顧客のイベント申込を「これから / 過去」に分けて取得する。
 *
 * - active: CONFIRMED かつスロット終了時刻 > now（開始日時の近い順）
 * - past: CANCELLED またはスロット終了時刻 <= now（直近に終わった順）
 *
 * 時刻判定をドメイン層で完結させることで、呼び出し側 (RSC) は `Date.now()` を
 * render 中に呼ばずに済む（React Compiler purity rule 準拠）。
 */
export async function getCustomerEventRegistrations(
  customerId: string,
): Promise<{
  readonly active: ReturnType<typeof mapCustomerEventRegistration>[];
  readonly past: ReturnType<typeof mapCustomerEventRegistration>[];
}> {
  const now = new Date();
  const baseEventWhere = { deletedAt: null } as const;

  const [activeRows, pastRows] = await Promise.all([
    prisma.eventRegistration.findMany({
      where: {
        customerId,
        status: RegistrationStatus.CONFIRMED,
        event: baseEventWhere,
        slot: { endAt: { gt: now } },
      },
      orderBy: { slot: { startAt: "asc" } },
      select: CUSTOMER_EVENT_REGISTRATION_SELECT,
    }),
    prisma.eventRegistration.findMany({
      where: {
        customerId,
        event: baseEventWhere,
        OR: [
          { status: RegistrationStatus.CANCELLED },
          { slot: { endAt: { lte: now } } },
        ],
      },
      orderBy: { slot: { startAt: "desc" } },
      select: CUSTOMER_EVENT_REGISTRATION_SELECT,
    }),
  ]);

  return {
    active: activeRows.map(mapCustomerEventRegistration),
    past: pastRows.map(mapCustomerEventRegistration),
  };
}

/**
 * イベント申込の .ics 生成に必要なフィールドを取得する。
 *
 * - `customerId` を渡した場合: 所有者一致を where 条件で強制 (会員セッション経路)
 * - `customerId` を省略した場合: ID 一致のみで取得 (ゲスト用署名付きトークン経路。
 *   トークン検証側でアクセス権を担保するため、ここでは ownership 強制をしない)
 */
export async function getEventRegistrationForCalendar(params: {
  registrationId: string;
  customerId?: string | undefined;
}): Promise<{
  id: string;
  eventTitle: string;
  customerName: string;
  startTime: Date;
  endTime: Date;
  location: string | null;
  quantity: number;
  icsSequence: number;
  status: RegistrationStatus;
} | null> {
  const reg = await prisma.eventRegistration.findFirst({
    where: {
      id: params.registrationId,
      ...(params.customerId !== undefined
        ? { customerId: params.customerId }
        : {}),
      event: { deletedAt: null },
    },
    select: {
      id: true,
      name: true,
      quantity: true,
      icsSequence: true,
      status: true,
      slot: {
        select: { startAt: true, endAt: true },
      },
      event: {
        select: {
          title: true,
          addressDetail: true,
          location: { select: { name: true } },
          space: { select: { name: true } },
        },
      },
    },
  });
  if (!reg) return null;
  return {
    id: reg.id,
    eventTitle: reg.event.title,
    customerName: reg.name,
    startTime: reg.slot?.startAt ?? new Date(0),
    endTime: reg.slot?.endAt ?? new Date(0),
    location: formatEventVenue({
      location: reg.event.location,
      space: reg.event.space,
      addressDetail: reg.event.addressDetail,
    }),
    quantity: reg.quantity,
    icsSequence: reg.icsSequence,
    status: reg.status,
  };
}
