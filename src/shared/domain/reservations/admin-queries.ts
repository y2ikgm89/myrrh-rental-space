import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { MS_PER_DAY, formatJstDateString } from "@/shared/lib/date-format";
import { REFUND_AGGREGATE_EXCLUDED_STATUSES } from "@/shared/domain/payment/stripe-refund-orchestration";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { ReservationTabFilter } from "@/shared/lib/nuqs";
import type { Prisma } from "@generated/prisma/client";

type ReservationWhereInput = Prisma.ReservationWhereInput;

/**
 * 予約一覧のタブ別 where 句。
 *
 * - pending: PENDING (確認待ち)
 * - confirmed: CONFIRMED (来店予定)
 * - completed: COMPLETED (利用済み)
 * - cancelled: CANCELLED または NO_SHOW (終了)
 * - all: 制約なし
 */
export function buildTabWhere(
  tab: ReservationTabFilter,
): ReservationWhereInput {
  switch (tab) {
    case "pending":
      return { status: ReservationStatus.PENDING };
    case "confirmed":
      return { status: ReservationStatus.CONFIRMED };
    case "completed":
      return { status: ReservationStatus.COMPLETED };
    case "cancelled":
      return {
        status: {
          in: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW],
        },
      };
    case "all":
      return {};
  }
}

/** タブ別のデフォルトソート（URL に sortBy/sortOrder が指定されていない場合の初期値） */
function getDefaultSort(tab: ReservationTabFilter): {
  sortBy: "startTime" | "createdAt";
  sortOrder: "asc" | "desc";
} {
  switch (tab) {
    case "pending":
      return { sortBy: "startTime", sortOrder: "asc" };
    case "confirmed":
      return { sortBy: "startTime", sortOrder: "asc" };
    case "completed":
      return { sortBy: "startTime", sortOrder: "desc" };
    case "cancelled":
      return { sortBy: "startTime", sortOrder: "desc" };
    case "all":
      return { sortBy: "startTime", sortOrder: "desc" };
  }
}

export type ReservationListFilters = {
  tab?: ReservationTabFilter | undefined;
  search?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  spaceId?: string | undefined;
  /** 予約を作成した管理ユーザー (Reservation.userId、Customer とは別軸)。 */
  userId?: string | undefined;
};

/**
 * 予約一覧・CSV export で共有する where 句ビルダー。
 *
 * Round-4 audit Finding #13 / medium: 旧 export route は無条件 findMany
 * (deletedAt: null のみ) で、一覧が絞り込んでいる tab/search/期間/userId を
 * 一切反映しなかった。管理者が画面に見えている行のつもりで CSV を押すと、
 * 他ステータス・他顧客の PII まで漏れる不整合だったため、一覧クエリ
 * (`getReservationsQuery`) と export クエリ (`getReservationsForExport`) が
 * 同じ where 構築ロジックを共有するよう export する。
 */
