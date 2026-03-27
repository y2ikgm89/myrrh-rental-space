/**
 * /mypage/inquiries — お問い合わせ履歴ページ
 *
 * 顧客のお問い合わせ一覧を表示。
 */

import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { verifyCustomerSession } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerInquiries } from "../_lib/inquiry-queries";
import { Heading } from "@/public/components/design-system/heading";
import { InquiryList } from "./_components/inquiry-list";

export default async function MypageInquiriesPage(): Promise<ReactElement> {
  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const inquiries = await getCustomerInquiries(customer.id);

  return (
    <div>
      <Heading level={2}>お問い合わせ履歴</Heading>
      <div className="mt-6">
        {inquiries.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-12 text-center">
            <p className="text-muted-foreground">
              お問い合わせ履歴がありません。
            </p>
          </div>
        ) : (
          <InquiryList inquiries={inquiries} />
        )}
      </div>
    </div>
  );
}
