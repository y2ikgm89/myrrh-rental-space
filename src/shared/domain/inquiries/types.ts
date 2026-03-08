import type { InquiryStatus } from "@/shared/db/enums";

export type InquiryData = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: InquiryStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type GetInquiriesResult = {
  inquiries: InquiryData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type InquiryFilters = {
  status?: InquiryStatus | "ALL";
  search?: string;
};

export type InquiryPagination = {
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
};

export type InquiryStats = {
  total: number;
  new: number;
  inProgress: number;
  resolved: number;
  closed: number;
};
