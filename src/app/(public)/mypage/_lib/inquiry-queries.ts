import "server-only";

import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import {
  getCustomerInquiries as getCustomerInquiriesRaw,
  getCustomerInquiryById as getCustomerInquiryByIdRaw,
} from "@/shared/domain/inquiries/customer-queries";

export async function getCustomerInquiries(customerId: string) {
  const inquiries = await getCustomerInquiriesRaw(customerId);
  return toPlainArray(inquiries);
}

export async function getCustomerInquiryById(
  inquiryId: string,
  customerId: string,
) {
  const inquiry = await getCustomerInquiryByIdRaw(inquiryId, customerId);
  return toPlainObject(inquiry);
}
