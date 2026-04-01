/**
 * /mypage/events — イベント申込一覧
 *
 * 顧客のイベント申込一覧を表示。キャンセルは CONFIRMED のみ可能。
 */

import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { verifyCustomerSession } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerEventRegistrations } from "@/shared/domain/events/registration-queries";
import { toPlainArray } from "@/shared/lib/serialize";
import { Heading } from "@/public/components/design-system/heading";
import { EventRegistrationList } from "./_components/EventRegistrationList";

export default async function MypageEventsPage(): Promise<ReactElement> {
  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const registrations = await getCustomerEventRegistrations(customer.id);

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
    <div>
      <Heading level={1} className="mb-4 md:mb-8">
        イベント申込一覧
      </Heading>
      <EventRegistrationList registrations={serializedRegistrations} />
    </div>
  );
}
