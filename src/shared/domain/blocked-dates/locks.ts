import "server-only";

import { BLOCKED_DATE_SCOPE } from "@/shared/lib/validations/enums/helpers";
import type { BlockedDateFormData } from "@/shared/lib/validations/blocked-date";
import { lockSpaceForTransaction } from "@/shared/domain/reservations/space-locks";

type BlockedDateLockClient = {
  readonly $executeRaw: (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<unknown>;
  readonly space: {
    findMany(args: object): Promise<{ id: string }[]>;
  };
};

export type BlockedDateLockTarget = Pick<
  BlockedDateFormData,
  "scope" | "spaceId" | "locationId"
>;

/**
 * BlockedDate 書込時に予約 create 経路（728351 space lock）と直列化する。
 * GLOBAL / LOCATION は影響 space を id 昇順で lock し deadlock を防ぐ。
 */
export async function acquireBlockedDateWriteLocks(
  tx: BlockedDateLockClient,
  data: BlockedDateLockTarget,
): Promise<void> {
  if (data.scope === BLOCKED_DATE_SCOPE.SPACE) {
    if (!data.spaceId) {
      return;
    }
    await lockSpaceForTransaction(tx, data.spaceId);
    return;
  }

  const spaceFilter =
    data.scope === BLOCKED_DATE_SCOPE.LOCATION && data.locationId
      ? { locationId: data.locationId, deletedAt: null }
      : { deletedAt: null };

  const spaces = await tx.space.findMany({
    where: spaceFilter,
    select: { id: true },
    orderBy: { id: "asc" },
  });

  for (const space of spaces) {
    await lockSpaceForTransaction(tx, space.id);
  }
}
