/**
 * /mypage/inquiries — お問い合わせ一覧ページ
 *
 * 顧客のお問い合わせ一覧を表示。
 */

import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { isCustomerProfileComplete } from "@/shared/domain/customers/profile-check";
import { getCustomerInquiries } from "../_lib/inquiry-queries";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { Button } from "@/public/components/design-system/button";
import { InquiryList } from "./_components/inquiry-list";

export default async function MypageInquiriesPage(): Promise<ReactElement> {
  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const inquiries = await getCustomerInquiries(customer.id);

  const isNameIncomplete = !isCustomerProfileComplete(customer);

  return (
    <Stack gap="lg">
      <Heading level={1}>お問い合わせ一覧</Heading>
      {isNameIncomplete && (
        <div className="border border-accent/30 bg-accent/5 p-4 text-sm text-foreground">
          お名前が未登録です。
          <Link href="/mypage/settings" className="ml-1 underline text-accent">
            アカウント設定
          </Link>
          から姓名を入力してください。
        </div>
      )}
      {inquiries.length === 0 ? (
        <div className="py-16 md:py-24 text-center space-y-4">
          <p className="text-muted-foreground">お問い合わせはありません</p>
          <Button variant="editorial" size="sm" href="/contact">
            お問い合わせする
          </Button>
        </div>
      ) : (
        <InquiryList inquiries={inquiries} />
      )}
    </Stack>
  );
}
