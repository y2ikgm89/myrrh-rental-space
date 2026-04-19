/**
 * /mypage/events — イベント申込一覧
 *
 * 顧客のイベント申込一覧を表示。キャンセルは CONFIRMED のみ可能。
 */

import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { isCustomerProfileComplete } from "@/shared/domain/customers/profile-check";
import { getCustomerEventRegistrations } from "@/shared/domain/events/registration-queries";
import { toPlainArray } from "@/shared/lib/serialize";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { EventRegistrationList } from "./_components/event-registration-list";

export default async function MypageEventsPage(): Promise<ReactElement> {
  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const registrations = await getCustomerEventRegistrations(customer.id);

  const isNameIncomplete = !isCustomerProfileComplete(customer);

  const serializedRegistrations = toPlainArray(
    registrations.map((reg) => ({
      ...reg,
      createdAt: reg.createdAt.toISOString(),
      cancelledAt: reg.cancelledAt?.toISOString() ?? null,
      event: {
        ...reg.event,
        startTime: reg.event.startTime.toISOString(),
        endTime: reg.event.endTime.toISOString(),
      },
    })),
  );

  return (
    <Stack gap="lg">
      <Heading level={1}>イベント申込一覧</Heading>
      {isNameIncomplete && (
        <div className="border border-accent/30 bg-accent/5 p-4 text-sm text-foreground">
          お名前が未登録です。
          <Link href="/mypage/settings" className="ml-1 underline text-accent">
            アカウント設定
          </Link>
          から姓名を入力してください。
        </div>
      )}
      <EventRegistrationList registrations={serializedRegistrations} />
    </Stack>
  );
}