export function buildReservationListWhere(
  filters: ReservationListFilters,
): ReservationWhereInput {
  const { tab = "all", search, startDate, endDate, spaceId, userId } = filters;

  const where: ReservationWhereInput = {
    deletedAt: null,
    ...buildTabWhere(tab),
  };

  if (spaceId) {
    where.spaceId = spaceId;
  }

  if (userId) {
    where.userId = userId;
  }

  if (startDate || endDate) {
    // JST カレンダー日境界（Cloud Run UTC でも営業日と一致させる）。
    // endDate はその日を含む → 翌日 JST 00:00 未満（半開区間）。
    where.startTime = {
      ...(startDate ? { gte: new Date(`${startDate}T00:00:00+09:00`) } : {}),
      ...(endDate
        ? {
            lt: new Date(
              new Date(`${endDate}T00:00:00+09:00`).getTime() + MS_PER_DAY,
            ),
          }
        : {}),
    };
  }

  if (search) {
    where.OR = [
      {
        customer: {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
      },
      {
        space: {
          name: { contains: search, mode: "insensitive" },
        },
      },
    ];
  }

  return where;
}

/**
 * 並べ替えのキーは**リテラルで持つ**。`{ [sortBy]: … }` と書くと、どの列で
 * 並ぶのかが静的に読めなくなり、enum 列の宣言順に依存していても
 * `enum-order-dependencies.test.ts` が検出できない。
 */
function reservationOrderBy(
  sortBy: "startTime" | "createdAt",
  direction: "asc" | "desc",
): Prisma.ReservationOrderByWithRelationInput {
  switch (sortBy) {
    case "startTime":
      return { startTime: direction };
    case "createdAt":
      return { createdAt: direction };
  }
}

export async function getReservationsQuery(
  filters: ReservationListFilters = {},
  pagination: {
    page?: number | undefined;
    limit?: number | undefined;
    sortBy?: "startTime" | "createdAt" | undefined;
    sortOrder?: "asc" | "desc" | undefined;
  } = {},
) {
  const { tab = "all" } = filters;
  const { sortBy, sortOrder } = pagination;
  const { skip, take, page, limit } = paginate(pagination);

  const defaults = getDefaultSort(tab);
  const effectiveSortBy = sortBy ?? defaults.sortBy;
  const effectiveSortOrder = sortOrder ?? defaults.sortOrder;

  const where = buildReservationListWhere(filters);

  const [total, reservations] = await Promise.all([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({
      where,
      select: {
        id: true,
        spaceId: true,
        customerId: true,
        startTime: true,
        endTime: true,
        status: true,
        version: true,
        paymentStatus: true,
        totalPrice: true,
        basePrice: true,
        couponId: true,
        couponDiscountAmount: true,
        durationDiscountAmount: true,
        spaceDiscountAmount: true,
        taxRateType: true,
        taxRate: true,
        taxAmount: true,
        totalPriceWithTax: true,
        stripePaymentIntentId: true,
        paidAt: true,
        cancellationReason: true,
        cancelledAt: true,
        cancelledByType: true,
        guestLastName: true,
        guestFirstName: true,
        guestEmail: true,
        guestPhone: true,
        guestCompanyName: true,
        guestCustomerType: true,
        notes: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        space: {
          select: {
            id: true,
            name: true,
          },
        },
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            email: true,
            phoneNumber: true,
            userId: true,
          },
        },
      },
      orderBy: reservationOrderBy(effectiveSortBy, effectiveSortOrder),
      skip,
      take,
    }),
  ]);

  const formattedReservations = reservations.map((reservation) => ({
    ...reservation,
    startTime: reservation.startTime.toISOString(),
    endTime: reservation.endTime.toISOString(),
    paidAt: reservation.paidAt?.toISOString() ?? null,
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
  }));

  return toPlainObject({
    reservations: formattedReservations,
    total,
    page,
    limit,
    totalPages: calcTotalPages(total, limit),
  });
}

/**
 * Phase B.2 task 23: 予約が series の一部かを判定する thin query。
 * 予約詳細ページ (`/admin/reservations/[id]/page.tsx`) が SeriesInfoSection
 * のレンダリングに使う。null 返却時は単発予約 (series なし)。
 */
export type ReservationSeriesInfo = {
  readonly id: string;
  readonly rrule: string;
  readonly dtstart: Date;
  readonly duration: number;
  readonly instanceCount: number;
  readonly cancelledAt: Date | null;
  readonly deletedAt: Date | null;
  readonly recurrenceInstanceIndex: number;
};

export async function getReservationSeriesInfoQuery(
  reservationId: string,
): Promise<ReservationSeriesInfo | null> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId, deletedAt: null },
    select: {
      recurrenceInstanceIndex: true,
      series: {
        select: {
          id: true,
          rrule: true,
          dtstart: true,
          duration: true,
          instanceCount: true,
          cancelledAt: true,
          deletedAt: true,
        },
      },
    },
  });
  if (
    !reservation ||
    !reservation.series ||
    reservation.recurrenceInstanceIndex === null
  ) {
    return null;
  }
  return {
    id: reservation.series.id,
    rrule: reservation.series.rrule,
    dtstart: reservation.series.dtstart,
    duration: reservation.series.duration,
    instanceCount: reservation.series.instanceCount,
    cancelledAt: reservation.series.cancelledAt,
    deletedAt: reservation.series.deletedAt,
    recurrenceInstanceIndex: reservation.recurrenceInstanceIndex,
  };
}

