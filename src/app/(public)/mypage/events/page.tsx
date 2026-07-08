/**
 * /mypage/events — イベント申込一覧
 *
 * 顧客のイベント申込を「これから / 過去」タブで表示。キャンセルは CONFIRMED のみ可能。
 */

import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerEventRegistrations } from "@/shared/domain/events/registration-queries";
import { toPlainArray } from "@/shared/lib/serialize";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { EventRegistrationTabs } from "./_components/event-registration-tabs";

export default async function MypageEventsPage(): Promise<ReactElement> {
  await connection();

  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const [{ active, past }, turnstileSiteKey] = await Promise.all([
    getCustomerEventRegistrations(customer.id),
    getTurnstileSiteKey(),
  ]);

  const serialize = (
    rows: Awaited<ReturnType<typeof getCustomerEventRegistrations>>["active"],
  ) =>
    toPlainArray(
      rows.map((reg) => ({
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
      <Heading level={1}>イベント</Heading>
      <EventRegistrationTabs
        activeItems={serialize(active)}
        pastItems={serialize(past)}
        turnstileSiteKey={turnstileSiteKey}
      />
    </Stack>
  );
}
