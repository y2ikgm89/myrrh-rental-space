import "server-only";

import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import type { InquiryDefaults } from "@/shared/lib/inquiry/defaults";

/**
 * 現在の顧客セッションから InquiryDefaults を派生する。
 *
 * - 未ログイン or Customer 未紐づけ時は空オブジェクトを返す。
 * - companyName は CORPORATE のみ意味を持つ (Zod refine 契約と整合)。
 * - email は Customer.email を優先 (Better Auth User.email と通常一致)。
 *
 * Server Component (例: contact/page.tsx) から呼び、SectionRenderer に prop
 * として渡す。`cache()` 済みの `getCurrentCustomerUser()` を内部利用するため
 * リクエスト単位で de-duplicate される。
 */
export async function getInquiryDefaultsForCurrentCustomer(): Promise<InquiryDefaults> {
  const user = await getCurrentCustomerUser();
  if (!user) return {};

  const customer = await getCustomerByUserId(user.id);
  if (!customer) {
    // Customer 未紐づけ (ensureCustomerLinked 未経由) — email のみ流す。
    return { email: user.email };
  }

  const defaults: InquiryDefaults = {
    customerType: customer.customerType,
    email: customer.email,
    lastName: customer.lastName,
    firstName: customer.firstName,
    ...(customer.companyName !== null && {
      companyName: customer.companyName,
    }),
  };
  return defaults;
}
