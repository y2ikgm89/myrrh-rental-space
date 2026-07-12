import "server-only";
import {
  calculateDurationHours,
  parseDateTimeLocalAsJst,
} from "@/shared/lib/date-format";

import { prisma } from "@/shared/db/prisma";
import { CouponType } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { calculateReservationPrice } from "@/shared/lib/pricing/reservation";
import { parseDurationDiscountRules } from "@/shared/lib/pricing/discount";
import { checkReservationOverlap } from "@/shared/lib/reservation";
import { checkSpaceOverlap } from "@/shared/domain/spaces/overlap";
import { getValidDiscountCombinationMode } from "@/shared/lib/validations/enums/helpers";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ValidatedCoupon = {
  id: string;
  code: string;
  name: string;
  type: CouponType;
  discountValue: number;
  maxDiscountAmount: number | null;
  canCombineWithDurationDiscount: boolean;
} | null;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type ReservationPayload = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  companyName?: string | null;
  guestName?: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  notes?: string | undefined;
  location?: string | undefined;
  icsSequence: number;
  /** 会員予約なら User.id、ゲスト予約なら null/undefined。メール送信時のマイページ動線出し分けに使う。 */
  userId?: string | null;
};

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

export const CUSTOMER_SELECT = {
  firstName: true,
  lastName: true,
  companyName: true,
  email: true,
} as const;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function buildDateTime(date: string, time: string): Date {
  return parseDateTimeLocalAsJst(`${date}T${time}`);
}

export function calculateHoursAndBasePrice(
  startDateTime: Date,
  endDateTime: Date,
  hourlyPrice: number,
) {
  const hours = calculateDurationHours(startDateTime, endDateTime);
  const basePrice = Math.floor(hourlyPrice * hours);
  return { hours, basePrice };
}

export async function getReservationSettings() {
  return prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      durationDiscountEnabled: true,
      durationDiscountRules: true,
      discountCombinationMode: true,
    },
  });
}

export async function validateCoupon(
  code: string | null | undefined,
  basePrice: number,
  tx?: Tx,
): Promise<ValidatedCoupon> {
  if (!code || !code.trim()) {
    return null;
  }

  const normalizedCode = code.toUpperCase().trim();
  if (normalizedCode.length < 4 || !/^[A-Z0-9]+$/.test(normalizedCode)) {
    throw new DomainError("無効なクーポンコードです", "VALIDATION");
  }

  const coupon = await (tx ?? prisma).coupon.findUnique({
    where: { code: normalizedCode },
  });
  const now = new Date();

  if (!coupon || !coupon.isActive) {
    throw new DomainError("無効なクーポンコードです", "VALIDATION");
  }

  if (
    coupon.validFrom > now ||
    (coupon.validUntil && coupon.validUntil < now)
  ) {
    throw new DomainError("無効なクーポンコードです", "VALIDATION");
  }

  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    throw new DomainError("無効なクーポンコードです", "VALIDATION");
  }

  if (
    coupon.minReservationAmount !== null &&
    basePrice < coupon.minReservationAmount
  ) {
    throw new DomainError(
      `このクーポンは¥${coupon.minReservationAmount.toLocaleString()}以上のご利用で適用できます`,
      "VALIDATION",
    );
  }

  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    type: coupon.type,
    discountValue: coupon.discountValue,
    maxDiscountAmount: coupon.maxDiscountAmount,
    canCombineWithDurationDiscount: coupon.canCombineWithDurationDiscount,
  };
}

export async function ensureNoOverlap(
  params: {
    spaceId: string;
    startTime: Date;
    endTime: Date;
    excludeReservationId?: string;
  },
  tx?: Tx,
): Promise<void> {
  // Reservation ↔ Event cross-table overlap を SSoT で検査 (Priority-10 audit #4)。
  // 旧 checkReservationOverlap は Reservation-only だったため、Event 側書込が同一 Space
  // に生きたスロットを持っていても Reservation 側は素通りする race を放置していた。
  // 現在は `checkSpaceOverlap` に一本化し、tx 経由呼出時は lockSpaceForTransaction で
  // 直列化された空間で Reservation ↔ EventTimeSlot 両方を判定する。
  const result = await checkSpaceOverlap(params, tx);
  if (result.hasOverlap) {
    const message =
      result.type === "event"
        ? "選択された時間帯は既にイベントで予約されています。別の時間帯をお選びください。"
        : "選択された時間帯は既に予約されています。別の時間帯をお選びください。";
    throw new DomainError(message, "CONFLICT");
  }
}

