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
