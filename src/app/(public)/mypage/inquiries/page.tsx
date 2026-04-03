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
import { Stack } from "@/public/components/design-system/stack";
import { InquiryList } from "./_components/inquiry-list";

export default async function MypageInquiriesPage(): Promise<ReactElement> {
  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const inquiries = await getCustomerInquiries(customer.id);

  return (
    <Stack gap="lg">
      <Heading level={1} accent>
        お問い合わせ履歴
      </Heading>
      {inquiries.length === 0 ? (
        <div className="border border-border bg-surface p-6 md:p-12 text-center">
          <p className="text-muted-foreground">
            お問い合わせ履歴がありません。
          </p>
        </div>
      ) : (
        <InquiryList inquiries={inquiries} />
      )}
    </Stack>
  );
}