/**
 * @deprecated `ensureNoOverlap` (Reservation ↔ Event 双方チェック) を使うこと。
 * Reservation-only チェックが必要な特殊経路 (例: iCal 同期の互換モード) 以外は使わない。
 */
export async function ensureNoReservationOverlapOnly(
  params: {
    spaceId: string;
    startTime: Date;
    endTime: Date;
    excludeReservationId?: string;
  },
  tx?: Tx,
): Promise<void> {
  const result = await checkReservationOverlap(params, tx);
  if (result.hasOverlap) {
    throw new DomainError(
      "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
      "CONFLICT",
    );
  }
}

export async function incrementCustomerReservationStats(
  tx: Tx,
  customerId: string,
): Promise<void> {
  const customer = await tx.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { firstReservationAt: true },
  });
  const now = new Date();
  await tx.customer.update({
    where: { id: customerId },
    data: {
      totalReservations: { increment: 1 },
      lastReservationAt: now,
      ...(customer.firstReservationAt === null
        ? { firstReservationAt: now }
        : {}),
    },
  });
}

/**
 * Customer の予約統計 (`totalReservations` / `totalSpent` / `firstReservationAt` /
 * `lastReservationAt`) を Reservation テーブル実履歴から再計算する。
 *
 * ## いつ使うか
 *
 * increment/decrement で維持している stat が **customerId の変更 or merge で
 * 追随できない場合**の再構築経路として使う。具体的には:
 *
 * - `mergeCustomerCommand` — source の全 relation を target に移管したあと、target の
 *   stat を実履歴で確定する
 * - `updateAdminReservationCommand` — 予約再割当時に旧 customer / 新 customer 両方の
 *   stat を再計算する (Codex data-retention レビュー中に silently 発生することが発覚)
 *
 * ## 集計仕様
 *
 * - `deletedAt: null` の予約のみを対象 (soft-delete は「無かった」扱い)
 * - `totalReservations` = COUNT
 * - `totalSpent` = SUM(COALESCE(totalPriceWithTax, totalPrice, 0)) — 0 円 / 0 件は
 *   null に折りたたむ (Customer.totalSpent の列 semantics と一致)。COALESCE fallback は
 *   admin 経路の予約が totalPriceWithTax を populate しない (customer-commands.ts の
 *   customer self-service update だけが setter) ため必須。fallback なしでは admin
 *   作成予約が SUM から silently drop し、totalSpent が本番で恒常 null になる
 *   (Codex #3564968552)。
 * - `firstReservationAt` = MIN(createdAt)、`lastReservationAt` = MAX(createdAt)
 *   (`incrementCustomerReservationStats` の `now` semantics と揃える — 予約の実施
 *   時刻ではなく作成時刻。0 件なら null)
 *
 * ## 実装
 *
 * Prisma の `_sum` は SQL COALESCE を直接受けられないため、単一 `$queryRaw` で
 * COUNT / SUM(COALESCE) / MIN / MAX を一度に取る。float8 cast で JS 数値として
 * 受ける (Customer.totalSpent は Decimal(10,2) だが小売レンジで float 精度で十分。
 * 既存 `mergeCustomerCommand` の `Number(stats._sum.totalPriceWithTax)` cast と
 * 同じ trade-off)。
 */
export async function recomputeCustomerReservationStats(
  tx: Tx,
  customerId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<
    Array<{
      count: bigint;
      sum: number | null;
      first_created: Date | null;
      last_created: Date | null;
    }>
  >`
    SELECT
      COUNT(*)::bigint AS count,
      SUM(COALESCE("totalPriceWithTax", "totalPrice"))::float8 AS sum,
      MIN("createdAt") AS first_created,
      MAX("createdAt") AS last_created
    FROM "reservations"
    WHERE "customerId" = ${customerId} AND "deletedAt" IS NULL
  `;
  const stats = rows[0];

  await tx.customer.update({
    where: { id: customerId },
    data: {
      totalReservations: stats ? Number(stats.count) : 0,
      totalSpent: stats?.sum ? Number(stats.sum) : null,
      firstReservationAt: stats?.first_created ?? null,
      lastReservationAt: stats?.last_created ?? null,
    },
  });
}

