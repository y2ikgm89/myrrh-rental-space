import type { InquiryStatus } from "@generated/prisma/enums";
import type { PaginationInput } from "@/shared/lib/pagination";

export type InquiryData = {
  id: string;
  name: string;
  companyName: string | null;
  email: string;
  subject: string;
  message: string;
  status: InquiryStatus;
  customerId: string | null;
  replyMessage: string | null;
  repliedAt: Date | null;
  repliedBy: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InquiryWithCustomer = InquiryData & {
  customer: {
    id: string;
    lastName: string;
    firstName: string;
    email: string;
  } | null;
};

export type GetInquiriesResult = {
  inquiries: InquiryWithCustomer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type InquiryFilters = {
  status?: InquiryStatus | "ALL" | undefined;
  search?: string | undefined;
};

export type InquiryPagination = PaginationInput<"createdAt" | "updatedAt">;

export type InquiryStats = {
  total: number;
  new: number;
  inProgress: number;
  resolved: number;
  closed: number;
};
