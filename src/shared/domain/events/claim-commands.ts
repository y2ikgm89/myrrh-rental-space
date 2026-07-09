import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * ゲストのイベント参加申込（`customerId: null`）を会員Customerへ紐付ける。
 *
 * `customerId: null` であることそのものが「未claim」のガードになるため、
 * 予約（`reservations/claim-commands.ts`）のような事前読み取りは不要で、
 * 単発の updateMany で「先着1名のみ成立」が保証される。
 */
export async function claimEventRegistrationForCustomer(
  eventRegistrationId: string,
  toCustomerId: string,
): Promise<{ claimed: boolean }> {
  const result = await prisma.eventRegistration.updateMany({
    where: { id: eventRegistrationId, customerId: null },
    data: { customerId: toCustomerId },
  });
  if (result.count > 0) {
    return { claimed: true };
  }

  // 既にclaim済みの場合、それが「自分」自身へのclaimなら idempotent に成功扱いする。
  const current = await prisma.eventRegistration.findUnique({
    where: { id: eventRegistrationId },
    select: { customerId: true },
  });
  return { claimed: current?.customerId === toCustomerId };
}
