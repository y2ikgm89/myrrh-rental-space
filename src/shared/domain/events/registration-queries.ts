import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  RegistrationStatus,
  type PaymentStatus,
} from "@generated/prisma/enums";
import { formatEventVenue } from "@/shared/domain/events/venue";
import { paginate } from "@/shared/lib/pagination";
import { ACTIVE_REGISTRATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import type { EventFormatValue } from "@/shared/lib/validations/enums/prisma-types";

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
        // task #9 PR#5 task B (admin event refund UI): 表側で refund ボタンの表示可否と
        // RefundDialog の残額計算に使う。既存の cancel カラムはそのまま。
        paymentStatus: true,
        paidAmount: true,
        stripePaymentIntentId: true,
        refunds: { select: { amount: true } },
        slot: {
          select: {
            startAt: true,
            endAt: true,
          },
        },
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
 */
export async function getEventCheckInAttendees(eventId: string) {
  const where = {
    eventId,
    event: { deletedAt: null },
    status: RegistrationStatus.CONFIRMED,
  };

  const registrations = await prisma.eventRegistration.findMany({
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
  });

  const totalQuantity = registrations.reduce(
    (sum, registration) => sum + registration.quantity,
    0,
  );
  const attendedQuantity = registrations.reduce(
    (sum, registration) =>
      sum + (registration.attendedAt === null ? 0 : registration.quantity),
    0,
  );

  return {
    registrations,
    totalRegistrations: registrations.length,
    totalQuantity,
    attendedQuantity,
  };
}

/**
 * ゲストキャンセルページ向けに申込を取得する。
 *
 * `customerId` フィルタを掛けない（トークン検証側でアクセス権を担保する。
 * `reservations/customer-queries.ts` の `getReservationForGuestCancel` と同型）。
 * `customerId` は member-ownership ガード（ログイン中ユーザーが別人の申込を
 * キャンセルしようとしていないかの突合）のために呼び出し側へ返す。
 */
export async function getEventRegistrationForGuestCancel(
  registrationId: string,
) {
  return prisma.eventRegistration.findFirst({
    where: { id: registrationId, event: { deletedAt: null } },
    select: {
      id: true,
      customerId: true,
      status: true,
      quantity: true,
      name: true,
      event: { select: { title: true } },
      slot: { select: { startAt: true, endAt: true } },
    },
  });
}

export async function getEventRegistrationDetailsForEmail(
  registrationId: string,
): Promise<{
  readonly eventTitle: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location: string | null;
  readonly capacity: number;
  readonly confirmedCount: number;
  readonly format: EventFormatValue;
  readonly meetingUrl: string | null;
} | null> {
  const registration = await prisma.eventRegistration.findFirst({
    where: { id: registrationId, event: { deletedAt: null } },
    select: {
      id: true,
      eventId: true,
      slotId: true,
      slot: {
        select: {
          startAt: true,
          endAt: true,
          capacity: true,
        },
      },
      event: {
        select: {
          title: true,
          format: true,
          meetingUrl: true,
          addressDetail: true,
          location: { select: { name: true } },
          space: { select: { name: true } },
        },
      },
    },
  });
  if (!registration) return null;

  const confirmed = await prisma.eventRegistration.aggregate({
    where: {
      slotId: registration.slotId,
      status: RegistrationStatus.CONFIRMED,
    },
    _sum: { quantity: true },
  });

  return {
    eventTitle: registration.event.title,
    startTime: registration.slot.startAt,
    endTime: registration.slot.endAt,
    location: formatEventVenue({
      location: registration.event.location,
      space: registration.event.space,
      addressDetail: registration.event.addressDetail,
    }),
    capacity: registration.slot.capacity,
    confirmedCount: confirmed._sum.quantity ?? 0,
    format: registration.event.format,
    meetingUrl: registration.event.meetingUrl,
  };
}

/**
 * `/claim/event-registration` の要約表示用の軽量クエリ。
 *
 * `getEventRegistrationDetailsForEmail` は `{startTime, endTime, location,
 * capacity, confirmedCount}` のみを返し `event.title` を含まないため、
 * claim ページ用に専用のクエリを設ける（イベント名表示が必須のため）。
 */
export async function getEventRegistrationForClaim(
  registrationId: string,
): Promise<{
  readonly eventTitle: string;
  readonly startTime: Date;
  // Phase B.1: claim ページ (会員紐付け後の /mypage/events 遷移前に一瞬表示)
  // でもオンライン開催の参加 URL 案内を出せるよう select しておく
  // （meetingProvider は表示判定に不要なため含めない — isEventVirtualAccessible
  // は format のみで判定できる）。
  readonly format: EventFormatValue;
  readonly meetingUrl: string | null;
} | null> {
  const registration = await prisma.eventRegistration.findFirst({
    where: { id: registrationId, event: { deletedAt: null } },
    select: {
      slot: { select: { startAt: true } },
      event: { select: { title: true, format: true, meetingUrl: true } },
    },
  });
  if (!registration) return null;
  return {
    eventTitle: registration.event.title,
    startTime: registration.slot.startAt,
    format: registration.event.format,
    meetingUrl: registration.event.meetingUrl,
  };
}

const CUSTOMER_EVENT_REGISTRATION_SELECT = {
  id: true,
  quantity: true,
  status: true,
  cancelledAt: true,
  createdAt: true,
  waitlistedAt: true,
  offeredAt: true,
  expiresAt: true,
  paymentStatus: true,
  // slotId / ticketId は mypage の waitlist 順位計算 (bulk lookup) 用。
  // Foundation gap analysis task #8 (mypage waitlist 順位 UI) で追加。
  slotId: true,
  ticketId: true,
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
      // Phase B.1: mypage イベント一覧で「参加 URL」表示に使う（登録済ユーザー
      // 限定 — 公開ページの publicEventSelect とは異なり render 制約は無い）。
      // meetingProvider は表示に不要（CHECK 制約により format∈{ONLINE,HYBRID}
      // かつ meetingUrl=null は「GOOGLE_MEET write-back 待ち」を含意するため、
      // provider を別途持たなくても isEventVirtualAccessible + meetingUrl の
      // null 判定だけで表示可否が決まる）。
      format: true,
      meetingUrl: true,
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
  readonly waitlistedAt: Date | null;
  readonly offeredAt: Date | null;
  readonly expiresAt: Date | null;
  readonly paymentStatus: PaymentStatus;
  readonly slotId: string;
  readonly ticketId: string;
  readonly slot: {
    readonly startAt: Date;
    readonly endAt: Date;
  };
  readonly event: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
    readonly addressDetail: string | null;
    readonly status: string;
    readonly format: EventFormatValue;
    readonly meetingUrl: string | null;
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
    waitlistedAt: row.waitlistedAt,
    offeredAt: row.offeredAt,
    expiresAt: row.expiresAt,
    paymentStatus: row.paymentStatus,
    slotId: row.slotId,
    ticketId: row.ticketId,
    event: {
      id: row.event.id,
      title: row.event.title,
      slug: row.event.slug,
      startTime: row.slot.startAt,
      endTime: row.slot.endAt,
      status: row.event.status,
      format: row.event.format,
      meetingUrl: row.event.meetingUrl,
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
 * - active: ACTIVE_REGISTRATION_STATUSES（CONFIRMED / WAITLISTED /
 *   WAITLISTED_OFFERED）かつスロット終了時刻 > now（開始日時の近い順）
 * - past: CANCELLED / EXPIRED またはスロット終了時刻 <= now（直近に終わった順）
 *   EXPIRED を明示条件に含めるのは、cron (`waitlist-expire`) が
 *   WAITLISTED_OFFERED を EXPIRED に倒した後もスロット自体は未来のままの
 *   ケースがあり、それを "スロット終了" 条件だけでは past に落とせないため
 *   （EXPIRED は終端 status であり ACTIVE_REGISTRATION_STATUSES に含まれない
 *   ので active 側には出ないが、past 側の OR に明示しないとどちらのタブにも
 *   出現しなくなる）。
 *
 * 時刻判定をドメイン層で完結させることで、呼び出し側 (RSC) は `Date.now()` を
 * render 中に呼ばずに済む（React Compiler purity rule 準拠）。同じ理由で
 * 判定に使った `now` 自体も戻り値に含める — 呼び出し側 (mypage/events/page.tsx)
 * が WAITLISTED_OFFERED カウントダウンの初期値算出用に「render 時点の now」を
 * 必要とするが、そこで改めて `new Date()` を呼ぶと同じ purity 違反になるため。
 */
export async function getCustomerEventRegistrations(
  customerId: string,
): Promise<{
  readonly active: ReturnType<typeof mapCustomerEventRegistration>[];
  readonly past: ReturnType<typeof mapCustomerEventRegistration>[];
  readonly now: Date;
}> {
  const now = new Date();
  const baseEventWhere = { deletedAt: null } as const;

  const [activeRows, pastRows] = await Promise.all([
    prisma.eventRegistration.findMany({
      where: {
        customerId,
        status: { in: [...ACTIVE_REGISTRATION_STATUSES] },
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
          { status: RegistrationStatus.EXPIRED },
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
    now,
  };
}

/**
 * イベント申込の .ics 生成に必要なフィールドを取得する。
 *
 * - `customerId` を渡した場合: 所有者一致を where 条件で強制 (会員セッション経路)
 * - `customerId` を省略した場合: ID 一致のみで取得 (ゲスト用署名付きトークン経路。
 *   トークン検証側でアクセス権を担保するため、ここでは ownership 強制をしない)
 */
/**
 * イベント前日リマインダー cron 用: 指定日時窓内の CONFIRMED 申込を取得。
 *
 * `reminderSentAt: null` でリマインダー未送信のみに絞る（冪等性の第一段 dedup）。
 * 二重送信レースは送信前の atomic claim（claimEventRegistrationReminder）で防ぐ。
 * walk-in（email=null）は宛先が無いため除外する。
 */
export async function findEventRegistrationsForReminderWindow(
  startOfWindow: Date,
  endOfWindow: Date,
) {
  return prisma.eventRegistration.findMany({
    where: {
      status: RegistrationStatus.CONFIRMED,
      reminderSentAt: null,
      email: { not: null },
      event: { deletedAt: null },
      slot: { startAt: { gte: startOfWindow, lte: endOfWindow } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      quantity: true,
      icsSequence: true,
      customerId: true,
      slot: {
        select: { startAt: true, endAt: true },
      },
      event: {
        select: {
          title: true,
          format: true,
          meetingUrl: true,
          addressDetail: true,
          location: { select: { name: true } },
          space: { select: { name: true } },
        },
      },
    },
  });
}

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
  format: EventFormatValue;
  meetingUrl: string | null;
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
          format: true,
          meetingUrl: true,
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
    startTime: reg.slot.startAt,
    endTime: reg.slot.endAt,
    location: formatEventVenue({
      location: reg.event.location,
      space: reg.event.space,
      addressDetail: reg.event.addressDetail,
    }),
    quantity: reg.quantity,
    icsSequence: reg.icsSequence,
    status: reg.status,
    format: reg.event.format,
    meetingUrl: reg.event.meetingUrl,
  };
}
