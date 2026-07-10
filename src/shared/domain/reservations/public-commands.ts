import "server-only";

import { prisma } from "@/shared/db/prisma";
import { CustomerType, ReservationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { ensureCustomerNotBlacklisted } from "@/shared/domain/customers/guard";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { resolveOrCreateCustomer } from "@/shared/domain/reservations/resolve-customer";
import {
  ensureDateNotBlocked,
  getReservationRuleSettings,
} from "@/shared/domain/reservations/availability";
import { checkReservationDuration } from "@/shared/lib/reservation/time-slots-utils";
import {
  CUSTOMER_SELECT,
  buildDateTime,
  calculateHoursAndBasePrice,
  calculatePricing,
  ensureNoOverlap,
  getReservationSettings,
  incrementCustomerReservationStats,
  buildPayload,
} from "./payloads";
import { lockReservationSpaceForTransaction } from "./locks";

const SPACE_SELECT = {
  id: true,
  name: true,
  addressDetail: true,
  hourlyPrice: true,
  locationId: true,
  discountType: true,
  discountValue: true,
  durationDiscountOverride: true,
  location: { select: { address: true } },
} as const;

// ---------------------------------------------------------------------------
// Public: Create
// ---------------------------------------------------------------------------

type PublicReservationInput = {
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  lastName: string;
  firstName: string;
  email: string;
  phoneNumber?: string | null | undefined;
  companyName?: string | null | undefined;
  customerType?: CustomerType | undefined;
  notes?: string | null | undefined;
  userId?: string | null | undefined;
};

export async function createPublicReservationCommand(
  input: PublicReservationInput,
) {
  // Global gate: featureModules.reservation（依存元 spaces 含む）で OFF なら拒否。
  // page.tsx の requireFeatureEnabled は Server Action の直接呼び出しを防げないため、
  // 書込の実効性は domain 層のこのチェックが担保する（reviews/commands.ts と同型）。
  if (!(await isFeatureEnabled("reservation"))) {
    throw new DomainError(
      "予約機能は現在サイト全体で無効化されています",
      "VALIDATION",
    );
  }

  const startDateTime = buildDateTime(input.date, input.startTime);
  const endDateTime = buildDateTime(input.date, input.endTime);

  const space = await prisma.space.findUnique({
    where: { id: input.spaceId, isActive: true, isPublished: true },
    select: SPACE_SELECT,
  });

  if (!space) {
    throw new DomainError("指定されたスペースが見つかりません", "NOT_FOUND");
  }

  // 最小/最大予約時間（設定値）をサーバー側で強制する
  const rules = await getReservationRuleSettings();
  const durationError = checkReservationDuration(
    (endDateTime.getTime() - startDateTime.getTime()) / 60000,
    rules,
  );
  if (durationError) {
    throw new DomainError(durationError, "VALIDATION");
  }

  await ensureDateNotBlocked(input.spaceId, space.locationId, input.date);

  await ensureNoOverlap({
    spaceId: input.spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
  });

  const { hours, basePrice } = calculateHoursAndBasePrice(
    startDateTime,
    endDateTime,
    space.hourlyPrice,
  );

  // 公開予約フォームの料金確定はサーバー側 SSoT。スペース固有割引（Space モデル）と
  // 長時間割引（Settings）を calculateReservationPrice 経由で適用する。
  // クーポンは公開フォームに code 入力 UI が無いため null（mypage 経路で適用）。
  const settings = await getReservationSettings();
  const spaceDiscount =
    space.discountType !== "none" &&
    space.discountValue != null &&
    space.discountValue > 0
      ? {
          discountType: space.discountType,
          discountValue: space.discountValue,
          durationDiscountOverride: space.durationDiscountOverride,
        }
      : null;
  const { totalPrice, durationDiscountAmount, spaceDiscountAmount } =
    calculatePricing({
      hourlyPrice: space.hourlyPrice,
      hours,
      basePrice,
      settings,
      coupon: null,
      spaceDiscount,
    });

  const reservation = await prisma.$transaction(async (tx) => {
    await lockReservationSpaceForTransaction(tx, input.spaceId);

    await ensureDateNotBlocked(input.spaceId, space.locationId, input.date, tx);

    await ensureNoOverlap(
      {
        spaceId: input.spaceId,
        startTime: startDateTime,
        endTime: endDateTime,
      },
      tx,
    );

    const customerId = await resolveOrCreateCustomer(
      {
        lastName: input.lastName,
        firstName: input.firstName,
        email: input.email,
        phoneNumber: input.phoneNumber,
        companyName: input.companyName,
        customerType: input.customerType,
        userId: input.userId,
      },
      tx,
    );

    await ensureCustomerNotBlacklisted({ customerId }, tx);

    const created = await tx.reservation.create({
      data: {
        spaceId: input.spaceId,
        customerId,
        startTime: startDateTime,
        endTime: endDateTime,
        basePrice,
        totalPrice,
        spaceDiscountAmount,
        durationDiscountAmount,
        status: ReservationStatus.CONFIRMED,
        notes: input.notes || null,
        userId: input.userId || null,
        // Guest contact info (予約時の入力を記録)
        guestLastName: input.lastName,
        guestFirstName: input.firstName,
        guestEmail: input.email,
        guestPhone: input.phoneNumber || null,
        guestCompanyName: input.companyName || null,
        guestCustomerType: input.customerType ?? null,
      },
      include: { customer: { select: CUSTOMER_SELECT } },
    });

    await incrementCustomerReservationStats(tx, customerId);

    return created;
  });

  // Compute guest name diff for admin notification
  const guestFullName = `${input.lastName} ${input.firstName}`.trim();
  const customerFullName =
    `${reservation.customer.lastName} ${reservation.customer.firstName}`.trim();
  const guestNameDiff =
    guestFullName !== customerFullName ? guestFullName : null;

  return {
    id: reservation.id,
    customerId: reservation.customerId,
    payload: buildPayload({
      reservationId: reservation.id,
      customer: reservation.customer,
      space,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice,
      notes: input.notes,
      guestName: guestNameDiff,
      icsSequence: reservation.icsSequence,
      userId: input.userId ?? null,
    }),
  };
}