export async function getReservationByIdQuery(id: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id, deletedAt: null },
    select: {
      id: true,
      spaceId: true,
      customerId: true,
      startTime: true,
      endTime: true,
      status: true,
      version: true,
      totalPrice: true,
      basePrice: true,
      couponId: true,
      couponDiscountAmount: true,
      durationDiscountAmount: true,
      spaceDiscountAmount: true,
      manualAdjustmentAmount: true,
      // 税情報（予約時点の値を記録）。populate 経路は customer-commands.ts
      // (顧客セルフ変更経路) のみで、admin 経路は書き込まないため null が普通。
      // 表示側で null 判定して条件付きで描画する（customer-facing detail と同型）。
      taxRateType: true,
      taxRate: true,
      taxAmount: true,
      totalPriceWithTax: true,
      notes: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      paymentStatus: true,
      stripeCheckoutSessionId: true,
      stripePaymentIntentId: true,
      paidAt: true,
      cancellationReason: true,
      cancelledAt: true,
      cancelledByType: true,
      guestLastName: true,
      guestFirstName: true,
      guestEmail: true,
      guestPhone: true,
      guestCompanyName: true,
      guestCustomerType: true,
      space: {
        select: {
          id: true,
          name: true,
        },
      },
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
          phoneNumber: true,
          userId: true,
        },
      },
      coupon: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      // task #7 PR#6: active な Receipt (再発行済み orphan は reservationId が NULL のため
      // ここでは選ばれない、常に「現在有効な領収書」1 件のみ)。admin 再発行 UI で使う。
      receipt: {
        select: {
          id: true,
          serialNo: true,
          revision: true,
          reissuedFromId: true,
          issuedAt: true,
        },
      },
      // Round-5 audit Finding #21: RefundDialog の cumulativeRefunded (部分返金
      // 済み累積額) を計算するために必要。events 側の getEventRegistrations
      // (registration-queries.ts) と同型の select。amount 合計は呼び出し側
      // (ReservationDetail.tsx) で reduce する。
      //
      // failed / canceled な返金は「返金済み額」ではない。ここで絞らないと
      // RefundDialog が嘘の累積額・残額を表示し、正当な返金額の入力を拒否する。
      // ドメイン側・DB 側と同じ SSoT を使う。
      refunds: {
        where: {
          status: { notIn: [...REFUND_AGGREGATE_EXCLUDED_STATUSES] },
        },
        select: {
          amount: true,
        },
      },
    },
  });

  if (!reservation) {
    return null;
  }

  return toPlainObject({
    ...reservation,
    startTime: reservation.startTime.toISOString(),
    endTime: reservation.endTime.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
    paidAt: reservation.paidAt?.toISOString() ?? null,
    receipt: reservation.receipt
      ? {
          ...reservation.receipt,
          issuedAt: reservation.receipt.issuedAt.toISOString(),
        }
      : null,
  });
}