export function calculatePricing(params: {
  hourlyPrice: number;
  hours: number;
  basePrice: number;
  settings: Awaited<ReturnType<typeof getReservationSettings>>;
  coupon: ValidatedCoupon;
  spaceDiscount?:
    import("@/shared/lib/pricing/types").SpaceDiscountSettings | null;
}) {
  const priceCalculation = calculateReservationPrice({
    hourlyPrice: params.hourlyPrice,
    hours: params.hours,
    durationRules: parseDurationDiscountRules(
      params.settings?.durationDiscountRules,
    ),
    durationDiscountEnabled: params.settings?.durationDiscountEnabled ?? false,
    spaceDiscount: params.spaceDiscount ?? null,
    coupon: params.coupon,
    combinationMode: getValidDiscountCombinationMode(
      params.settings?.discountCombinationMode,
    ),
    showWarning: false,
  });

  return {
    totalPrice: priceCalculation.totalPrice,
    couponId: priceCalculation.appliedCoupon?.id ?? null,
    couponDiscountAmount:
      priceCalculation.couponDiscount > 0
        ? priceCalculation.couponDiscount
        : null,
    durationDiscountAmount:
      priceCalculation.durationDiscount > 0
        ? priceCalculation.durationDiscount
        : null,
    spaceDiscountAmount:
      priceCalculation.spaceDiscount > 0
        ? priceCalculation.spaceDiscount
        : null,
  };
}

export function buildPayload(params: {
  reservationId: string;
  customer: {
    lastName: string;
    firstName: string;
    companyName: string | null;
    email: string;
  };
  space: {
    name: string;
    addressDetail: string | null;
    location: { address: string };
  };
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  notes?: string | null | undefined;
  guestName?: string | null;
  icsSequence: number;
  userId?: string | null;
}): ReservationPayload {
  return {
    reservationId: params.reservationId,
    customerEmail: params.customer.email,
    customerName: `${params.customer.lastName} ${params.customer.firstName}`,
    companyName: params.customer.companyName,
    ...(params.guestName && { guestName: params.guestName }),
    spaceName: params.space.name,
    startTime: params.startTime,
    endTime: params.endTime,
    totalPrice: params.totalPrice,
    notes: params.notes ?? undefined,
    location: formatSpaceLineAddress(
      params.space.location.address,
      params.space.addressDetail,
    ),
    icsSequence: params.icsSequence,
    userId: params.userId ?? null,
  };
}

/**
 * 予約 ID からメール送信用ペイロードを再取得する。
 *
 * `updateCustomerReservation`（顧客セルフ変更）のように更新コマンドが最小限の
 * payload しか返さない経路で、更新後のメール送信に必要な最新状態を組み立てるために使う。
 */
export async function fetchReservationEmailData(
  reservationId: string,
): Promise<ReservationPayload | null> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      totalPrice: true,
      notes: true,
      icsSequence: true,
      userId: true,
      guestLastName: true,
      guestFirstName: true,
      customer: { select: CUSTOMER_SELECT },
      space: {
        select: {
          name: true,
          addressDetail: true,
          location: { select: { address: true } },
        },
      },
    },
  });
  if (!reservation) return null;

  const guestFull =
    `${reservation.guestLastName ?? ""} ${reservation.guestFirstName ?? ""}`.trim();
  const customerFull =
    `${reservation.customer.lastName} ${reservation.customer.firstName}`.trim();
  const guestNameDiff =
    guestFull && guestFull !== customerFull ? guestFull : null;

  return buildPayload({
    reservationId: reservation.id,
    customer: reservation.customer,
    space: reservation.space,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    totalPrice: reservation.totalPrice,
    notes: reservation.notes,
    guestName: guestNameDiff,
    icsSequence: reservation.icsSequence,
    userId: reservation.userId,
  });
}
