import "server-only";

import { prisma } from "@/shared/db/prisma";

const CUSTOMER_INQUIRY_SELECT = {
  id: true,
  subject: true,
  message: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getCustomerInquiries(customerId: string) {
  return prisma.inquiry.findMany({
    where: { customerId },
    select: CUSTOMER_INQUIRY_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

export async function getCustomerInquiryById(
  inquiryId: string,
  customerId: string,
) {
  return prisma.inquiry.findFirst({
    where: { id: inquiryId, customerId },
    select: {
      ...CUSTOMER_INQUIRY_SELECT,
      name: true,
      companyName: true,
      email: true,
    },
  });
}