export async function getReservationsForCalendarQuery(
  startDate: Date,
  endDate: Date,
  spaceId?: string,
  status?: ReservationStatus | "ALL",
) {
  const where: ReservationWhereInput = {
    deletedAt: null,
    AND: [{ startTime: { lt: endDate } }, { endTime: { gt: startDate } }],
  };

  if (spaceId) {
    where.spaceId = spaceId;
  }

  if (status && status !== "ALL") {
    where.status = status;
  }

  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      space: { select: { id: true, name: true } },
      customer: {
        select: {
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
          phoneNumber: true,
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return reservations.map((reservation) => ({
    id: reservation.id,
    title: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
    spaceId: reservation.space.id,
    spaceName: reservation.space.name,
    startTime: reservation.startTime.toISOString(),
    endTime: reservation.endTime.toISOString(),
    status: reservation.status,
    totalPrice: reservation.totalPrice,
    notes: reservation.notes,
    customerName: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
    customerEmail: reservation.guestEmail ?? reservation.customer.email,
    customerPhone: reservation.customer.phoneNumber,
  }));
}

export async function getSpacesForCalendarQuery() {
  return prisma.space.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getReservationStatsQuery() {
  // JST 固定で "今日" と "今週" の窓を計算する。process TZ (Cloud Run=UTC) 依存の
  // setHours(0, 0, 0, 0) / setDate(getDate() - getDay()) を使うと JST 00:00-09:00
  // の予約が "今日" から漏れて "昨日" にカウントされる silent bug になる (JST=UTC+9)。
  // `+09:00` offset 付き ISO 文字列を new Date() に渡す方式は
  // reservation-reminder cron と同型。JST SSoT は
  // `__tests__/unit/architecture-boundaries.test.ts` が強制する
  // (datetime-local の naive parse 禁止 / Intl の timeZone 指定必須)。
  // parseJstDateOnly は `@db.Date` 保存用に「JST 日付を UTC 深夜として」返す
  // 関数なので startTime (DateTime) の窓境界には流用できない。
  const now = new Date();
  const todayJstStr = formatJstDateString(now); // "YYYY-MM-DD" (JST)
  const todayStart = new Date(`${todayJstStr}T00:00:00+09:00`); // JST 00:00 = UTC 前日 15:00
  const tomorrowStart = new Date(todayStart.getTime() + MS_PER_DAY);

  // 週の始まり (JST の日曜 00:00) を求める。todayJstStr を UTC 深夜として parse
  // すれば、getUTCDay が JST 日の曜日を返す (parse 先 TZ 依存を排除)。
  const jstDateAsUtc = new Date(`${todayJstStr}T00:00:00Z`);
  const dayOfWeek = jstDateAsUtc.getUTCDay(); // 0..6 (Sun..Sat) in JST
  const weekStart = new Date(todayStart.getTime() - dayOfWeek * MS_PER_DAY);

  const [
    total,
    pending,
    confirmed,
    completed,
    cancelled,
    noShow,
    todayCount,
    thisWeekCount,
  ] = await Promise.all([
    prisma.reservation.count({ where: { deletedAt: null } }),
    prisma.reservation.count({
      where: { deletedAt: null, status: ReservationStatus.PENDING },
    }),
    prisma.reservation.count({
      where: { deletedAt: null, status: ReservationStatus.CONFIRMED },
    }),
    prisma.reservation.count({
      where: { deletedAt: null, status: ReservationStatus.COMPLETED },
    }),
    prisma.reservation.count({
      where: { deletedAt: null, status: ReservationStatus.CANCELLED },
    }),
    prisma.reservation.count({
      where: { deletedAt: null, status: ReservationStatus.NO_SHOW },
    }),
    prisma.reservation.count({
      where: {
        deletedAt: null,
        startTime: {
          gte: todayStart,
          lt: tomorrowStart,
        },
      },
    }),
    prisma.reservation.count({
      where: {
        deletedAt: null,
        startTime: {
          gte: weekStart,
        },
      },
    }),
  ]);

  return {
    total,
    pending,
    confirmed,
    completed,
    cancelled,
    noShow,
    todayCount,
    thisWeekCount,
  };
}

/**
 * 管理画面の予約フォーム（新規 / 編集 / 繰返し）と一覧フィルターに出すスペース候補。
 *
 * **`isPublished` では絞らない。** 管理画面の予約経路は非公開スペースへの予約を
 * 意図的に許容している（`previewReservationPricing` の `requirePublished` は
 * admin 側の 2 経路で `false`、`createAdminReservationCommand` /
 * `updateAdminReservationCommand` の空間検索も `where: { id, isActive: true }`）。
 * 「公開停止中だが電話予約は受ける」スペースを管理者が扱えることが要件。
 *
 * かつてここだけ `isPublished: true` で絞っていたため、書き込み側が受け付ける
 * スペースを選択肢が出さないという食い違いがあり、次の 3 つが壊れていた:
 *
 * 1. 非公開スペースの既存予約を編集フォームで開くと、選択中のスペースが候補に
 *    無いので Select が placeholder（未選択）表示になる
 * 2. 一覧のスペース絞り込みに出ないので、一覧に**表示されている**予約を絞り込めない
 * 3. カレンダー（`getSpacesForCalendarQuery`）には出るのに作成フォームには出ない
 *
 * 公開面の予約フォームは別経路（`(public)` の action が `requirePublished: true`）
 * なので、ここを緩めても公開側の予約可否は変わらない。
 *
 * `isPublished` を select するのは、UI 側が非公開スペースに印を付けるため
 * （`spaceOptionLabel`）。印が無いと、公開中のスペースと見分けが付かない。
 */
export async function getSpacesForReservationQuery() {
  return toPlainArray(
    await prisma.space.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        isPublished: true,
        hourlyPrice: true,
        discountType: true,
        discountValue: true,
        durationDiscountOverride: true,
      },
      orderBy: { name: "asc" },
    }),
  );
}

export async function getReservationGuestData(id: string) {
  return prisma.reservation.findUnique({
    where: { id, deletedAt: null },
    select: {
      customerId: true,
      guestLastName: true,
      guestFirstName: true,
      guestPhone: true,
      guestCompanyName: true,
    },
  });
}

export async function getReservationStatus(id: string) {
  return prisma.reservation.findUnique({
    where: { id, deletedAt: null },
    select: { status: true },
  });
}

/**
 * 予約リマインダー cron 用: 指定日時窓内のアクティブ予約とメール用関連を取得。
 *
 * `reminderSentAt: null` でリマインダー未送信のみに絞る（冪等性の第一段 dedup）。
 * 二重送信レースは送信前の atomic claim（`claimReservationReminder`）で防ぐ。
 */
export async function findReservationsForReminderWindow(
  startOfWindow: Date,
  endOfWindow: Date,
) {
  return prisma.reservation.findMany({
    where: {
      startTime: { gte: startOfWindow, lte: endOfWindow },
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      deletedAt: null,
      reminderSentAt: null,
      // 匿名化済み顧客は宛先を持たない（placeholder は MX の無い `.local`）。
      // 母集合から外さないと、送信境界で suppressed になるたびに cron が claim を
      // 解放し、同じウィンドウの間ずっと再試行を繰り返す（監査 F-112）。
      customer: { anonymizedAt: null },
    },
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      notes: true,
      icsSequence: true,
      userId: true,
      guestEmail: true,
      customer: {
        select: { firstName: true, lastName: true, email: true },
      },
      space: {
        select: {
          name: true,
          location: { select: { name: true } },
        },
      },
    },
  });
}
