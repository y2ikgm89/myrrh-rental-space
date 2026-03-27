import "server-only";

import { InquiryStatus } from "@/shared/db/enums";
import { prisma } from "@/shared/db/prisma";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";
import type { InquiryWhereInput } from "@/shared/types/prisma";
import type {
  GetInquiriesResult,
  InquiryFilters,
  InquiryPagination,
  InquiryStats,
  InquiryWithCustomer,
} from "@/shared/domain/inquiries/types";

export async function getInquiries(
  filters: InquiryFilters = {},
  pagination: InquiryPagination = {},
): Promise<Serialized<GetInquiriesResult>> {
  const { status, search } = filters;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = pagination;

  const where: InquiryWhereInput = {};

  if (status && status !== "ALL") {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
      { message: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, inquiries] = await prisma.$transaction([
    prisma.inquiry.count({ where }),
    prisma.inquiry.findMany({
      where,
      select: {
        id: true,
        name: true,
        companyName: true,
        email: true,
        subject: true,
        message: true,
        status: true,
        customerId: true,
        replyMessage: true,
        repliedAt: true,
        repliedBy: { select: { name: true } },
        customer: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            email: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    inquiries: toPlainArray(inquiries),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getInquiryById(
  id: string,
): Promise<Serialized<InquiryWithCustomer> | null> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      companyName: true,
      email: true,
      subject: true,
      message: true,
      status: true,
      customerId: true,
      replyMessage: true,
      repliedAt: true,
      repliedBy: { select: { name: true } },
      customer: {
        select: {
          id: true,
          lastName: true,
          firstName: true,
          email: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  return toPlainObject(inquiry);
}

export async function getInquiryStats(): Promise<InquiryStats> {
  const [total, newCount, inProgress, resolved, closed] = await Promise.all([
    prisma.inquiry.count(),
    prisma.inquiry.count({ where: { status: InquiryStatus.NEW } }),
    prisma.inquiry.count({ where: { status: InquiryStatus.IN_PROGRESS } }),
    prisma.inquiry.count({ where: { status: InquiryStatus.RESOLVED } }),
    prisma.inquiry.count({ where: { status: InquiryStatus.CLOSED } }),
  ]);

  return {
    total,
    new: newCount,
    inProgress,
    resolved,
    closed,
  };
}
