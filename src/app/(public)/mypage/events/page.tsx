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

  const [{ active, past, now }, turnstileSiteKey] = await Promise.all([
    getCustomerEventRegistrations(customer.id),
    getTurnstileSiteKey(),
  ]);

  // WAITLISTED_OFFERED のカウントダウン初期値算出用。`getCustomerEventRegistrations`
  // が active/past 判定に使った `now` をそのまま再利用する（ここで改めて
  // `new Date()` を呼ぶと render 中の非決定的呼び出しになり React Compiler
  // purity rule 違反になるため。ドメイン層で完結させる方針は同関数の docstring
  // 参照）。client へは literal prop として渡すことで、hydration 時に client 側が
  // 独自に `Date.now()` を呼ぶことによる SSR/CSR 不一致も避けられる。
  const nowIso = now.toISOString();

  const serialize = (
    rows: Awaited<ReturnType<typeof getCustomerEventRegistrations>>["active"],
  ) =>
    toPlainArray(
      rows.map((reg) => ({
        ...reg,
        createdAt: reg.createdAt.toISOString(),
        cancelledAt: reg.cancelledAt?.toISOString() ?? null,
        waitlistedAt: reg.waitlistedAt?.toISOString() ?? null,
        offeredAt: reg.offeredAt?.toISOString() ?? null,
        expiresAt: reg.expiresAt?.toISOString() ?? null,
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
        nowIso={nowIso}
      />
    </Stack>
  );
}
