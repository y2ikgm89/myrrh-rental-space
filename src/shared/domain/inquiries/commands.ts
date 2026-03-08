import "server-only";

import { InquiryStatus } from "@/shared/db/enums";
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
