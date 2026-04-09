import "server-only";

import { CustomerStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import type { CustomerFormData } from "@/shared/lib/validations/customer";

async function ensureCustomerExists(id: string): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!customer) {
    throw new DomainError("顧客が見つかりません", "NOT_FOUND");
  }
}

async function ensureEmailAvailable(
  email: string,
  currentId?: string,
): Promise<void> {
  const existing = currentId
    ? await prisma.customer.findFirst({
        where: {
          email,
          NOT: { id: currentId },
        },
        select: { id: true },
      })
    : await prisma.customer.findUnique({
        where: { email },
        select: { id: true },
      });

  if (existing) {
    throw new DomainError(
      "このメールアドレスは既に登録されています",
      "CONFLICT",
    );
  }
}

function toCustomerData(data: CustomerFormData) {
  return {
    lastName: data.lastName,
    firstName: data.firstName,
    lastNameKana: data.lastNameKana || null,
    firstNameKana: data.firstNameKana || null,
    companyName: data.companyName || null,
    email: data.email,
    phoneNumber: data.phoneNumber || null,
    address: data.address || null,
    notes: data.notes || null,
  };
}

export async function createCustomer(
  data: CustomerFormData,
): Promise<{ id: string }> {
  await ensureEmailAvailable(data.email);

  const customer = await prisma.customer.create({
    data: {
      ...toCustomerData(data),
      status: CustomerStatus.NEW,
      isActive: true,
    },
  });

  return { id: customer.id };
}

export async function updateCustomerStatus(
  id: string,
  status: CustomerStatus,
): Promise<void> {
  await ensureCustomerExists(id);

  await prisma.customer.update({
    where: { id },
    data: { status },
  });
}

export async function updateCustomerNotes(
  id: string,
  notes: string | null,
): Promise<void> {
  await ensureCustomerExists(id);

  await prisma.customer.update({
    where: { id },
    data: { notes },
  });
}

export async function toggleCustomerActive(id: string): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!customer) {
    throw new DomainError("顧客が見つかりません", "NOT_FOUND");
  }

  await prisma.customer.update({
    where: { id },
    data: { isActive: !customer.isActive },
  });
}

export async function updateCustomer(
  id: string,
  data: CustomerFormData,
): Promise<void> {
  await ensureCustomerExists(id);
  await ensureEmailAvailable(data.email, id);

  await prisma.customer.update({
    where: { id },
    data: toCustomerData(data),
  });
}

/** 顧客が自身のプロフィールを更新（userId ベース） */
export async function updateCustomerProfileByUserId(
  userId: string,
  data: {
    lastName: string;
    firstName: string;
    phoneNumber: string | null;
  },
): Promise<void> {
  await prisma.customer.update({
    where: { userId },
    data: {
      lastName: data.lastName,
      firstName: data.firstName,
      phoneNumber: data.phoneNumber,
    },
  });
}

export async function deleteCustomer(id: string): Promise<void> {
  await ensureCustomerExists(id);

  await prisma.customer.delete({
    where: { id },
  });
}

/** 顧客マージ: source の全リレーションを target に移管し source を削除 */
export async function mergeCustomerCommand(
  sourceId: string,
  targetId: string,
): Promise<{
  transferredReservations: number;
  transferredInquiries: number;
  transferredReviews: number;
  transferredRegistrations: number;
}> {
  if (sourceId === targetId) {
    throw new DomainError("同じ顧客をマージすることはできません", "VALIDATION");
  }

  const [source, target] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: sourceId },
      select: { id: true },
    }),
    prisma.customer.findUnique({
      where: { id: targetId },
      select: { id: true },
    }),
  ]);
  if (!source)
    throw new DomainError("マージ元の顧客が見つかりません", "NOT_FOUND");
  if (!target)
    throw new DomainError("マージ先の顧客が見つかりません", "NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const [reservations, inquiries, reviews, registrations] = await Promise.all(
      [
        tx.reservation.updateMany({
          where: { customerId: sourceId },
          data: { customerId: targetId },
        }),
        tx.inquiry.updateMany({
          where: { customerId: sourceId },
          data: { customerId: targetId },
        }),
        tx.spaceReview.updateMany({
          where: { customerId: sourceId },
          data: { customerId: targetId },
        }),
        tx.eventRegistration.updateMany({
          where: { customerId: sourceId },
          data: { customerId: targetId },
        }),
      ],
    );

    const stats = await tx.reservation.aggregate({
      where: { customerId: targetId, deletedAt: null },
      _count: true,
      _sum: { totalPriceWithTax: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });

    await tx.customer.update({
      where: { id: targetId },
      data: {
        totalReservations: stats._count,
        totalSpent: stats._sum.totalPriceWithTax
          ? Number(stats._sum.totalPriceWithTax)
          : null,
        firstReservationAt: stats._min.createdAt,
        lastReservationAt: stats._max.createdAt,
      },
    });

    await tx.customer.delete({ where: { id: sourceId } });

    return {
      transferredReservations: reservations.count,
      transferredInquiries: inquiries.count,
      transferredReviews: reviews.count,
      transferredRegistrations: registrations.count,
    };
  });
}

/** 予約のゲスト入力値で顧客情報を更新 */
export async function updateCustomerFromGuestData(
  customerId: string,
  guestData: {
    lastName: string;
    firstName: string;
    phoneNumber: string | null;
    companyName: string | null;
  },
): Promise<void> {
  await ensureCustomerExists(customerId);

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      lastName: guestData.lastName,
      firstName: guestData.firstName,
      phoneNumber: guestData.phoneNumber,
      companyName: guestData.companyName,
    },
  });
}
