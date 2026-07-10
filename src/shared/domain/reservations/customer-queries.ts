import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

const CUSTOMER_RESERVATION_SELECT = {
  id: true,
  startTime: true,
  endTime: true,
  status: true,
  totalPrice: true,
  paymentStatus: true,
  notes: true,
  createdAt: true,
  space: { select: { id: true, name: true, slug: true } },
} as const;

export async function getCustomerReservations(customerId: string) {
  return prisma.reservation.findMany({
    where: { customerId, deletedAt: null },
    select: CUSTOMER_RESERVATION_SELECT,
    orderBy: { startTime: "desc" },
  });
}

export async function getCustomerReservationDetail(
  reservationId: string,
  customerId: string,
) {
  return prisma.reservation.findFirst({
    where: { id: reservationId, customerId, deletedAt: null },
    select: {
      ...CUSTOMER_RESERVATION_SELECT,
      couponId: true,
      couponDiscountAmount: true,
      durationDiscountAmount: true,
      spaceDiscountAmount: true,
      basePrice: true,
      taxRateType: true,
      taxRate: true,
      taxAmount: true,
      totalPriceWithTax: true,
      paidAt: true,
      cancellationReason: true,
      cancelledAt: true,
      cancelledByType: true,
      spaceId: true,
      space: {
        select: {
          id: true,
          name: true,
          slug: true,
          locationId: true,
          capacity: true,
          reviewsEnabled: true,
        },
      },
    },
  });
}

export async function getReservationForGuestCancel(reservationId: string) {
  return prisma.reservation.findFirst({
    where: { id: reservationId, deletedAt: null },
    select: {
      id: true,
      customerId: true,
      startTime: true,
      endTime: true,
      status: true,
      totalPrice: true,
      paymentStatus: true,
      guestLastName: true,
      guestFirstName: true,
      space: { select: { id: true, name: true, slug: true } },
    },
  });
}

export async function getReservationForCompletion(reservationId: string) {
  return prisma.reservation.findFirst({
    where: { id: reservationId, deletedAt: null },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      totalPrice: true,
      guestLastName: true,
      guestFirstName: true,
      space: {
        select: {
          id: true,
          name: true,
          slug: true,
          location: { select: { address: true } },
          smartLockDevices: {
            where: { isActive: true },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
}

/**
 * 予約の .ics 生成に必要なフィールドを取得する。
 *
 * - `customerId` を渡した場合: 所有者一致を where 条件で強制 (会員セッション経路)
 * - `customerId` を省略した場合: ID 一致のみで取得 (ゲスト用署名付きトークン経路。
 *   トークン検証側でアクセス権を担保するため、ここでは ownership 強制をしない)
 */
export async function getReservationForCalendar(params: {
  reservationId: string;
  customerId?: string | undefined;
}): Promise<{
  id: string;
  spaceName: string;
  customerName: string;
  startTime: Date;
  endTime: Date;
  location: string | null;
  notes: string | null;
  icsSequence: number;
  status: ReservationStatus;
} | null> {
  const reservation = await prisma.reservation.findFirst({
    where: {
      id: params.reservationId,
      ...(params.customerId !== undefined
        ? { customerId: params.customerId }
        : {}),
      deletedAt: null,
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      notes: true,
      icsSequence: true,
      status: true,
      space: {
        select: {
          name: true,
          location: { select: { address: true } },
        },
      },
      customer: {
        select: { lastName: true, firstName: true },
      },
    },
  });
  if (!reservation) return null;
  return {
    id: reservation.id,
    spaceName: reservation.space.name,
    customerName:
      `${reservation.customer.lastName} ${reservation.customer.firstName}`.trim() ||
      "お客様",
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    location: reservation.space.location?.address ?? null,
    notes: reservation.notes,
    icsSequence: reservation.icsSequence,
    status: reservation.status,
  };
}
