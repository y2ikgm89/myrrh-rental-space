import "server-only";

import { Prisma } from "@generated/prisma/client";
import { CustomerType, InquiryStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";

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
  /**
   * この問い合わせに紐づく Customer の User.id（ログイン可能な実アカウント）。
   * Inquiry.customerId 自体は resolveOrCreateGuestInquiryCustomer が発行する
   * userId=null の「ゲスト shell」customer を指し得るため、マイページ確認リンクの
   * 出し分けには customer.userId（Better Auth 連携済みか）を直接見る必要がある。
   */
  readonly customerUserId: string | null;
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
      customer: { select: { userId: true } },
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
      customerUserId: inquiry.customer?.userId ?? null,
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

async function resolveOrCreateGuestInquiryCustomer(
  input: CreateInquiryInput,
): Promise<string> {
  const emailCanonical = normalizeEmailForIdentity(input.email);

  const existingGuest = await prisma.customer.findFirst({
    where: { emailCanonical, userId: null },
    select: { id: true },
  });
  if (existingGuest) return existingGuest.id;

  try {
    const customer = await prisma.customer.create({
      data: {
        lastName: input.name,
        firstName: "",
        companyName: input.companyName || null,
        customerType: input.customerType ?? CustomerType.PERSONAL,
        email: input.email,
        emailCanonical,
        userId: null,
      },
      select: { id: true },
    });
    return customer.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const fallback = await prisma.customer.findFirst({
        where: { emailCanonical, userId: null },
        select: { id: true },
      });
      if (fallback) return fallback.id;
    }
    throw error;
  }
}

export async function createInquiryCommand(
  input: CreateInquiryInput,
): Promise<CreateInquiryResult> {
  // Global gate: featureModules.contact で OFF なら拒否。
  // page.tsx の requireFeatureEnabled は Server Action の直接呼び出しを防げないため、
  // 書込の実効性は domain 層のこのチェックが担保する（reviews/commands.ts と同型）。
  if (!(await isFeatureEnabled("contact"))) {
    throw new DomainError(
      "お問い合わせ機能は現在サイト全体で無効化されています",
      "VALIDATION",
    );
  }

  // Resolve customerId: explicit authenticated owner > unlinked guest customer.
  // Submitted email is not proof of account ownership, so never use it to attach
  // an inquiry to an existing linked customer.
  let resolvedCustomerId = input.customerId ?? null;
  if (resolvedCustomerId === null) {
    resolvedCustomerId = await resolveOrCreateGuestInquiryCustomer(input);
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
