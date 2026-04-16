import "server-only";

import { CustomerType, InquiryStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus,
): Promise<void> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!inquiry) {
    throw new DomainError("お問い合わせが見つかりません", "NOT_FOUND");
  }

  await prisma.inquiry.update({
    where: { id },
    data: { status },
  });
}

/** 返信メール送信用にアクション層へ渡す（Prisma はドメイン内に閉じる） */
export type InquiryReplyEmailContext = {
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly message: string;
};

export async function replyToInquiryCommand(
  inquiryId: string,
  replyMessage: string,
  userId: string,
): Promise<{ id: string; emailContext: InquiryReplyEmailContext }> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    select: {
      id: true,
      name: true,
      email: true,
      subject: true,
      message: true,
    },
  });

  if (!inquiry) {
    throw new DomainError("お問い合わせが見つかりません", "NOT_FOUND");
  }

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: {
      replyMessage,
      repliedAt: new Date(),
      repliedById: userId,
      status: InquiryStatus.IN_PROGRESS,
    },
  });

  return {
    id: inquiryId,
    emailContext: {
      name: inquiry.name,
      email: inquiry.email,
      subject: inquiry.subject,
      message: inquiry.message,
    },
  };
}

export async function updateInquiryCustomer(
  inquiryId: string,
  customerId: string | null,
): Promise<void> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    select: { id: true },
  });

  if (!inquiry) {
    throw new DomainError("お問い合わせが見つかりません", "NOT_FOUND");
  }

  if (customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new DomainError("顧客が見つかりません", "NOT_FOUND");
    }
  }

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: { customerId },
  });
}

export async function deleteInquiry(id: string): Promise<void> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!inquiry) {
    throw new DomainError("お問い合わせが見つかりません", "NOT_FOUND");
  }

  await prisma.inquiry.delete({
    where: { id },
  });
}

type CreateInquiryInput = {
  name: string;
  companyName: string | null;
  email: string;
  subject: string;
  message: string;
  customerType?: CustomerType | null;
  customerId?: string | null;
};

export type InquiryPayload = {
  inquiryId: string;
  name: string;
  companyName: string | null;
  email: string;
  subject: string;
  message: string;
};

type CreateInquiryResult = {
  id: string;
  payload: InquiryPayload;
};

export async function createInquiryCommand(
  input: CreateInquiryInput,
): Promise<CreateInquiryResult> {
  // Resolve customerId: explicit > email lookup > null
  let resolvedCustomerId = input.customerId ?? null;
  if (!resolvedCustomerId) {
    const existingCustomer = await prisma.customer.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existingCustomer) {
      resolvedCustomerId = existingCustomer.id;
    }
  }

  const inquiry = await prisma.inquiry.create({
    data: {
      name: input.name,
      companyName: input.companyName || null,
      email: input.email,
      subject: input.subject,
      message: input.message,
      status: InquiryStatus.NEW,
      customerId: resolvedCustomerId,
      customerType: input.customerType ?? null,
    },
  });

  return {
    id: inquiry.id,
    payload: {
      inquiryId: inquiry.id,
      name: input.name,
      companyName: input.companyName,
      email: input.email,
      subject: input.subject,
      message: input.message,
    },
  };
}
